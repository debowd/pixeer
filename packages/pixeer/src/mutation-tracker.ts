import { RefMap } from './ref-map.js';

export interface DomDelta {
  type: 'added' | 'removed' | 'modified' | 'text';
  /** Stable element reference ID (el_1, el_2, …) */
  ref: string;
  /** CSS selector — present for added/modified */
  selector?: string;
  /** Tag name — present for added */
  tag?: string;
  /** Changed attribute name — present for attribute modifications */
  attribute?: string | null;
  /** Old value — present for attribute/text changes */
  oldValue?: string | null;
  /** New value — present for attribute/text changes */
  newValue?: string | null;
  /** Text preview of the added element's content — present for added nodes with text */
  preview?: string;
}

export interface MutationTrackerOptions {
  /**
   * Number of mutations after which getDelta returns needsFullSnapshot=true,
   * signalling the caller should re-run dom.getContext instead of accumulating.
   * @default 50
   */
  threshold?: number;
  /**
   * Debounce window in ms for coalescing rapid mutations before notifying subscribers.
   * @default 50
   */
  debounceMs?: number;
}

export interface DeltaResult {
  deltas: DomDelta[];
  /** True when the mutation count exceeded the threshold — caller should re-snapshot */
  needsFullSnapshot: boolean;
}

export interface MutationTracker {
  /**
   * Pull all accumulated deltas since the last call.
   * Resets the accumulator and the needsFullSnapshot flag.
   */
  getDelta(): DeltaResult;
  /**
   * Push subscription — handler fires whenever a debounced batch of mutations is ready.
   * Returns an unsubscribe function.
   */
  subscribe(handler: (deltas: DomDelta[]) => void): () => void;
  /** Direct access to the ref map so callers can resolve el_N ↔ Element. */
  readonly refs: RefMap;
  dispose(): void;
}

function quickSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  return el.tagName.toLowerCase();
}

/**
 * Attach a MutationObserver to the page and accumulate DOM deltas.
 * Returns null in non-browser environments (SSR-safe).
 *
 * @example
 * const tracker = createMutationTracker();
 * // … after some interactions …
 * const { deltas, needsFullSnapshot } = tracker.getDelta();
 */
export function createMutationTracker(
  options: MutationTrackerOptions = {},
): MutationTracker | null {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const { threshold = 50, debounceMs = 50 } = options;

  const refs = new RefMap();
  let pending: DomDelta[] = [];
  let mutationCount = 0;
  let overThreshold = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const subscribers = new Set<(deltas: DomDelta[]) => void>();

  // flush() notifies push-subscribers but does NOT clear pending —
  // getDelta() is the sole owner of the clear. This keeps pull and push
  // independent so callers using getDelta() don't lose deltas that fired
  // the debounce timer before their next poll.
  let pushCursor = 0; // index into pending up to which subscribers have been notified

  function flush(): void {
    if (pending.length <= pushCursor) return;
    const batch = pending.slice(pushCursor);
    pushCursor = pending.length;
    for (const sub of subscribers) {
      try { sub(batch); } catch { /* subscriber errors must not break the tracker */ }
    }
  }

  function scheduleFlush(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, debounceMs);
  }

  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    mutationCount += mutations.length;
    if (mutationCount > threshold) overThreshold = true;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          // Capture a brief text preview for added nodes so agents can read
          // what appeared without needing a full re-snapshot.
          const rawText = el.childElementCount < 30
            ? el.textContent?.trim().replace(/\s+/g, ' ')
            : undefined;
          const preview = rawText ? rawText.slice(0, 150) : undefined;
          pending.push({
            type: 'added',
            ref: refs.getOrCreate(el),
            selector: quickSelector(el),
            tag: el.tagName.toLowerCase(),
            ...(preview && { preview }),
          });
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          // Use existing ref if available; create one so it's in the result.
          pending.push({
            type: 'removed',
            ref: refs.getRef(el) ?? refs.getOrCreate(el),
          });
        }
      } else if (mutation.type === 'attributes') {
        const el = mutation.target as Element;
        pending.push({
          type: 'modified',
          ref: refs.getOrCreate(el),
          selector: quickSelector(el),
          attribute: mutation.attributeName,
          oldValue: mutation.oldValue,
          newValue: mutation.attributeName ? el.getAttribute(mutation.attributeName) : null,
        });
      } else if (mutation.type === 'characterData') {
        const parent = (mutation.target as CharacterData).parentElement;
        if (!parent) continue;
        pending.push({
          type: 'text',
          ref: refs.getOrCreate(parent),
          oldValue: mutation.oldValue,
          newValue: mutation.target.textContent,
        });
      }
    }

    scheduleFlush();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
  });

  return {
    getDelta(): DeltaResult {
      // Cancel any pending debounce — we're consuming the buffer now.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const deltas = pending;
      pending = [];
      pushCursor = 0;
      const needsFullSnapshot = overThreshold;
      overThreshold = false;
      mutationCount = 0;
      return { deltas, needsFullSnapshot };
    },

    subscribe(handler: (deltas: DomDelta[]) => void): () => void {
      subscribers.add(handler);
      return () => { subscribers.delete(handler); };
    },

    get refs(): RefMap {
      return refs;
    },

    dispose(): void {
      observer.disconnect();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      subscribers.clear();
      pending = [];
    },
  };
}
