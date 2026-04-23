export type PixeerEventType =
  | 'bridge:init'
  | 'bridge:dispose'
  | 'action:start'
  | 'action:success'
  | 'action:error'
  | 'snapshot:taken';

export interface PixeerEvent {
  type: PixeerEventType;
  method: string;
  sessionId: string;
  timestamp: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface PixeerStats {
  sessionId: string;
  startedAt: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  successRate: number;
  methodCounts: Record<string, number>;
  methodErrors: Record<string, number>;
  avgDurationMs: Record<string, number>;
}

type Handler = (event: PixeerEvent) => void;

function generateSessionId(): string {
  return `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class PixeerAnalytics {
  private handlers = new Map<string, Handler[]>();
  private history: PixeerEvent[] = [];
  private durations: Record<string, number[]> = {};
  readonly sessionId: string;
  readonly startedAt: number;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? generateSessionId();
    this.startedAt = Date.now();
  }

  emit(event: PixeerEvent): void {
    this.history.push(event);

    if (event.durationMs !== undefined) {
      if (!this.durations[event.method]) this.durations[event.method] = [];
      this.durations[event.method].push(event.durationMs);
    }

    (this.handlers.get(event.type) ?? []).forEach((h) => h(event));
    (this.handlers.get('*') ?? []).forEach((h) => h(event));
  }

  on(type: PixeerEventType | '*', handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
    return () => {
      const list = this.handlers.get(type) ?? [];
      this.handlers.set(type, list.filter((h) => h !== handler));
    };
  }

  getStats(): PixeerStats {
    const actions = this.history.filter(
      (e) => e.type === 'action:success' || e.type === 'action:error',
    );
    const successes = actions.filter((e) => e.type === 'action:success');
    const failures = actions.filter((e) => e.type === 'action:error');

    const methodCounts: Record<string, number> = {};
    const methodErrors: Record<string, number> = {};
    const avgDurationMs: Record<string, number> = {};

    for (const e of actions) {
      methodCounts[e.method] = (methodCounts[e.method] ?? 0) + 1;
      if (e.type === 'action:error') {
        methodErrors[e.method] = (methodErrors[e.method] ?? 0) + 1;
      }
    }

    for (const [method, durations] of Object.entries(this.durations)) {
      avgDurationMs[method] = durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      totalActions: actions.length,
      successfulActions: successes.length,
      failedActions: failures.length,
      successRate: actions.length > 0 ? successes.length / actions.length : 1,
      methodCounts,
      methodErrors,
      avgDurationMs,
    };
  }

  getHistory(): PixeerEvent[] {
    return [...this.history];
  }

  flush(): PixeerEvent[] {
    const copy = [...this.history];
    this.history = [];
    this.durations = {};
    return copy;
  }

  clear(): void {
    this.history = [];
    this.durations = {};
    this.handlers.clear();
  }
}
