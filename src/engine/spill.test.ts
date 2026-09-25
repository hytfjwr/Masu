import { describe, it, expect } from 'vitest';
import { resolveSpill, clearSpillRange } from './spill';
import type { CellData, CellDataMap } from '../types/grid';
import type { SpillResult } from './types';

function makeSpillResult(values: (number | string)[][]): SpillResult {
  return { type: 'spill', values };
}

function makeCellDataMap(entries: Array<[string, Partial<CellData>]>): CellDataMap {
  const map: CellDataMap = new Map();
  for (const [key, data] of entries) {
    map.set(key, {
      rawValue: data.rawValue ?? '',
      displayValue: data.displayValue ?? '',
      ...data,
    });
  }
  return map;
}

describe('resolveSpill', () => {
  it('creates spill cells for a column result', () => {
    const spillResult = makeSpillResult([[1], [2], [3]]);
    const cells = makeCellDataMap([]);

    const result = resolveSpill(spillResult, 'A1', cells);
    expect('cells' in result).toBe(true);
    if (!('cells' in result)) return;

    // Origin (A1) is not in result.cells (handled separately)
    expect(result.cells.has('A1')).toBe(false);
    expect(result.cells.has('A2')).toBe(true);
    expect(result.cells.has('A3')).toBe(true);
    expect(result.cells.get('A2')?.displayValue).toBe('2');
    expect(result.cells.get('A3')?.displayValue).toBe('3');
    expect(result.cells.get('A2')?.spillSource).toBe('A1');
    expect(result.spillExtent).toEqual({ rows: 3, cols: 1 });
  });

  it('creates spill cells for a grid result', () => {
    const spillResult = makeSpillResult([[1, 2], [3, 4]]);
    const cells = makeCellDataMap([]);

    const result = resolveSpill(spillResult, 'A1', cells);
    expect('cells' in result).toBe(true);
    if (!('cells' in result)) return;

    expect(result.cells.has('B1')).toBe(true);
    expect(result.cells.has('A2')).toBe(true);
    expect(result.cells.has('B2')).toBe(true);
    expect(result.cells.get('B1')?.displayValue).toBe('2');
    expect(result.cells.get('A2')?.displayValue).toBe('3');
    expect(result.cells.get('B2')?.displayValue).toBe('4');
    expect(result.spillExtent).toEqual({ rows: 2, cols: 2 });
  });

  it('returns #SPILL! error when target cell has data', () => {
    const spillResult = makeSpillResult([[1], [2], [3]]);
    const cells = makeCellDataMap([
      ['A2', { rawValue: 'existing', displayValue: 'existing' }],
    ]);

    const result = resolveSpill(spillResult, 'A1', cells);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('#SPILL!');
    }
  });

  it('does not conflict when target cell is from the same spill origin', () => {
    const spillResult = makeSpillResult([[1], [2], [3]]);
    const cells = makeCellDataMap([
      ['A2', { rawValue: '', displayValue: '2', spillSource: 'A1' }],
      ['A3', { rawValue: '', displayValue: '3', spillSource: 'A1' }],
    ]);

    const result = resolveSpill(spillResult, 'A1', cells);
    expect('cells' in result).toBe(true);
  });

  it('all spill cells have correct spillSource', () => {
    const spillResult = makeSpillResult([[10], [20], [30]]);
    const cells = makeCellDataMap([]);

    const result = resolveSpill(spillResult, 'C5', cells);
    expect('cells' in result).toBe(true);
    if (!('cells' in result)) return;

    for (const [, cellData] of result.cells) {
      expect(cellData.spillSource).toBe('C5');
    }
  });

  it('spillExtent has correct rows and cols', () => {
    const spillResult = makeSpillResult([[1, 2, 3], [4, 5, 6]]);
    const cells = makeCellDataMap([]);

    const result = resolveSpill(spillResult, 'A1', cells);
    expect('cells' in result).toBe(true);
    if (!('cells' in result)) return;

    expect(result.spillExtent).toEqual({ rows: 2, cols: 3 });
  });
});

describe('clearSpillRange', () => {
  it('returns all spill target keys for the given origin', () => {
    const cells = makeCellDataMap([
      ['A1', { rawValue: '=SEQUENCE(3)', displayValue: '1', formula: 'SEQUENCE(3)' }],
      ['A2', { rawValue: '', displayValue: '2', spillSource: 'A1' }],
      ['A3', { rawValue: '', displayValue: '3', spillSource: 'A1' }],
      ['B1', { rawValue: 'other', displayValue: 'other' }],
    ]);

    const keysToRemove = clearSpillRange('A1', cells);
    expect(keysToRemove).toEqual(expect.arrayContaining(['A2', 'A3']));
    expect(keysToRemove).toHaveLength(2);
  });

  it('returns empty array when no spill targets exist', () => {
    const cells = makeCellDataMap([
      ['A1', { rawValue: '=1', displayValue: '1', formula: '1' }],
    ]);

    const keysToRemove = clearSpillRange('A1', cells);
    expect(keysToRemove).toHaveLength(0);
  });
});
