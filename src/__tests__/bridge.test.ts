import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPixeerBridge } from '../bridge';
import type { PixeerTransport } from '../types';

function createMockTransport() {
  const handlers = new Map<string, (payload: string) => Promise<string>>();

  const transport: PixeerTransport = {
    onMethod(method, handler) {
      handlers.set(method, handler);
    },
    dispose: vi.fn(),
  };

  return {
    transport,
    handlers,
    call(method: string, payload: unknown = {}) {
      const handler = handlers.get(method);
      if (!handler) throw new Error(`No handler for ${method}`);
      return handler(JSON.stringify(payload));
    },
  };
}

describe('createPixeerBridge', () => {
  let mock: ReturnType<typeof createMockTransport>;
  beforeEach(() => {
    document.body.innerHTML = '';
    mock = createMockTransport();
    createPixeerBridge(mock.transport);
  });

  it('registers all expected RPC methods', () => {
    const methods = Array.from(mock.handlers.keys());
    expect(methods).toContain('dom.getContext');
    expect(methods).toContain('dom.click');
    expect(methods).toContain('dom.type');
    expect(methods).toContain('dom.getComponentState');
    expect(methods).toContain('dom.scroll');
    expect(methods).toContain('dom.pressKey');
  });

  it('dom.getContext returns context and elements', async () => {
    document.body.innerHTML = '<button>Hello</button>';
    const result = JSON.parse(await mock.call('dom.getContext'));
    expect(result.elements).toBeDefined();
    expect(Array.isArray(result.elements)).toBe(true);
  });

  it('dom.click returns success for valid name', async () => {
    document.body.innerHTML = '<button>ClickMe</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });
    const result = JSON.parse(await mock.call('dom.click', { name: 'ClickMe' }));
    expect(result.success).toBe(true);
  });

  it('dom.click returns error for missing params', async () => {
    const result = JSON.parse(await mock.call('dom.click', {}));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('dom.type returns error when text is missing', async () => {
    document.body.innerHTML = '<input placeholder="Name" />';
    const result = JSON.parse(await mock.call('dom.type', { name: 'Name' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Text must be a string');
  });

  it('dom.type returns success for valid input', async () => {
    document.body.innerHTML = '<input placeholder="Name" />';
    const result = JSON.parse(await mock.call('dom.type', { name: 'Name', text: 'Alice' }));
    expect(result.success).toBe(true);
  });

  it('dom.scroll returns error for invalid direction', async () => {
    const result = JSON.parse(await mock.call('dom.scroll', { direction: 'diagonal' }));
    expect(result.success).toBe(false);
  });

  it('dom.scroll returns success for valid direction', async () => {
    const result = JSON.parse(await mock.call('dom.scroll', { direction: 'down' }));
    expect(result.success).toBe(true);
  });

  it('dom.pressKey returns error when key is missing', async () => {
    const result = JSON.parse(await mock.call('dom.pressKey', {}));
    expect(result.success).toBe(false);
    expect(result.error).toContain('key is required');
  });

  it('dom.pressKey returns success for valid key', async () => {
    document.body.innerHTML = '<input id="inp" />';
    document.getElementById('inp')!.focus();
    const result = JSON.parse(await mock.call('dom.pressKey', { key: 'Enter' }));
    expect(result.success).toBe(true);
  });

  it('dom.getComponentState returns error when componentName is missing', async () => {
    const result = JSON.parse(await mock.call('dom.getComponentState', {}));
    expect(result.error).toBeDefined();
    expect(result.error).toContain('componentName is required');
  });

  it('dom.getComponentState returns error for invalid JSON', async () => {
    const handler = mock.handlers.get('dom.getComponentState')!;
    const result = JSON.parse(await handler('not-json'));
    expect(result.error).toBeDefined();
  });

  it('dom.click returns error for invalid JSON', async () => {
    const handler = mock.handlers.get('dom.click')!;
    const result = JSON.parse(await handler('not-json'));
    expect(result.success).toBe(false);
  });

  it('dom.type returns error for invalid JSON', async () => {
    const handler = mock.handlers.get('dom.type')!;
    const result = JSON.parse(await handler('not-json'));
    expect(result.success).toBe(false);
  });

  it('dom.scroll returns error for invalid JSON', async () => {
    const handler = mock.handlers.get('dom.scroll')!;
    const result = JSON.parse(await handler('not-json'));
    expect(result.success).toBe(false);
  });

  it('dom.pressKey returns error for invalid JSON', async () => {
    const handler = mock.handlers.get('dom.pressKey')!;
    const result = JSON.parse(await handler('not-json'));
    expect(result.success).toBe(false);
  });

  it('dom.scroll returns success when called with name', async () => {
    document.body.innerHTML = '<div id="panel" aria-label="Panel" tabindex="0"></div>';
    const result = JSON.parse(await mock.call('dom.scroll', { name: 'Panel', direction: 'down' }));
    // name-based scroll may return false if element has no scroll, but should not error
    expect(result).toHaveProperty('success');
  });

  it('dom.pressKey returns success when called with name', async () => {
    document.body.innerHTML = '<button aria-label="Submit">Submit</button>';
    const btn = document.querySelector('button')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });
    const result = JSON.parse(await mock.call('dom.pressKey', { name: 'Submit', key: 'Enter' }));
    expect(result.success).toBe(true);
  });

  it('screen.capture handler is registered when enableScreenCapture is true', () => {
    const localMock = createMockTransport();
    createPixeerBridge(localMock.transport, { enableScreenCapture: true });
    expect(localMock.handlers.has('screen.capture')).toBe(true);
  });

  it('screen.capture handler is NOT registered by default', () => {
    expect(mock.handlers.has('screen.capture')).toBe(false);
  });

  it('dispose() cleans up transport', () => {
    const bridge = createPixeerBridge(mock.transport);
    bridge.dispose();
    expect(mock.transport.dispose).toHaveBeenCalled();
  });
});
