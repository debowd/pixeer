import { DomService } from 'pixeer';
import type { InteractiveElement } from 'pixeer';
import { fingerprintState } from './fingerprint.js';
import { graphToAppContext, graphToMermaid, staticScanAppContext } from './exporter.js';
import type {
  ExplorerOptions,
  ExplorationGraph,
  ExplorationResult,
  PixeerExplorer,
  StateNode,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip positional and attribute qualifiers so similar selectors group together. */
function selectorBase(selector: string): string {
  return selector
    .replace(/\[(?!aria-label)[^\]]*\]/g, '') // strip most attribute selectors
    .replace(/:nth-(?:child|of-type)\([^)]*\)/g, '') // strip nth-child
    .replace(/:\S+\([^)]*\)/g, '') // strip other pseudo-classes with args
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Select which elements to explore on a given node:
 * - Enabled interactive elements with a meaningful name
 * - Skips plain text inputs (can't type meaningfully without LLM)
 * - Collapses repeated patterns to one representative
 */
function selectActionable(
  elements: InteractiveElement[],
  skipInputTypes: string[],
  skipSelectors: string[],
  threshold: number,
): InteractiveElement[] {
  const EXPLORABLE_TYPES = new Set([
    'button',
    'link',
    'checkbox',
    'radio',
    'select',
    'combobox',
    'menuitem',
    'tab',
  ]);

  const candidates = elements.filter((el) => {
    if (!el.enabled || !el.name) return false;

    // Skip explicit input subtypes the caller wants to ignore
    const inputSubtype = el.metadata?.type ?? '';
    if (skipInputTypes.includes(inputSubtype)) return false;

    // Skip by selector fragment
    if (skipSelectors.some((s) => el.selector.includes(s))) return false;

    // Keep explorable types, or anything labelled as a non-text input
    if (EXPLORABLE_TYPES.has(el.type)) return true;
    if (el.type.startsWith('input:') && !skipInputTypes.includes(el.type.slice(6))) return true;

    return false;
  });

  // Pattern collapse: group by selector base + type; keep only first N representatives
  const groups = new Map<string, InteractiveElement[]>();
  for (const el of candidates) {
    const key = `${el.type}::${selectorBase(el.selector)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(el);
  }

  const result: InteractiveElement[] = [];
  for (const group of groups.values()) {
    if (group.length >= threshold) {
      result.push(group[0]);
    } else {
      result.push(...group);
    }
  }

  return result;
}

async function captureState(): Promise<StateNode> {
  const elements = await DomService.getInteractiveElements();
  const url = typeof location !== 'undefined' ? location.href : 'about:blank';
  const title = typeof document !== 'undefined' ? document.title : '';
  const id = fingerprintState(url, elements);
  return { id, url, title, elements };
}

async function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function undoAction(baselineUrl: string, changed: boolean): Promise<void> {
  if (!changed) return;

  if (typeof location !== 'undefined' && location.href !== baselineUrl) {
    history.back();
    await new Promise<void>((resolve) => {
      const onPop = () => {
        window.removeEventListener('popstate', onPop);
        resolve();
      };
      window.addEventListener('popstate', onPop);
      // Fallback in case no popstate fires (same-origin SPA guards, etc.)
      setTimeout(resolve, 800);
    });
  } else if (typeof document !== 'undefined') {
    // Try Escape to dismiss modals / dropdowns
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a BFS exploration engine that discovers your app's interactive
 * state graph, then outputs a `PixeerAppContext` you can paste directly into
 * `createPixeerBridge({ appContext: ... })`.
 *
 * @example
 * ```ts
 * // Run in your browser devtools or a Playwright script:
 * import { createPixeerExplorer } from '@pixeer/explorer';
 *
 * const { appContext, diagram } = await createPixeerExplorer({
 *   maxDepth: 2,
 *   onProgress: (e) => console.log(e),
 * }).explore();
 *
 * console.log(JSON.stringify(appContext, null, 2)); // paste into your bridge config
 * console.log(diagram); // Mermaid diagram for docs
 * ```
 */
export function createPixeerExplorer(options: ExplorerOptions = {}): PixeerExplorer {
  const {
    maxDepth = 2,
    maxBranches = 8,
    settleMs = 300,
    skipInputTypes = ['text', 'password', 'email', 'number', 'search', 'tel', 'url'],
    skipSelectors = [],
    patternCollapseThreshold = 3,
    onProgress,
  } = options;

  return {
    async explore(): Promise<ExplorationResult> {
      const startTime = performance.now();
      const graph: ExplorationGraph = { nodes: {}, edges: [], rootId: '' };
      let actionsAttempted = 0;

      // Seed with the current DOM state
      const root = await captureState();
      graph.rootId = root.id;
      graph.nodes[root.id] = root;

      const queue: Array<{ nodeId: string; depth: number }> = [
        { nodeId: root.id, depth: 0 },
      ];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const item = queue.shift()!;
        const { nodeId, depth } = item;

        if (visited.has(nodeId) || depth >= maxDepth) continue;
        visited.add(nodeId);

        onProgress?.({
          type: 'node:enter',
          nodeId,
          depth,
          nodesVisited: visited.size,
        });

        const node = graph.nodes[nodeId];
        const actionable = selectActionable(
          node.elements,
          skipInputTypes,
          skipSelectors,
          patternCollapseThreshold,
        );

        for (const el of actionable.slice(0, maxBranches)) {
          actionsAttempted++;
          const baselineUrl = typeof location !== 'undefined' ? location.href : 'about:blank';

          onProgress?.({ type: 'action:start', nodeId, actionName: el.name, depth });

          try {
            const clicked = el.name
              ? await DomService.clickByName(el.name)
              : DomService.click(el.selector);

            if (!clicked) continue;

            await settle(settleMs);

            const next = await captureState();
            const changed = next.id !== nodeId;

            graph.edges.push({
              from: nodeId,
              to: next.id,
              action: { type: 'click', name: el.name, selector: el.selector },
            });

            if (!graph.nodes[next.id]) {
              graph.nodes[next.id] = next;
            }

            if (!visited.has(next.id) && depth + 1 < maxDepth) {
              queue.push({ nodeId: next.id, depth: depth + 1 });
            }

            await undoAction(baselineUrl, changed);
            await settle(settleMs);
          } catch {
            // Individual action failures must not abort the whole exploration
          }

          onProgress?.({ type: 'action:done', nodeId, actionName: el.name, depth });
        }
      }

      onProgress?.({ type: 'done', nodesVisited: visited.size });

      return {
        graph,
        appContext: graphToAppContext(graph),
        diagram: graphToMermaid(graph),
        stats: {
          nodesVisited: visited.size,
          actionsAttempted,
          durationMs: performance.now() - startTime,
        },
      };
    },
  };
}

/**
 * Instant, non-blocking alternative to BFS exploration.
 *
 * Reads ARIA metadata already present in the DOM — `aria-controls` content
 * previews, `aria-haspopup`, `aria-expanded`, `data-pixeer` hints — and
 * returns a `PixeerAppContext` in under 200 ms with zero UI disruption.
 *
 * Best practice: call this on every route change to keep context fresh.
 * Fall back to `createPixeerExplorer().explore()` in a separate window
 * for elements that have no ARIA signals.
 */
export async function quickScan(): Promise<ExplorationResult> {
  const startTime = performance.now();
  const elements = await DomService.getInteractiveElements();
  const url = typeof location !== 'undefined' ? location.href : 'about:blank';
  const title = typeof document !== 'undefined' ? document.title : '';
  const id = fingerprintState(url, elements);

  const node: StateNode = { id, url, title, elements };
  const graph: ExplorationGraph = { nodes: { [id]: node }, edges: [], rootId: id };

  return {
    graph,
    appContext: staticScanAppContext(url, title, elements),
    diagram: graphToMermaid(graph),
    stats: {
      nodesVisited: 1,
      actionsAttempted: 0,
      durationMs: performance.now() - startTime,
    },
  };
}
