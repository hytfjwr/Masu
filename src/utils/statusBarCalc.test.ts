import { describe, it, expect } from 'vitest';
import { calcAggregates } from './statusBarCalc';
import type { CellData, SelectionRange } from '../types/grid';

function makeCellGetter(data: Record<string, CellData>) {
  return (col: number, row: number): CellData | undefined => {
    const key = `${col},${row}`;
    return data[key];
  };
}

function makeRange(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
): SelectionRange {
  return { start: { col: startCol, row: startRow }, end: { col: endCol, row: endRow } };
}

describe('calcAggregates', () => {
  it('calculates sum, average, count for numeric cells', () => {
    const getter = makeCellGetter({
      '0,0': { rawValue: '10', displayValue: '10' },
      '0,1': { rawValue: '20', displayValue: '20' },
      '0,2': { rawValue: '30', displayValue: '30' },
    });
    const result = calcAggregates(makeRange(0, 0, 0, 2), getter);
    expect(result.sum).toBe(60);
    expect(result.average).toBe(20);
    expect(result.count).toBe(3);
  });

  it('handles mixed numeric and string cells', () => {
    const getter = makeCellGetter({
      '0,0': { rawValue: '10', displayValue: '10' },
      '0,1': { rawValue: 'abc', displayValue: 'abc' },
      '0,2': { rawValue: '20', displayValue: '20' },
    });
    const result = calcAggregates(makeRange(0, 0, 0, 2), getter);
    expect(result.sum).toBe(30);
    expect(result.average).toBe(15);
    expect(result.count).toBe(3);
  });

  it('returns null sum/average for all-empty range', () => {
    const getter = makeCellGetter({});
    const result = calcAggregates(makeRange(0, 0, 0, 2), getter);
    expect(result.sum).toBeNull();
    expect(result.average).toBeNull();
    expect(result.count).toBe(0);
  });

  it('returns null sum/average for all-string range', () => {
    const getter = makeCellGetter({
      '0,0': { rawValue: 'a', displayValue: 'a' },
      '0,1': { rawValue: 'b', displayValue: 'b' },
    });
    const result = calcAggregates(makeRange(0, 0, 0, 1), getter);
    expect(result.sum).toBeNull();
    expect(result.average).toBeNull();
    expect(result.count).toBe(2);
  });
});
