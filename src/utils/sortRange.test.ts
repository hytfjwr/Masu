import { describe, it, expect } from 'vitest';
import { computeSortOrder } from './sortRange';
import { makeError } from '../engine/types';
import type { FormulaResult } from '../engine/types';

/** Build a getValue function from a column-major table: table[col][row - startRow]. */
function tableGetValue(table: Record<number, FormulaResult[]>, startRow: number) {
  return (col: number, row: number): FormulaResult => table[col][row - startRow];
}

describe('computeSortOrder', () => {
  it('sorts ascending by a single numeric key', () => {
    const table = { 0: [3, 1, 2] };
    const order = computeSortOrder(tableGetValue(table, 0), 0, 2, [{ col: 0, ascending: true }]);
    expect(order).toEqual([1, 2, 0]);
  });

  it('sorts descending by a single numeric key', () => {
    const table = { 0: [3, 1, 2] };
    const order = computeSortOrder(tableGetValue(table, 0), 0, 2, [{ col: 0, ascending: false }]);
    expect(order).toEqual([0, 2, 1]);
  });

  it('keeps empty cells last regardless of direction', () => {
    const table = { 0: [5, '', 1] };
    const asc = computeSortOrder(tableGetValue(table, 0), 0, 2, [{ col: 0, ascending: true }]);
    expect(asc).toEqual([2, 0, 1]);
    const desc = computeSortOrder(tableGetValue(table, 0), 0, 2, [{ col: 0, ascending: false }]);
    expect(desc).toEqual([0, 2, 1]);
  });

  it('places error values just before empty cells, in both directions', () => {
    const table = { 0: ['', makeError('#VALUE!'), 5, 1] };
    const asc = computeSortOrder(tableGetValue(table, 0), 0, 3, [{ col: 0, ascending: true }]);
    expect(asc).toEqual([3, 2, 1, 0]);
    const desc = computeSortOrder(tableGetValue(table, 0), 0, 3, [{ col: 0, ascending: false }]);
    expect(desc).toEqual([2, 3, 1, 0]);
  });

  it('orders number < string < boolean, case-insensitively for strings', () => {
    const table = { 0: [true, 'banana', 'Apple', 1] };
    const order = computeSortOrder(tableGetValue(table, 0), 0, 3, [{ col: 0, ascending: true }]);
    expect(order).toEqual([3, 2, 1, 0]);
  });

  it('falls back to the second key when the first key ties, stably', () => {
    const table = {
      0: ['a', 'a', 'b'],
      1: [2, 1, 0],
    };
    const order = computeSortOrder(
      (col, row) => table[col as 0 | 1][row],
      0, 2,
      [{ col: 0, ascending: true }, { col: 1, ascending: true }],
    );
    expect(order).toEqual([1, 0, 2]);
  });

  it('is stable when all keys tie', () => {
    const table = { 0: ['x', 'x', 'x'] };
    const order = computeSortOrder(tableGetValue(table, 0), 0, 2, [{ col: 0, ascending: true }]);
    expect(order).toEqual([0, 1, 2]);
  });

  it('supports a non-zero startRow (range sort)', () => {
    const table = { 0: [3, 1, 2] }; // rows 5,6,7
    const order = computeSortOrder(tableGetValue(table, 5), 5, 7, [{ col: 0, ascending: true }]);
    expect(order).toEqual([6, 7, 5]);
  });
});
