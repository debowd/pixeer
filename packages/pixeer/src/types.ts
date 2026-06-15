/**
 * An interactive element your agent can see on the page.
 */
export interface InteractiveElement {
  /** The accessible name your agent can use to refer to this element */
  name: string;
  /** CSS selector you can pass to click() or type() to target this element */
  selector: string;
  /** What kind of element this is (button, link, input, etc.) */
  type: string;
  /** Whether the user can currently interact with this element */
  enabled: boolean;
  /** Extra details like input type, placeholder, href, etc. */
  metadata?: Record<string, string>;
}

/**
 * What you get back when you inspect a React component's state.
 */
export interface ComponentStateResult {
  props: Record<string, unknown>;
  state: Record<string, unknown> | null;
}

/**
 * Implement this interface to connect Pixeer to your transport.
 *
 * Whether you're using WebSocket, postMessage, LiveKit, or something else entirely,
 * just wire up `onMethod` so your agent's calls reach the right handler.
 */
export interface PixeerTransport {
  /** Register a handler that your agent can call by method name */
  onMethod(method: string, handler: (payload: string) => Promise<string>): void;
  /**
   * Push an unsolicited notification to the caller.
   * Optional — only transports that support server-initiated messages need to implement this.
   * Required for `dom.subscribe` delta streaming to work.
   */
  notify?: (method: string, payload: string) => void;
  /** Clean up when you're done — unregister all handlers */
  dispose(): void;
}

/**
 * Options you can pass to createPixeerBridge.
 */
// ---------------------------------------------------------------------------
// App context enrichment
// ---------------------------------------------------------------------------

/**
 * Per-route/view description injected into every dom.getContext response.
 * Describes what the view shows and what key interactive elements do.
 */
export interface PixeerViewContext {
  /** What this view shows and what's possible here. */
  description: string;
  /**
   * Per-element action hints: key = element's aria-label (exact).
   * Tells the agent what happens when the element is activated —
   * e.g. what UI reveals, what modal opens, what data loads.
   */
  elements?: Record<string, string>;
}

/**
 * App-level context injected at the top of every dom.getContext response.
 * Gives the agent a mental model of the app's structure and behaviour —
 * solving the "local horizon" problem where the agent only sees what's
 * currently rendered and doesn't know what actions will reveal next.
 *
 * @example
 * ```ts
 * createPixeerBridge(transport, {
 *   appContext: {
 *     app: 'Nexora fintech dashboard',
 *     routes: {
 *       '/dashboard/accounts': {
 *         description: 'List of savings and checking accounts.',
 *         elements: {
 *           'Receive': 'Opens receive panel with IBAN, routing number, and QR code',
 *           'Send': 'Opens send money modal with amount and recipient fields',
 *         },
 *       },
 *     },
 *     schemas: {
 *       Account: '{ id, name, iban, routingNumber, balance (USD cents), type: "savings"|"checking" }',
 *     },
 *   },
 * });
 * ```
 */
export interface PixeerAppContext {
  /** High-level description of the app — model, domain, purpose. */
  app?: string;
  /**
   * Route → view description map.
   * The longest matching path prefix wins when determining the current view.
   * Keys should be URL path prefixes (e.g. '/dashboard/accounts').
   */
  routes?: Record<string, string | PixeerViewContext>;
  /**
   * Dynamic current-view resolver — called on every dom.getContext.
   * Returning undefined falls back to `routes` path matching.
   * Use when view depends on client-side state, not just the URL.
   */
  getCurrentView?: () => string | PixeerViewContext | undefined;
  /**
   * Data schema descriptions included in every context snapshot.
   * Values can be plain-text descriptions or JSON Schema objects.
   */
  schemas?: Record<string, string | object>;
}

export interface PixeerBridgeOptions {
  /** Set to true if you want your agent to be able to capture the screen (default: false) */
  enableScreenCapture?: boolean;
  /** JPEG quality for screen captures, 0-1 (default: 0.8) */
  captureQuality?: number;
  /** Pass a PixeerAnalytics instance to collect action events, stats, and hooks */
  analytics?: import('./analytics').PixeerAnalytics;
  /** Transport name — recorded in telemetry and analytics events (e.g. 'livekit', 'postmessage') */
  transportName?: string;
  /**
   * Enable DOM mutation tracking — exposes dom.getDelta and dom.subscribe RPC methods.
   * Agents can pull deltas instead of re-snapshotting the full page after every action.
   * @default false
   */
  enableMutationTracker?: boolean;
  /** Options forwarded to the MutationTracker (threshold, debounceMs). */
  mutationTrackerOptions?: import('./mutation-tracker').MutationTrackerOptions;
  /**
   * App-level context injected at the top of every dom.getContext response.
   * Solves the "local horizon" problem — agents learn what routes exist, what
   * buttons reveal, and what data schemas look like BEFORE executing actions.
   *
   * Pair with `data-pixeer` HTML attributes for per-element hints:
   * `<button aria-label="Receive" data-pixeer="Opens IBAN panel">Receive</button>`
   */
  appContext?: PixeerAppContext;
}

/**
 * The bridge handle you get back from createPixeerBridge.
 * Call dispose() when you're done to clean everything up.
 */
export interface PixeerBridge {
  /** Tear down all handlers and release resources */
  dispose(): void;
  /** The analytics instance attached to this bridge, if any */
  analytics?: import('./analytics').PixeerAnalytics;
}

/** Direction for scrolling */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * The caller-side transport interface — implement this to connect PixeerAgent
 * to any messaging layer (postMessage, BroadcastChannel, WebSocket, etc.).
 */
export interface PixeerCallerTransport {
  /** Send a method call and await the response payload string. */
  call(method: string, payload: unknown): Promise<string>;
  /** Tear down listeners and reject any in-flight calls. */
  dispose(): void;
}
