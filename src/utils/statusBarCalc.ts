/**
 * Status bar aggregate calculation logic.
 */

import type { CellData, SelectionRange } from '../types/grid';
import { parseCellKey } from './coordinates';

function getNormalizedRange(range: SelectionRange) {
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  return { minCol, maxCol, minRow, maxRow };
}

/** Calculate aggregate values for a selection range */
export function calcAggregates(
  range: SelectionRange,
  getCellData: (col: number, row: number) => CellData | undefined,
  /** All cells of the sheet: when the selection is larger than this map (e.g. whole columns / select all), iterate the map instead of every selected position */
  cells?: Map<string, CellData>,
): { sum: number | null; average: number | null; count: number } {
  const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(range);

  let sum = 0;
  let numericCount = 0;
  let nonEmptyCount = 0;

  const accumulate = (cell: CellData | undefined) => {
    const display = cell?.displayValue ?? '';
    if (display !== '') {
      nonEmptyCount++;
      const num = Number(display);
      if (!isNaN(num)) {
        sum += num;
        numericCount++;
      }
    }
  };

  const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  if (cells && area > cells.size) {
    for (const [key, cell] of cells) {
      const { col, row } = parseCellKey(key);
      if (col >= minCol && col <= maxCol && row >= minRow && row <= maxRow) accumulate(cell);
    }
  } else {
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) accumulate(getCellData(c, r));
    }
  }

  if (numericCount === 0) {
    return { sum: null, average: null, count: nonEmptyCount };
  }

  return {
    sum,
    average: sum / numericCount,
    count: nonEmptyCount,
  };
}
