import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixeerAnalytics } from '../analytics';
import { createPixeerBridge } from '../bridge';
import type { PixeerTransport } from '../types';

function makeTransport() {
  const handlers = new Map<string, (p: string) => Promise<string>>();
  const transport: PixeerTransport = {
    onMethod(method, handler) { handlers.set(method, handler); },
    dispose: vi.fn(),
  };
  return {
    transport,
    call(method: string, payload: unknown = {}) {
      const h = handlers.get(method);
      if (!h) throw new Error(`No handler: ${method}`);
      return h(JSON.stringify(payload));
    },
  };
}

describe('PixeerAnalytics', () => {
  let analytics: PixeerAnalytics;

  beforeEach(() => {
    analytics = new PixeerAnalytics('test-session');
  });

  it('generates a sessionId', () => {
    const a = new PixeerAnalytics();
    expect(a.sessionId).toMatch(/^px_/);
  });

  it('accepts a custom sessionId', () => {
    expect(analytics.sessionId).toBe('test-session');
  });

  it('emits events and records them in history', () => {
    analytics.emit({
      type: 'action:success',
      method: 'dom.click',
      sessionId: 'test-session',
      timestamp: Date.now(),
      durationMs: 42,
      success: true,
    });

    const history = analytics.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].method).toBe('dom.click');
    expect(history[0].type).toBe('action:success');
  });

  it('on() fires handler for matching event type', () => {
    const handler = vi.fn();
    analytics.on('action:success', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on("*") fires for every event type', () => {
    const handler = vi.fn();
    analytics.on('*', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now() });
    analytics.emit({ type: 'snapshot:taken', method: 'dom.getContext', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('on() returns an unsubscribe function', () => {
    const handler = vi.fn();
    const off = analytics.on('action:success', handler);

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    off();
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getStats() returns correct counts and success rate', () => {
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now(), durationMs: 10 });
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now(), durationMs: 20 });
    analytics.emit({ type: 'action:error', method: 'dom.type', sessionId: 'test-session', timestamp: Date.now(), durationMs: 5 });

    const stats = analytics.getStats();
    expect(stats.totalActions).toBe(3);
    expect(stats.successfulActions).toBe(2);
    expect(stats.failedActions).toBe(1);
    expect(stats.successRate).toBeCloseTo(2 / 3);
    expect(stats.methodCounts['dom.click']).toBe(2);
    expect(stats.methodCounts['dom.type']).toBe(1);
    expect(stats.methodErrors['dom.type']).toBe(1);
    expect(stats.methodErrors['dom.click']).toBeUndefined();
    expect(stats.avgDurationMs['dom.click']).toBeCloseTo(15);
    expect(stats.sessionId).toBe('test-session');
  });

  it('getStats() returns successRate of 1 when no actions recorded', () => {
    const stats = analytics.getStats();
    expect(stats.totalActions).toBe(0);
    expect(stats.successRate).toBe(1);
  });

  it('flush() returns history and clears it', () => {
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    const flushed = analytics.flush();
    expect(flushed).toHaveLength(1);
    expect(analytics.getHistory()).toHaveLength(0);
  });

  it('clear() wipes history and handlers', () => {
    const handler = vi.fn();
    analytics.on('action:success', handler);
    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });

    analytics.clear();

    analytics.emit({ type: 'action:success', method: 'dom.click', sessionId: 'test-session', timestamp: Date.now() });
    expect(analytics.getHistory()).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('createPixeerBridge analytics integration', () => {
  let analytics: PixeerAnalytics;
  let mock: ReturnType<typeof makeTransport>;

  beforeEach(() => {
    document.body.innerHTML = '';
    analytics = new PixeerAnalytics('bridge-session');
    mock = makeTransport();
    createPixeerBridge(mock.transport, { analytics, transportName: 'test' });
  });

  it('emits bridge:init on creation', () => {
    const inits = analytics.getHistory().filter((e) => e.type === 'bridge:init');
    expect(inits).toHaveLength(1);
    expect(inits[0].meta?.transport).toBe('test');
  });

  it('emits action:start and action:success for a successful click', async () => {
    document.body.innerHTML = '<button>Go</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Go' });

    const events = analytics.getHistory().filter((e) => e.method === 'dom.click');
    expect(events.map((e) => e.type)).toEqual(['action:start', 'action:success']);
    const success = events.find((e) => e.type === 'action:success')!;
    expect(success.success).toBe(true);
    expect(success.durationMs).toBeTypeOf('number');
  });

  it('emits action:error for a failed action', async () => {
    await mock.call('dom.click', {});

    const errors = analytics.getHistory().filter(
      (e) => e.type === 'action:error' && e.method === 'dom.click',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].success).toBe(false);
  });

  it('emits snapshot:taken with context metadata on dom.getContext', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    await mock.call('dom.getContext');

    const snapshots = analytics.getHistory().filter((e) => e.type === 'snapshot:taken');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].meta?.elementCount).toBeTypeOf('number');
    expect(snapshots[0].meta?.estimatedTokens).toBeTypeOf('number');
  });

  it('emits bridge:dispose on dispose()', () => {
    const bridge = createPixeerBridge(makeTransport().transport, { analytics, transportName: 'test' });
    bridge.dispose();

    const disposes = analytics.getHistory().filter((e) => e.type === 'bridge:dispose');
    expect(disposes).toHaveLength(1);
  });

  it('exposes analytics on the returned bridge handle', () => {
    const bridge = createPixeerBridge(makeTransport().transport, { analytics });
    expect(bridge.analytics).toBe(analytics);
  });

  it('getStats() after bridge actions returns correct method breakdown', async () => {
    document.body.innerHTML = '<button>Ok</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Ok' });
    await mock.call('dom.click', { name: 'Ok' });
    await mock.call('dom.scroll', { direction: 'down' });

    const stats = analytics.getStats();
    expect(stats.methodCounts['dom.click']).toBe(2);
    expect(stats.methodCounts['dom.scroll']).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('on() hook fires when bridge action completes', async () => {
    const successHandler = vi.fn();
    analytics.on('action:success', successHandler);

    document.body.innerHTML = '<button>Tap</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    await mock.call('dom.click', { name: 'Tap' });
    expect(successHandler).toHaveBeenCalledOnce();
    expect(successHandler.mock.calls[0][0].method).toBe('dom.click');
  });
});
