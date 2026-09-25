/**
 * Pure sort-order computation for the "Sort range" / "Sort sheet" features.
 * Mirrors Google Sheets' range-sort semantics: empty cells always sort last
 * (in either direction), error values sort just before empty cells, and
 * everything else compares via `compareValues` (number < string < boolean,
 * case-insensitive strings), reversed for descending keys.
 */
import { compareValues } from '../engine/coerce';
import type { FormulaResult } from '../engine/types';
import { isFormulaError } from '../engine/types';

export interface SortKey {
  col: number;
  ascending: boolean;
}

/** Empty cells rank last, errors rank just before empty, everything else ranks first. */
function emptyRank(v: FormulaResult): 0 | 1 | 2 {
  if (v === '') return 2;
  if (isFormulaError(v)) return 1;
  return 0;
}

/** Compare two values for a single sort key: empty/error placement is direction-independent. */
function compareForKey(a: FormulaResult, b: FormulaResult, ascending: boolean): number {
  const ra = emptyRank(a);
  const rb = emptyRank(b);
  if (ra !== rb) return ra - rb;
  if (ra !== 0) return 0; // both empty or both error: no further ordering between them
  const cmp = compareValues(a, b);
  return ascending ? cmp : -cmp;
}

/**
 * Stable-sort the rows in [startRow, endRow] by `keys` (applied in order, first
 * mismatch wins). Returns the resulting row order as an array of original row
 * indices (e.g. [3, 1, 2] means the new first row was originally row 3).
 */
export function computeSortOrder(
  getValue: (col: number, row: number) => FormulaResult,
  startRow: number,
  endRow: number,
  keys: SortKey[],
): number[] {
  const entries: Array<{ row: number; i: number }> = [];
  for (let row = startRow; row <= endRow; row++) {
    entries.push({ row, i: entries.length });
  }

  entries.sort((a, b) => {
    for (const key of keys) {
      const cmp = compareForKey(getValue(key.col, a.row), getValue(key.col, b.row), key.ascending);
      if (cmp !== 0) return cmp;
    }
    return a.i - b.i; // stable tie-break
  });

  return entries.map((e) => e.row);
}
