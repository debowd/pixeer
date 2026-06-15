import type { InteractiveElement, PixeerAppContext } from 'pixeer';

export interface StateNode {
  /** Stable fingerprint of this DOM state (hash of URL path + sorted element names) */
  id: string;
  url: string;
  title: string;
  elements: InteractiveElement[];
}

export interface ActionRecord {
  type: 'click';
  /** Accessible name of the element that was activated */
  name: string;
  /** CSS selector used as fallback */
  selector: string;
}

export interface StateEdge {
  from: string;
  to: string;
  action: ActionRecord;
}

export interface ExplorationGraph {
  nodes: Record<string, StateNode>;
  edges: StateEdge[];
  rootId: string;
}

export interface ExplorerOptions {
  /**
   * How many levels deep to explore from the root state.
   * @default 2
   */
  maxDepth?: number;
  /**
   * Maximum number of elements to activate per state.
   * @default 8
   */
  maxBranches?: number;
  /**
   * Milliseconds to wait for the DOM to settle after each action.
   * @default 300
   */
  settleMs?: number;
  /**
   * Input subtypes to skip (plain text typing doesn't reveal structure).
   * @default ['text','password','email','number','search','tel','url']
   */
  skipInputTypes?: string[];
  /**
   * CSS selector fragments — any element whose selector contains one of these is skipped.
   */
  skipSelectors?: string[];
  /**
   * When N or more elements share the same base selector pattern, explore only the first one.
   * @default 3
   */
  patternCollapseThreshold?: number;
  /** Progress callback fired as the exploration advances. */
  onProgress?: (event: ExplorationProgressEvent) => void;
}

export type ExplorationProgressEventType =
  | 'node:enter'
  | 'action:start'
  | 'action:done'
  | 'done';

export interface ExplorationProgressEvent {
  type: ExplorationProgressEventType;
  nodeId?: string;
  actionName?: string;
  depth?: number;
  nodesVisited?: number;
}

export interface ExplorationStats {
  nodesVisited: number;
  actionsAttempted: number;
  durationMs: number;
}

export interface ExplorationResult {
  graph: ExplorationGraph;
  /** Ready to paste into createPixeerBridge({ appContext: ... }) */
  appContext: PixeerAppContext;
  /** Mermaid diagram string for visualising the state graph */
  diagram: string;
  stats: ExplorationStats;
}

export interface PixeerExplorer {
  explore(): Promise<ExplorationResult>;
}
