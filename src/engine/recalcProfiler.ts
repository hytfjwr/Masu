import type { PassCacheStats } from './types';

/** How many formulas a pass record keeps in evaluation order / as the slowest list. */
const MAX_ORDER = 400;
const MAX_SLOWEST = 12;
const MAX_RECORDS = 60;

export interface RecalcPassRecord {
  id: number;
  /** recalculateDependents (incremental) or recalculateAll (full). */
  kind: 'dependents' | 'all';
  startedAt: number;
  durationMs: number;
  /** Formula evaluations performed (a cell re-evaluated for spill propagation counts again). */
  evaluations: number;
  /** Propagation iterations of an incremental pass (spill writes can trigger more). */
  iterations: number;
  /** Global cell keys in evaluation (topological) order, capped. */
  order: string[];
  slowest: Array<{ key: string; ms: number }>;
  stats: PassCacheStats;
}

/** A recording in progress (created by begin(), fed by cell(), closed by end()). */
export interface RecalcPassRecorder {
  kind: RecalcPassRecord['kind'];
  startedAt: number;
  evaluations: number;
  iterations: number;
  order: string[];
  times: Map<string, number>;
  stats: PassCacheStats;
}

type Listener = () => void;

/**
 * Developer-tool recorder of recalculation passes. Recording is off by default: while disabled the
 * engine only checks `enabled` once per pass, so it costs nothing measurable.
 */
class RecalcProfiler {
  enabled = false;
  private records: RecalcPassRecord[] = [];
  /** Latest evaluation time (ms) per global cell key, for the grid heatmap. */
  private cellTimes = new Map<string, number>();
  private nextId = 1;
  private listeners = new Set<Listener>();
  /** Bumped on every change so snapshots are cheap to compare (useSyncExternalStore). */
  private version = 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  getRecords(): readonly RecalcPassRecord[] {
    return this.records;
  }

  getCellTimes(): ReadonlyMap<string, number> {
    return this.cellTimes;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.emit();
  }

  clear(): void {
    this.records = [];
    this.cellTimes = new Map();
    this.emit();
  }

  /** Start recording a pass, or null while disabled. */
  begin(kind: RecalcPassRecord['kind']): RecalcPassRecorder | null {
    if (!this.enabled) return null;
    return {
      kind,
      startedAt: performance.now(),
      evaluations: 0,
      iterations: 0,
      order: [],
      times: new Map(),
      stats: { callHits: 0, callMisses: 0, rangeHits: 0, rangeMisses: 0 },
    };
  }

  /** Record one formula evaluation of `key` that took `ms`. */
  cell(rec: RecalcPassRecorder, key: string, ms: number): void {
    rec.evaluations++;
    if (rec.order.length < MAX_ORDER) rec.order.push(key);
    rec.times.set(key, (rec.times.get(key) ?? 0) + ms);
  }

  end(rec: RecalcPassRecorder): void {
    const durationMs = performance.now() - rec.startedAt;
    const slowest = Array.from(rec.times, ([key, ms]) => ({ key, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, MAX_SLOWEST);
    this.records = [
      {
        id: this.nextId++,
        kind: rec.kind,
        startedAt: rec.startedAt,
        durationMs,
        evaluations: rec.evaluations,
        iterations: rec.iterations,
        order: rec.order,
        slowest,
        stats: rec.stats,
      },
      ...this.records,
    ].slice(0, MAX_RECORDS);
    for (const [key, ms] of rec.times) this.cellTimes.set(key, ms);
    this.emit();
  }

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}

export const recalcProfiler = new RecalcProfiler();
