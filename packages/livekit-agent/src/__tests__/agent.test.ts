import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRpcCaller, resolveBrowserIdentity } from '../rpc.js';
import { createPixeerTools } from '../tools.js';
import { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from '../prompts.js';
import { createPixeerAgentEntry, withPixeerTools } from '../agent.js';
import type { LiveKitRoom, LiveKitParticipant, AgentContext, AgentSetup } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoom(
  participants: Array<{ identity: string; metadata?: string }> = [],
): LiveKitRoom {
  const performRpc = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }));
  const remoteParticipants = new Map(participants.map((p) => [p.identity, p]));
  return {
    localParticipant: { performRpc },
    remoteParticipants,
  };
}

function makeCtx(room: LiveKitRoom): AgentContext {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    room,
    waitForDisconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// resolveBrowserIdentity
// ---------------------------------------------------------------------------

describe('resolveBrowserIdentity', () => {
  it('uses custom resolver when provided and non-null', () => {
    const room = makeRoom([{ identity: 'browser-1' }, { identity: 'browser-2' }]);
    const identity = resolveBrowserIdentity(room, () => 'browser-2');
    expect(identity).toBe('browser-2');
  });

  it('falls back to metadata lookup when custom resolver returns undefined', () => {
    const room = makeRoom([
      { identity: 'other', metadata: '{}' },
      { identity: 'browser', metadata: JSON.stringify({ type: 'pixeer-browser' }) },
    ]);
    const identity = resolveBrowserIdentity(room, () => undefined);
    expect(identity).toBe('browser');
  });

  it('prefers pixeer-browser metadata over first participant', () => {
    const room = makeRoom([
      { identity: 'first', metadata: '{}' },
      { identity: 'tagged', metadata: JSON.stringify({ type: 'pixeer-browser' }) },
    ]);
    expect(resolveBrowserIdentity(room)).toBe('tagged');
  });

  it('falls back to first remote participant when no metadata match', () => {
    const room = makeRoom([{ identity: 'only-one' }]);
    expect(resolveBrowserIdentity(room)).toBe('only-one');
  });

  it('throws when room is empty', () => {
    const room = makeRoom([]);
    expect(() => resolveBrowserIdentity(room)).toThrow(/No browser participant/);
  });

  it('ignores malformed metadata and continues', () => {
    const room = makeRoom([
      { identity: 'bad', metadata: 'NOT_JSON' },
      { identity: 'good', metadata: JSON.stringify({ type: 'pixeer-browser' }) },
    ]);
    expect(resolveBrowserIdentity(room)).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// createRpcCaller
// ---------------------------------------------------------------------------

describe('createRpcCaller', () => {
  it('calls performRpc with correct destinationIdentity, method, and JSON payload', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const call = createRpcCaller(room, 'browser');

    await call('dom.click', { name: 'Submit' });

    expect(room.localParticipant.performRpc).toHaveBeenCalledWith({
      destinationIdentity: 'browser',
      method: 'dom.click',
      payload: JSON.stringify({ name: 'Submit' }),
    });
  });

  it('JSON-parses the response', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    (room.localParticipant.performRpc as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ success: true, value: 42 }),
    );
    const call = createRpcCaller(room, 'browser');
    const result = await call('dom.getContext', {});
    expect(result).toEqual({ success: true, value: 42 });
  });

  it('returns raw string when response is not valid JSON', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    (room.localParticipant.performRpc as ReturnType<typeof vi.fn>).mockResolvedValue('plain string');
    const call = createRpcCaller(room, 'browser');
    const result = await call('dom.getContext', {});
    expect(result).toBe('plain string');
  });

  it('sends empty object payload when params are omitted', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const call = createRpcCaller(room, 'browser');
    await call('dom.getContext');
    expect(room.localParticipant.performRpc).toHaveBeenCalledWith(
      expect.objectContaining({ payload: '{}' }),
    );
  });
});

// ---------------------------------------------------------------------------
// createPixeerTools
// ---------------------------------------------------------------------------

describe('createPixeerTools', () => {
  let call: ReturnType<typeof vi.fn>;
  let tools: ReturnType<typeof createPixeerTools>;

  beforeEach(() => {
    call = vi.fn().mockResolvedValue({ success: true });
    tools = createPixeerTools(call);
  });

  it('exposes the expected tool keys', () => {
    const keys = Object.keys(tools);
    expect(keys).toContain('get_page_context');
    expect(keys).toContain('click');
    expect(keys).toContain('type');
    expect(keys).toContain('scroll');
    expect(keys).toContain('press_key');
    expect(keys).toContain('get_component_state');
    expect(keys).toContain('get_page_delta');
  });

  it('each tool has description, parameters, and execute', () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, `${name}.description`).toBeTruthy();
      expect(tool.parameters, `${name}.parameters`).toBeDefined();
      expect(typeof tool.execute, `${name}.execute`).toBe('function');
    }
  });

  it('click tool calls dom.click with name', async () => {
    await tools.click.execute({ name: 'Submit' });
    expect(call).toHaveBeenCalledWith('dom.click', { name: 'Submit' });
  });

  it('click_by_selector tool calls dom.click with selector', async () => {
    await tools.click_by_selector.execute({ selector: '#submit-btn' });
    expect(call).toHaveBeenCalledWith('dom.click', { selector: '#submit-btn' });
  });

  it('type tool calls dom.type with name and text', async () => {
    await tools.type.execute({ name: 'Email', text: 'user@example.com' });
    expect(call).toHaveBeenCalledWith('dom.type', { name: 'Email', text: 'user@example.com' });
  });

  it('scroll tool calls dom.scroll with direction and optional fields', async () => {
    await tools.scroll.execute({ direction: 'down', amount: 500 });
    expect(call).toHaveBeenCalledWith('dom.scroll', { direction: 'down', amount: 500 });
  });

  it('press_key tool calls dom.pressKey', async () => {
    await tools.press_key.execute({ key: 'Enter' });
    expect(call).toHaveBeenCalledWith('dom.pressKey', { key: 'Enter' });
  });

  it('get_component_state calls dom.getComponentState with name', async () => {
    await tools.get_component_state.execute({ componentName: 'LoginForm' });
    expect(call).toHaveBeenCalledWith('dom.getComponentState', { name: 'LoginForm' });
  });

  it('get_page_delta calls dom.getDelta', async () => {
    await tools.get_page_delta.execute({});
    expect(call).toHaveBeenCalledWith('dom.getDelta', {});
  });

  it('get_page_context calls dom.getContext', async () => {
    await tools.get_page_context.execute({});
    expect(call).toHaveBeenCalledWith('dom.getContext', {});
  });

  describe('include/exclude filtering', () => {
    it('include limits tools to specified list', () => {
      const filtered = createPixeerTools(call, { include: ['click', 'type'] });
      expect(Object.keys(filtered)).toEqual(['click', 'type']);
    });

    it('exclude removes specified tools', () => {
      const filtered = createPixeerTools(call, { exclude: ['get_component_state', 'get_page_delta'] });
      expect(Object.keys(filtered)).not.toContain('get_component_state');
      expect(Object.keys(filtered)).not.toContain('get_page_delta');
      expect(Object.keys(filtered)).toContain('click');
    });
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('returns DEFAULT_SYSTEM_PROMPT when no options provided', () => {
    expect(buildSystemPrompt({})).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('uses custom systemPrompt when provided', () => {
    const custom = 'You are a custom assistant.';
    expect(buildSystemPrompt({ systemPrompt: custom })).toBe(custom);
  });

  it('appends discovery instructions when discoveryQuestions are provided', () => {
    const prompt = buildSystemPrompt({
      discoveryQuestions: [
        { id: 'role', question: "What's your role?" },
        { id: 'goal', question: 'What do you want to accomplish?' },
      ],
    });
    expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(prompt).toContain("What's your role?");
    expect(prompt).toContain('What do you want to accomplish?');
    expect(prompt).toContain('onboarding questions');
  });

  it('includes contextHint in discovery instructions', () => {
    const prompt = buildSystemPrompt({
      discoveryQuestions: [
        { id: 'role', question: 'What is your role?', contextHint: 'tailor API depth' },
      ],
    });
    expect(prompt).toContain('tailor API depth');
  });

  it('skips discovery section when discoveryQuestions is empty array', () => {
    const prompt = buildSystemPrompt({ discoveryQuestions: [] });
    expect(prompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('prepends static app context when appContext is provided', () => {
    const prompt = buildSystemPrompt({
      appContext: {
        app: 'Nexora fintech dashboard',
        routes: { '/accounts': 'Bank accounts with send/receive' },
        schemas: { Account: '{ id, name, balance }' },
      },
    });
    expect(prompt).toContain('Nexora fintech dashboard');
    expect(prompt).toContain('/accounts');
    expect(prompt).toContain('{ id, name, balance }');
    // Base prompt still present
    expect(prompt).toContain('voice-controlled');
  });

  it('combines appContext, base prompt, and discovery questions in order', () => {
    const prompt = buildSystemPrompt({
      appContext: { app: 'MyApp' },
      discoveryQuestions: [{ id: 'role', question: 'What is your role?' }],
    });
    const appIdx = prompt.indexOf('MyApp');
    const baseIdx = prompt.indexOf('voice-controlled');
    const discoveryIdx = prompt.indexOf('What is your role?');
    expect(appIdx).toBeLessThan(baseIdx);
    expect(baseIdx).toBeLessThan(discoveryIdx);
  });

  it('appContext without routes or schemas only shows app description', () => {
    const prompt = buildSystemPrompt({ appContext: { app: 'SimpleApp' } });
    expect(prompt).toContain('SimpleApp');
    expect(prompt).not.toContain('Navigation:');
    expect(prompt).not.toContain('Data schemas:');
  });
});

// ---------------------------------------------------------------------------
// createPixeerAgentEntry
// ---------------------------------------------------------------------------

describe('createPixeerAgentEntry', () => {
  it('calls ctx.connect() before setup', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);
    const onSetup = vi.fn().mockResolvedValue(undefined);

    const entry = createPixeerAgentEntry({ onSetup });
    await entry(ctx);

    expect(ctx.connect).toHaveBeenCalledOnce();
    expect(onSetup).toHaveBeenCalledAfter(ctx.connect as ReturnType<typeof vi.fn>);
  });

  it('passes correct setup object to onSetup', async () => {
    const room = makeRoom([{ identity: 'browser-tab' }]);
    const ctx = makeCtx(room);

    let captured: AgentSetup | undefined;
    const onSetup = vi.fn().mockImplementation(async (setup: AgentSetup) => {
      captured = setup;
    });

    await createPixeerAgentEntry({ onSetup })(ctx);

    expect(captured).toBeDefined();
    expect(captured!.ctx).toBe(ctx);
    expect(captured!.browserIdentity).toBe('browser-tab');
    expect(typeof captured!.tools.click?.execute).toBe('function');
    expect(captured!.systemPrompt).toContain('voice-controlled');
  });

  it('resolves browser identity from metadata', async () => {
    const room = makeRoom([
      { identity: 'other-agent' },
      { identity: 'the-browser', metadata: JSON.stringify({ type: 'pixeer-browser' }) },
    ]);
    const ctx = makeCtx(room);

    let capturedIdentity = '';
    await createPixeerAgentEntry({
      onSetup: async ({ browserIdentity }) => { capturedIdentity = browserIdentity; },
    })(ctx);

    expect(capturedIdentity).toBe('the-browser');
  });

  it('invokes onAction callback after each RPC call', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    (room.localParticipant.performRpc as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ success: true }),
    );
    const ctx = makeCtx(room);
    const onAction = vi.fn();

    let capturedSetup: AgentSetup | undefined;
    await createPixeerAgentEntry({
      onAction,
      onSetup: async (setup) => { capturedSetup = setup; },
    })(ctx);

    await capturedSetup!.tools.click.execute({ name: 'Go' });

    expect(onAction).toHaveBeenCalledWith('dom.click', { name: 'Go' }, { success: true });
  });

  it('applies toolsOptions include filter', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);

    let captured: AgentSetup | undefined;
    await createPixeerAgentEntry({
      toolsOptions: { include: ['click', 'scroll'] },
      onSetup: async (setup) => { captured = setup; },
    })(ctx);

    expect(Object.keys(captured!.tools)).toEqual(['click', 'scroll']);
  });

  it('uses custom getBrowserIdentity callback', async () => {
    const room = makeRoom([{ identity: 'tab-A' }, { identity: 'tab-B' }]);
    const ctx = makeCtx(room);

    let capturedIdentity = '';
    await createPixeerAgentEntry({
      getBrowserIdentity: () => 'tab-B',
      onSetup: async ({ browserIdentity }) => { capturedIdentity = browserIdentity; },
    })(ctx);

    expect(capturedIdentity).toBe('tab-B');
  });
});

// ---------------------------------------------------------------------------
// withPixeerTools
// ---------------------------------------------------------------------------

describe('withPixeerTools', () => {
  it('produces the same behaviour as createPixeerAgentEntry', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);
    const setup = vi.fn().mockResolvedValue(undefined);

    await withPixeerTools({}, setup)(ctx);

    expect(ctx.connect).toHaveBeenCalled();
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ browserIdentity: 'browser', systemPrompt: expect.any(String) }),
    );
  });

  it('forwards options to createPixeerAgentEntry', async () => {
    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);

    let captured: AgentSetup | undefined;
    await withPixeerTools(
      { systemPrompt: 'Custom prompt' },
      async (s) => { captured = s; },
    )(ctx);

    expect(captured!.systemPrompt).toBe('Custom prompt');
  });
});
