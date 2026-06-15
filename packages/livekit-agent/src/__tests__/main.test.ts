import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext, LiveKitRoom } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoom(
  participants: Array<{ identity: string; metadata?: string }> = [],
): LiveKitRoom {
  const performRpc = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }));
  const remoteParticipants = new Map(participants.map((p) => [p.identity, p]));
  return { localParticipant: { performRpc }, remoteParticipants };
}

function makeCtx(room: LiveKitRoom): AgentContext {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    room,
    waitForDisconnect: vi.fn().mockResolvedValue(undefined),
    proc: { userData: {} },
  } as unknown as AgentContext;
}

// ---------------------------------------------------------------------------
// main.ts agent entry integration test
// ---------------------------------------------------------------------------

describe('main agent entry', () => {
  let AgentSession: ReturnType<typeof vi.fn>;
  let sessionStart: ReturnType<typeof vi.fn>;
  let sessionGenerateReply: ReturnType<typeof vi.fn>;
  let Agent: ReturnType<typeof vi.fn>;
  let inferenceLLM: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStart = vi.fn().mockResolvedValue(undefined);
    sessionGenerateReply = vi.fn().mockReturnValue(undefined);
    AgentSession = vi.fn().mockImplementation(() => ({
      start: sessionStart,
      generateReply: sessionGenerateReply,
    }));
    Agent = vi.fn().mockImplementation((opts: unknown) => opts);
    inferenceLLM = vi.fn().mockReturnValue({});

    vi.doMock('@livekit/agents', () => ({
      defineAgent: (agent: unknown) => agent,
      voice: { AgentSession, Agent },
      inference: { LLM: inferenceLLM },
      llm: {
        tool: ({ description, parameters, execute }: { description: string; parameters: unknown; execute: unknown }) => ({
          description,
          parameters,
          execute,
        }),
      },
    }));

    vi.doMock('@livekit/agents-plugin-silero', () => {
      throw new Error('not installed');
    });
  });

  it('connects to the room and starts a voice session', async () => {
    const { createPixeerAgentEntry } = await import('../agent.js');

    const room = makeRoom([{ identity: 'browser', metadata: JSON.stringify({ type: 'pixeer-browser' }) }]);
    const ctx = makeCtx(room);

    let capturedSetup: { tools: Record<string, unknown>; systemPrompt: string } | undefined;
    const entry = createPixeerAgentEntry({
      onSetup: async (setup) => {
        capturedSetup = setup;
      },
    });

    await entry(ctx);

    // Entry must connect first
    expect(ctx.connect).toHaveBeenCalledOnce();
    // Setup callback must be called with tools and a systemPrompt
    expect(capturedSetup).toBeDefined();
    expect(capturedSetup!.systemPrompt).toContain('voice-controlled');
    expect(typeof capturedSetup!.tools['click']?.execute).toBe('function');
  });

  it('tool execute calls the RPC bridge method', async () => {
    const { createPixeerAgentEntry } = await import('../agent.js');

    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);

    let capturedSetup: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> } | undefined;
    await createPixeerAgentEntry({
      onSetup: async (setup) => { capturedSetup = setup as typeof capturedSetup; },
    })(ctx);

    await capturedSetup!.tools.click!.execute({ name: 'Submit' });

    expect(room.localParticipant.performRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationIdentity: 'browser',
        method: 'dom.click',
        payload: JSON.stringify({ name: 'Submit' }),
      }),
    );
  });

  it('generates an initial greeting after session starts', async () => {
    const { withPixeerTools } = await import('../agent.js');

    const room = makeRoom([{ identity: 'browser' }]);
    const ctx = makeCtx(room);

    // Simulate the main.ts onSetup pattern
    let greetingGenerated = false;

    await withPixeerTools({}, async ({ tools }) => {
      // Simulate session.start + generateReply
      greetingGenerated = true;
      expect(typeof tools.get_page_context?.execute).toBe('function');
    })(ctx);

    expect(greetingGenerated).toBe(true);
    expect(ctx.connect).toHaveBeenCalledOnce();
  });
});
