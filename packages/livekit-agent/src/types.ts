// ---------------------------------------------------------------------------
// Minimal LiveKit room interfaces — mirror the subset we use from livekit-client
// and @livekit/agents without importing either package directly.
// ---------------------------------------------------------------------------

export interface PerformRpcOptions {
  destinationIdentity: string;
  method: string;
  payload: string;
  responseTimeout?: number;
}

export interface LiveKitParticipant {
  identity: string;
  /** JSON-stringified metadata set when the participant connected. */
  metadata?: string;
}

export interface LiveKitRoom {
  localParticipant: {
    performRpc(options: PerformRpcOptions): Promise<string>;
  };
  remoteParticipants: Map<string, LiveKitParticipant>;
}

// Re-export PixeerAppContext from the core package so consumers can import
// it from a single place when wiring up both the bridge and the voice agent.
export type { PixeerAppContext, PixeerViewContext } from 'pixeer';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Calls a Pixeer bridge RPC method on the browser tab. */
export type RpcCaller = (method: string, params?: unknown) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveryQuestion {
  /** Stable identifier — used as the key in DiscoveryResult.answers */
  id: string;
  /** The question spoken/shown to the user at session start. */
  question: string;
  /**
   * Optional context hint appended to the system prompt after this answer
   * to help the LLM personalise its guidance.
   * @example "if the user says 'developer', focus on API and settings pages"
   */
  contextHint?: string;
}

export interface DiscoveryResult {
  answers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Agent setup callback
// ---------------------------------------------------------------------------

export interface AgentSetup {
  /** The LiveKit agent context (cast from @livekit/agents AgentContext). */
  ctx: AgentContext;
  /**
   * Pixeer tool definitions keyed by tool name.
   * Each value is the exact input shape accepted by `llm.tool()` from `@livekit/agents`.
   * Wrap the entries before passing to `voice.Agent`:
   *
   * @example
   * import { llm, voice } from '@livekit/agents';
   * const lkTools = Object.fromEntries(
   *   Object.entries(tools).map(([k, v]) => [k, llm.tool(v)])
   * );
   * new voice.Agent({ instructions: systemPrompt, tools: lkTools });
   */
  tools: PixeerFunctionContext;
  /** Fully-built system prompt including discovery context if configured. */
  systemPrompt: string;
  /** Direct RPC caller — use for custom tool implementations or side effects. */
  call: RpcCaller;
  /** Identity of the browser participant in the LiveKit room. */
  browserIdentity: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PixeerToolsOptions {
  /** Include only these tool names. Includes all when omitted. */
  include?: string[];
  /** Exclude specific tool names. */
  exclude?: string[];
}

export interface PixeerVoiceAgentOptions {
  /**
   * Override the default system prompt.
   * The default instructs the agent to narrate actions, confirm destructive
   * steps, and keep narrations short.
   */
  systemPrompt?: string;
  /**
   * App-level context — the same object you pass to `createPixeerBridge`.
   * The static parts (app description, all routes, schemas) are baked into
   * the system prompt so the voice/tour agent can plan multi-step flows before
   * it even calls dom.getContext for the first time.
   *
   * Dynamic parts (getCurrentView, element hints) are handled by the bridge at
   * runtime — no need to duplicate them here.
   *
   * @example
   * ```ts
   * const appCtx: PixeerAppContext = {
   *   app: 'Nexora fintech dashboard',
   *   routes: { '/accounts': 'Bank accounts with send/receive' },
   * };
   * // Use the same object in both places:
   * createPixeerBridge(transport, { appContext: appCtx });
   * withPixeerTools({ appContext: appCtx }, async ({ systemPrompt }) => { ... });
   * ```
   */
  appContext?: import('pixeer').PixeerAppContext;
  /**
   * Questions asked at session start to learn the user's role and goals.
   * Answers are embedded in the system prompt so the LLM personalises guidance.
   * The LLM handles the conversation — no separate STT/TTS phase required.
   */
  discoveryQuestions?: DiscoveryQuestion[];
  /** Filter which Pixeer tools are exposed to the LLM. */
  toolsOptions?: PixeerToolsOptions;
  /**
   * Override browser participant resolution.
   * Default: prefer participant with `{ type: 'pixeer-browser' }` metadata;
   * fall back to first remote participant.
   */
  getBrowserIdentity?: (participants: Map<string, LiveKitParticipant>) => string | undefined;
  /** Called after every successful Pixeer RPC action. */
  onAction?: (method: string, params: unknown, result: unknown) => void;
  /**
   * Called once the Pixeer utilities are ready — this is where you build your
   * VoicePipelineAgent or AgentSession using the provided fncCtx and systemPrompt.
   *
   * The entry function returns after this callback resolves, so keep the pipeline
   * running with `agent.start(ctx.room)` + `await ctx.waitForDisconnect()`.
   */
  onSetup: (setup: AgentSetup) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Function context types (compatible with @livekit/agents fncCtx)
// ---------------------------------------------------------------------------

import type { ZodTypeAny } from 'zod';

export interface PixeerTool {
  description: string;
  parameters: ZodTypeAny;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export type PixeerFunctionContext = Record<string, PixeerTool>;

// ---------------------------------------------------------------------------
// Agent entry types
// ---------------------------------------------------------------------------

/** Minimal subset of @livekit/agents AgentContext that we use. */
export interface AgentContext {
  /** Connect the agent to the LiveKit room. Must be called first. */
  connect(): Promise<void>;
  room: LiveKitRoom;
  /** Resolves when the room disconnects — await to keep the entry alive. */
  waitForDisconnect?(): Promise<void>;
}

/** The entry function signature expected by defineAgent from @livekit/agents. */
export type AgentEntry = (ctx: AgentContext) => Promise<void>;
