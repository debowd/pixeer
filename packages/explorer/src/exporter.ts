import type { PixeerAppContext, PixeerViewContext, InteractiveElement } from 'pixeer';
import type { ExplorationGraph, StateNode } from './types.js';

function pathOf(url: string): string {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url;
  }
}

/**
 * Derive element hints by comparing the source node's elements to the target
 * node's elements — new names that appeared are what the action "reveals".
 */
function deriveHint(source: StateNode, target: StateNode): string {
  const targetPath = pathOf(target.url);
  const sourcePath = pathOf(source.url);

  if (targetPath !== sourcePath) {
    return `Navigates to ${targetPath}`;
  }

  const sourceNames = new Set(source.elements.map((e) => e.name));
  const revealed = target.elements
    .filter((e) => e.name && !sourceNames.has(e.name))
    .slice(0, 5)
    .map((e) => e.name);

  return revealed.length > 0 ? `Reveals: ${revealed.join(', ')}` : 'Reveals new content';
}

// ---------------------------------------------------------------------------
// Static (ARIA-only) hint derivation
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable hint from an element's ARIA metadata alone — no
 * clicking required. Reads aria-controls content, aria-haspopup, aria-expanded,
 * data-pixeer dev hints, and link hrefs.
 *
 * Returns undefined when there is genuinely nothing to infer.
 */
function hintFromAria(el: InteractiveElement): string | undefined {
  const m = el.metadata ?? {};

  // data-pixeer developer hint — most authoritative
  if (m.hint) return m.hint;

  // aria-controls: we already read the controlled element's text in dom-service
  // format is "id [hidden]: \"preview text\""
  if (m.controls) {
    const preview = (m.controls as string).match(/: "(.{1,80})"/);
    if (preview) return `Reveals: "${preview[1]}"`;
    const id = (m.controls as string).split(' ')[0];
    return `Reveals panel #${id}`;
  }

  // aria-haspopup tells us what kind of thing will open
  if (m.hasPopup && m.hasPopup !== 'false') {
    const kind = m.hasPopup as string;
    return `Opens ${kind === 'true' ? 'popup' : kind}`;
  }

  // collapsed element — we know it reveals something, just not what
  if (m.expanded === 'false') return 'Reveals collapsed content';

  // link with a known href
  if (el.type === 'link' && m.href) return `Navigates to ${m.href as string}`;

  return undefined;
}

/**
 * Build a `PixeerAppContext` from the current DOM state using only ARIA
 * metadata — no clicking, no waiting, instant.
 *
 * Used by `quickScan()`. For elements where ARIA gives no signal, the element
 * is still listed in the output without a hint so you can see what exists.
 */
export function staticScanAppContext(
  url: string,
  title: string,
  elements: InteractiveElement[],
): PixeerAppContext {
  let path: string;
  try { path = new URL(url, 'http://x').pathname; } catch { path = url; }

  const withHints: Record<string, string> = {};
  const noHints: string[] = [];

  for (const el of elements) {
    if (!el.name) continue;
    const hint = hintFromAria(el);
    if (hint) withHints[el.name] = hint;
    else noHints.push(el.name);
  }

  const elementHints: Record<string, string> = { ...withHints };
  // Elements we have no ARIA signal for — note them so dev can add data-pixeer
  if (noHints.length > 0) {
    elementHints['__unknown__'] =
      `No ARIA hints for: ${noHints.slice(0, 8).join(', ')}${noHints.length > 8 ? ` +${noHints.length - 8} more` : ''}`;
  }

  const app = title ? title.split('|')[0].trim() : undefined;

  return {
    app,
    routes: {
      [path]: {
        description: title || path,
        elements: elementHints,
      },
    },
  };
}

/**
 * Convert an exploration graph into a `PixeerAppContext` ready to paste into
 * `createPixeerBridge({ appContext: ... })`.
 */
export function graphToAppContext(graph: ExplorationGraph): PixeerAppContext {
  const routes: Record<string, PixeerViewContext> = {};

  for (const node of Object.values(graph.nodes)) {
    const path = pathOf(node.url);

    if (!routes[path]) {
      routes[path] = {
        description: node.title || path,
        elements: {},
      };
    }

    // Populate element hints from outgoing edges on this node
    const outgoing = graph.edges.filter((e) => e.from === node.id);
    for (const edge of outgoing) {
      const target = graph.nodes[edge.to];
      if (!target || !edge.action.name) continue;
      routes[path].elements![edge.action.name] = deriveHint(node, target);
    }
  }

  const rootNode = graph.nodes[graph.rootId];
  const app = rootNode?.title ? rootNode.title.split('|')[0].trim() : undefined;

  return { app, routes };
}

/**
 * Render the exploration graph as a Mermaid `graph TD` diagram.
 * Paste into any Mermaid renderer to visualise the discovered state transitions.
 */
export function graphToMermaid(graph: ExplorationGraph): string {
  const lines: string[] = ['graph TD'];

  const nodeLabel = (node: StateNode): string => {
    const path = pathOf(node.url);
    const title = node.title ? node.title.slice(0, 30) : '';
    const marker = node.id === graph.rootId ? '🏠 ' : '';
    return `${marker}${path}${title ? `\\n${title}` : ''}`;
  };

  for (const node of Object.values(graph.nodes)) {
    lines.push(`  ${node.id}["${nodeLabel(node)}"]`);
  }

  for (const edge of graph.edges) {
    const label = edge.action.name.slice(0, 25).replace(/"/g, "'");
    lines.push(`  ${edge.from} -->|"${label}"| ${edge.to}`);
  }

  return lines.join('\n');
}
