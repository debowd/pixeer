import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fingerprintState } from '../fingerprint';
import { graphToAppContext, graphToMermaid } from '../exporter';
import { createPixeerExplorer } from '../explorer';
import type { InteractiveElement } from 'pixeer';
import type { ExplorationGraph, StateNode } from '../types';

// ---------------------------------------------------------------------------
// Mock pixeer's DomService — vi.hoisted ensures fns exist before vi.mock runs.
// ---------------------------------------------------------------------------

const { mockGetInteractiveElements, mockClickByName, mockClick } = vi.hoisted(() => ({
  mockGetInteractiveElements: vi.fn<() => Promise<InteractiveElement[]>>(),
  mockClickByName: vi.fn<(name: string) => Promise<boolean>>(),
  mockClick: vi.fn<(selector: string) => boolean>(),
}));

vi.mock('pixeer', () => ({
  DomService: {
    getInteractiveElements: mockGetInteractiveElements,
    clickByName: mockClickByName,
    click: mockClick,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeEl = (
  name: string,
  type = 'button',
  selector = `#${name.toLowerCase().replace(/\s/g, '-')}`,
): InteractiveElement => ({ name, type, selector, enabled: true });

const makeNode = (id: string, url: string, elements: InteractiveElement[]): StateNode => ({
  id,
  url,
  title: url,
  elements,
});

// ---------------------------------------------------------------------------
// fingerprintState
// ---------------------------------------------------------------------------

describe('fingerprintState', () => {
  it('returns a consistent 8-char hex string', () => {
    const fp = fingerprintState('http://localhost/', []);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('same path + same elements → same fingerprint', () => {
    const els = [makeEl('Submit'), makeEl('Cancel')];
    const a = fingerprintState('http://localhost/dashboard', els);
    const b = fingerprintState('http://localhost/dashboard', [...els].reverse());
    expect(a).toBe(b);
  });

  it('different element sets → different fingerprints', () => {
    const a = fingerprintState('http://localhost/', [makeEl('Open')]);
    const b = fingerprintState('http://localhost/', [makeEl('Close')]);
    expect(a).not.toBe(b);
  });

  it('same elements but different paths → different fingerprints', () => {
    const els = [makeEl('Save')];
    const a = fingerprintState('http://localhost/page-a', els);
    const b = fingerprintState('http://localhost/page-b', els);
    expect(a).not.toBe(b);
  });

  it('tolerates malformed URLs without throwing', () => {
    expect(() => fingerprintState('not-a-url', [])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphToAppContext
// ---------------------------------------------------------------------------

describe('graphToAppContext', () => {
  it('maps a root node to the routes map', () => {
    const root = makeNode('root1', 'http://localhost/', [makeEl('Open Modal')]);
    const graph: ExplorationGraph = {
      nodes: { root1: root },
      edges: [],
      rootId: 'root1',
    };

    const ctx = graphToAppContext(graph);
    expect(ctx.routes).toHaveProperty('/');
    const route = ctx.routes!['/'] as import('pixeer').PixeerViewContext;
    expect(route.description).toBe('http://localhost/');
  });

  it('derives navigation hint when target URL path differs', () => {
    const home = makeNode('n0', 'http://localhost/', [makeEl('Go to Settings')]);
    const settings = makeNode('n1', 'http://localhost/settings', [makeEl('Save')]);
    const graph: ExplorationGraph = {
      nodes: { n0: home, n1: settings },
      edges: [{ from: 'n0', to: 'n1', action: { type: 'click', name: 'Go to Settings', selector: '#settings' } }],
      rootId: 'n0',
    };

    const ctx = graphToAppContext(graph);
    const route = ctx.routes!['/'] as import('pixeer').PixeerViewContext;
    expect(route.elements!['Go to Settings']).toBe('Navigates to /settings');
  });

  it('derives "Reveals" hint when target is same path with new elements', () => {
    const closed = makeNode('n0', 'http://localhost/', [makeEl('Open Modal')]);
    const open = makeNode('n1', 'http://localhost/', [
      makeEl('Open Modal'),
      makeEl('Close'),
      makeEl('Confirm'),
    ]);
    const graph: ExplorationGraph = {
      nodes: { n0: closed, n1: open },
      edges: [{ from: 'n0', to: 'n1', action: { type: 'click', name: 'Open Modal', selector: '#open' } }],
      rootId: 'n0',
    };

    const ctx = graphToAppContext(graph);
    const route = ctx.routes!['/'] as import('pixeer').PixeerViewContext;
    const hint = route.elements!['Open Modal'];
    expect(hint).toContain('Reveals');
    expect(hint).toContain('Close');
  });

  it('uses root node title as app name (strips after |)', () => {
    const root = makeNode('r', 'http://localhost/', []);
    root.title = 'Nexora | Dashboard';
    const graph: ExplorationGraph = { nodes: { r: root }, edges: [], rootId: 'r' };
    const ctx = graphToAppContext(graph);
    expect(ctx.app).toBe('Nexora');
  });

  it('groups multiple nodes on the same path under one route', () => {
    const n0 = makeNode('n0', 'http://localhost/dash', [makeEl('Open')]);
    const n1 = makeNode('n1', 'http://localhost/dash', [makeEl('Open'), makeEl('Close')]);
    const graph: ExplorationGraph = {
      nodes: { n0, n1 },
      edges: [{ from: 'n0', to: 'n1', action: { type: 'click', name: 'Open', selector: '#o' } }],
      rootId: 'n0',
    };
    const ctx = graphToAppContext(graph);
    // Both nodes share /dash — should produce exactly one route entry
    expect(Object.keys(ctx.routes!)).toEqual(['/dash']);
  });
});

// ---------------------------------------------------------------------------
// graphToMermaid
// ---------------------------------------------------------------------------

describe('graphToMermaid', () => {
  it('starts with "graph TD"', () => {
    const graph: ExplorationGraph = { nodes: {}, edges: [], rootId: '' };
    expect(graphToMermaid(graph)).toMatch(/^graph TD/);
  });

  it('includes node IDs and edge labels', () => {
    const n0 = makeNode('aaa', 'http://localhost/', []);
    const n1 = makeNode('bbb', 'http://localhost/about', []);
    const graph: ExplorationGraph = {
      nodes: { aaa: n0, bbb: n1 },
      edges: [{ from: 'aaa', to: 'bbb', action: { type: 'click', name: 'About', selector: 'a' } }],
      rootId: 'aaa',
    };
    const mermaid = graphToMermaid(graph);
    expect(mermaid).toContain('aaa');
    expect(mermaid).toContain('bbb');
    expect(mermaid).toContain('About');
    expect(mermaid).toContain('🏠');
  });
});

// ---------------------------------------------------------------------------
// createPixeerExplorer
// ---------------------------------------------------------------------------

describe('createPixeerExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no elements (nothing to explore)
    mockGetInteractiveElements.mockResolvedValue([]);
    mockClickByName.mockResolvedValue(true);
    mockClick.mockReturnValue(true);
  });

  it('returns stats with nodesVisited >= 1', async () => {
    const result = await createPixeerExplorer({ settleMs: 0 }).explore();
    expect(result.stats.nodesVisited).toBeGreaterThanOrEqual(1);
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not explore beyond maxDepth', async () => {
    // First call: one button. After click: same button (same fingerprint).
    const btn = makeEl('Click Me');
    mockGetInteractiveElements.mockResolvedValue([btn]);

    const result = await createPixeerExplorer({ maxDepth: 1, settleMs: 0 }).explore();
    // Should have visited the root node once
    expect(result.stats.nodesVisited).toBe(1);
  });

  it('respects maxBranches', async () => {
    const buttons = Array.from({ length: 10 }, (_, i) => makeEl(`Button ${i}`, 'button', `#b${i}`));
    mockGetInteractiveElements.mockResolvedValue(buttons);

    const result = await createPixeerExplorer({ maxDepth: 1, maxBranches: 3, settleMs: 0 }).explore();
    // At most maxBranches actions should have been attempted from root
    expect(result.stats.actionsAttempted).toBeLessThanOrEqual(3);
  });

  it('fires progress events', async () => {
    const events: string[] = [];
    await createPixeerExplorer({
      settleMs: 0,
      onProgress: (e) => events.push(e.type),
    }).explore();

    expect(events).toContain('node:enter');
    expect(events).toContain('done');
  });

  it('skips disabled elements', async () => {
    const disabled = { ...makeEl('Disabled Btn'), enabled: false };
    mockGetInteractiveElements.mockResolvedValue([disabled]);

    await createPixeerExplorer({ settleMs: 0 }).explore();
    expect(mockClickByName).not.toHaveBeenCalled();
  });

  it('skips elements matching skipSelectors', async () => {
    const el = makeEl('Logout', 'button', '#nav-logout');
    mockGetInteractiveElements.mockResolvedValue([el]);

    await createPixeerExplorer({ settleMs: 0, skipSelectors: ['logout'] }).explore();
    expect(mockClickByName).not.toHaveBeenCalled();
  });

  it('produces a valid appContext with routes', async () => {
    const result = await createPixeerExplorer({ settleMs: 0 }).explore();
    expect(result.appContext).toBeDefined();
    expect(result.appContext.routes).toBeDefined();
  });

  it('produces a mermaid diagram string', async () => {
    const result = await createPixeerExplorer({ settleMs: 0 }).explore();
    expect(result.diagram).toMatch(/^graph TD/);
  });

  it('collapses repeated patterns to one representative', async () => {
    // 5 elements with the same selector base → only 1 should be explored
    const repeated = Array.from({ length: 5 }, (_, i) =>
      makeEl(`Delete item ${i}`, 'button', `.list-item:nth-child(${i + 1}) .delete-btn`),
    );
    mockGetInteractiveElements.mockResolvedValue(repeated);

    const result = await createPixeerExplorer({
      maxDepth: 1,
      patternCollapseThreshold: 3,
      settleMs: 0,
    }).explore();

    // 5 similar elements → collapsed to 1, so at most 1 action
    expect(result.stats.actionsAttempted).toBeLessThanOrEqual(1);
  });
});
