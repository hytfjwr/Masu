/**
 * Pure functions for spill (array formula result expansion) logic.
 * No React or DOM dependencies — testable with vitest in node environment.
 */

import type { CellData, CellDataMap } from '../types/grid';
import type { FormulaResult, SpillResult } from './types';
import { isFormulaError } from './types';
import { colIndexToLetter, parseCellKey } from '../utils/coordinates';
import { formatNumberForText } from './coerce';

/**
 * Resolve a SpillResult into cell data to be written, or a #SPILL! error
 * if the spill range conflicts with existing data.
 *
 * @param spillResult - The array result from an array function
 * @param originKey - The cell key where the formula lives (e.g. "D1")
 * @param existingCells - The current cell data map
 * @returns Either cells to write + spillExtent, or an error indicator
 */
export function resolveSpill(
  spillResult: SpillResult,
  originKey: string,
  existingCells: CellDataMap,
): { cells: Map<string, CellData>; spillExtent: { rows: number; cols: number } } | { error: '#SPILL!' } {
  const { values } = spillResult;
  const rows = values.length;
  if (rows === 0) return { error: '#SPILL!' };
  const cols = values[0].length;
  if (cols === 0) return { error: '#SPILL!' };

  const origin = parseCellKey(originKey);
  const newCells = new Map<string, CellData>();

  // Check for conflicts in spill target cells (skip origin itself)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue; // Skip origin cell
      const targetKey = `${colIndexToLetter(origin.col + c)}${origin.row + r + 1}`;
      const existing = existingCells.get(targetKey);
      if (existing) {
        // Allow overwrite if it's a spill cell from the same origin
        if (existing.spillSource === originKey) continue;
        // A spill cell belonging to a different origin is always a conflict
        if (existing.spillSource && existing.spillSource !== originKey) {
          return { error: '#SPILL!' };
        }
        // Any other non-empty cell is a conflict
        if (existing.rawValue !== '' || existing.formula !== undefined) {
          return { error: '#SPILL!' };
        }
      }
    }
  }

  // Build spill target cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue; // Origin handled separately
      const targetKey = `${colIndexToLetter(origin.col + c)}${origin.row + r + 1}`;
      const val: FormulaResult = values[r][c];
      const displayValue = formatSpillValue(val);
      newCells.set(targetKey, {
        rawValue: '',
        displayValue,
        computed: isFormulaError(val) ? undefined : val,
        spillSource: originKey,
        error: isFormulaError(val) ? val.code : undefined,
      });
    }
  }

  return { cells: newCells, spillExtent: { rows, cols } };
}

/**
 * Get all spill target cell keys for a given spill origin.
 * Returns the keys that should be cleared when the origin's spill is removed.
 */
export function clearSpillRange(
  originKey: string,
  existingCells: CellDataMap,
): string[] {
  const keysToRemove: string[] = [];
  for (const [key, cell] of existingCells) {
    if (cell.spillSource === originKey) {
      keysToRemove.push(key);
    }
  }
  return keysToRemove;
}

function formatSpillValue(result: FormulaResult): string {
  if (isFormulaError(result)) return result.code;
  if (typeof result === 'boolean') return result ? 'TRUE' : 'FALSE';
  if (typeof result === 'number') return formatNumberForText(result);
  return String(result);
}
