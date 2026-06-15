import type {
  PixeerCallerTransport,
  InteractiveElement,
  ComponentStateResult,
  ScrollDirection,
} from './types';
import type { DeltaResult } from './mutation-tracker';

export interface PixeerAgentOptions {
  /** Per-call timeout in ms. Overrides the transport default when set. */
  timeout?: number;
}

export interface PageContext {
  context: string;
  elements: InteractiveElement[];
}

export interface ScrollOptions {
  direction: ScrollDirection;
  amount?: number;
  /** Scroll a specific element by accessible name. */
  name?: string;
  /** Scroll a specific element by CSS selector. */
  selector?: string;
}

export interface PressKeyOptions {
  /** Target element by accessible name. */
  name?: string;
  /** Target element by CSS selector. */
  selector?: string;
}

/**
 * The agent-side client. Point it at any PixeerCallerTransport and it gives
 * you a fully-typed API over every bridge method running on the target page.
 *
 * ```ts
 * const agent = new PixeerAgent(createPostMessageCaller({ target: iframe.contentWindow }));
 *
 * const { context, elements } = await agent.getContext();
 * await agent.click('Submit');
 * await agent.type('Email', 'user@example.com');
 * await agent.pressKey('Enter');
 * ```
 */
export class PixeerAgent {
  private readonly transport: PixeerCallerTransport;

  constructor(transport: PixeerCallerTransport, _options?: PixeerAgentOptions) {
    this.transport = transport;
  }

  private async call<T>(method: string, payload: unknown = {}): Promise<T> {
    const raw = await this.transport.call(method, payload);
    return JSON.parse(raw) as T;
  }

  /**
   * Snapshot the page — returns semantic markdown and every interactive element.
   * This is what you feed into your LLM as context before deciding an action.
   */
  async getContext(): Promise<PageContext> {
    return this.call<PageContext>('dom.getContext');
  }

  /**
   * Click an element by its accessible name (button text, aria-label, placeholder, etc.).
   * This is the primary way to click — the same name a screen reader or user would use.
   */
  async click(name: string): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.click', { name });
    return res.success;
  }

  /**
   * Click the Nth element matching the accessible name (0-based).
   * Use when multiple elements share the same label (e.g. repeated "Receive" buttons).
   */
  async clickNth(name: string, nth: number): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.click', { name, nth });
    return res.success;
  }

  /**
   * Click an element by CSS selector. Use this when you need pinpoint precision
   * and the accessible name is ambiguous or missing.
   */
  async clickBySelector(selector: string): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.click', { selector });
    return res.success;
  }

  /**
   * Type text into an input or textarea by accessible name.
   * Fires the correct React/Vue/Angular-compatible events — the framework sees it.
   */
  async type(name: string, text: string): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.type', { name, text });
    return res.success;
  }

  /**
   * Type text into an input or textarea by CSS selector.
   */
  async typeBySelector(selector: string, text: string): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.type', { selector, text });
    return res.success;
  }

  /**
   * Scroll the page or a specific element.
   *
   * ```ts
   * await agent.scroll({ direction: 'down' });
   * await agent.scroll({ direction: 'up', amount: 500, name: 'Results list' });
   * ```
   */
  async scroll(options: ScrollOptions): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.scroll', options);
    return res.success;
  }

  /**
   * Press a keyboard key, optionally targeting a specific element.
   * Supports Enter, Escape, Tab, ArrowUp/Down/Left/Right, Backspace, and any character.
   *
   * ```ts
   * await agent.pressKey('Enter');
   * await agent.pressKey('Escape', { name: 'Search' });
   * ```
   */
  async pressKey(key: string, options?: PressKeyOptions): Promise<boolean> {
    const res = await this.call<{ success: boolean }>('dom.pressKey', { key, ...options });
    return res.success;
  }

  /**
   * Read a React component's current props and state by component display name.
   * Returns null if the component is not found on the page.
   */
  async getComponentState(componentName: string): Promise<ComponentStateResult | null> {
    const res = await this.call<{ state: ComponentStateResult | null }>('dom.getComponentState', {
      componentName,
    });
    return res.state;
  }

  /**
   * Pull only what changed on the page since the last call — far cheaper than
   * `getContext()` for incremental updates after an action.
   *
   * Requires `enableMutationTracker: true` on the bridge. If `needsFullSnapshot`
   * is true, fall back to `getContext()` — too many mutations occurred to diff.
   *
   * ```ts
   * const { deltas, needsFullSnapshot } = await agent.getDelta();
   * if (needsFullSnapshot) {
   *   const { context } = await agent.getContext();
   * } else {
   *   for (const delta of deltas) { ... }
   * }
   * ```
   */
  async getDelta(): Promise<DeltaResult> {
    return this.call<DeltaResult>('dom.getDelta');
  }

  /**
   * Capture the screen as a base64 JPEG string for vision models.
   * Requires `enableScreenCapture: true` on the host bridge.
   */
  async capture(): Promise<string> {
    const res = await this.call<{ image: string }>('screen.capture');
    return res.image;
  }

  /**
   * Wait for an element to appear in the DOM by accessible name.
   * Polls every 100ms until found or timeout (default 5s).
   * Returns true if found, false if timed out.
   */
  async waitForElement(name: string, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.call<{ found: boolean }>('dom.waitForElement', { name });
      if (res.found) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  /**
   * Tear down the underlying transport and reject any in-flight calls.
   */
  dispose(): void {
    this.transport.dispose();
  }
}
