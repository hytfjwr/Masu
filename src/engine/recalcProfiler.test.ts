import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { recalcProfiler } from './recalcProfiler';

describe('recalcProfiler', () => {
  beforeEach(() => {
    recalcProfiler.setEnabled(false);
    recalcProfiler.clear();
  });

  it('does not record while disabled', () => {
    expect(recalcProfiler.begin('dependents')).toBeNull();
  });

  it('records a pass with evaluation order, slowest cells and per-cell times', () => {
    recalcProfiler.setEnabled(true);
    const v0 = recalcProfiler.getVersion();
    const rec = recalcProfiler.begin('all')!;
    recalcProfiler.cell(rec, 's:A1', 0.5);
    recalcProfiler.cell(rec, 's:B1', 3);
    recalcProfiler.cell(rec, 's:A1', 0.25); // re-evaluated in a later iteration: times add up
    rec.stats.callHits = 2;
    recalcProfiler.end(rec);

    const [record] = recalcProfiler.getRecords();
    expect(record.kind).toBe('all');
    expect(record.evaluations).toBe(3);
    expect(record.order).toEqual(['s:A1', 's:B1', 's:A1']);
    expect(record.slowest.map((s) => s.key)).toEqual(['s:B1', 's:A1']);
    expect(record.stats.callHits).toBe(2);
    expect(recalcProfiler.getCellTimes().get('s:A1')).toBeCloseTo(0.75);
    expect(recalcProfiler.getVersion()).toBeGreaterThan(v0);

    recalcProfiler.clear();
    expect(recalcProfiler.getRecords()).toHaveLength(0);
    expect(recalcProfiler.getCellTimes().size).toBe(0);
  });
});
