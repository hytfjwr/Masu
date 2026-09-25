import { useCallback, useState } from 'react';
import type { CellPosition, SelectionRange } from '../types/grid';
import { clamp } from '../utils/coordinates';

export interface UseSelectionReturn {
  activeCell: CellPosition;
  selectionRange: SelectionRange | null;
  setActiveCell: (pos: CellPosition) => void;
  /** Start a new selection (e.g. Shift+click) from current active cell to target */
  extendSelection: (target: CellPosition) => void;
  /** Set the active cell and selection range together (e.g. column/row header selection) */
  selectRange: (range: SelectionRange, active?: CellPosition) => void;
  /** Extend the current range's start (or activeCell if no range) to target */
  extendSelectionTo: (target: CellPosition) => void;
  /** Move active cell by delta, optionally extending selection */
  moveActiveCell: (
    deltaCol: number,
    deltaRow: number,
    extend: boolean,
    colCount: number,
    rowCount: number,
  ) => void;
  /** Clear range selection (but keep active cell) */
  clearSelection: () => void;
  /** Get all positions in the current selection range */
  getSelectedPositions: () => CellPosition[];
  /** Check if a cell is within the selection range */
  isCellSelected: (col: number, row: number) => boolean;
  /** Check if a cell is the active cell */
  isCellActive: (col: number, row: number) => boolean;
}

function getNormalizedRange(range: SelectionRange) {
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  return { minCol, maxCol, minRow, maxRow };
}

export function useSelection(): UseSelectionReturn {
  const [activeCell, setActiveCellState] = useState<CellPosition>({ col: 0, row: 0 });
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);

  const setActiveCell = useCallback((pos: CellPosition) => {
    setActiveCellState(pos);
    setSelectionRange(null);
  }, []);

  const extendSelection = useCallback(
    (target: CellPosition) => {
      setSelectionRange({ start: activeCell, end: target });
    },
    [activeCell],
  );

  const selectRange = useCallback((range: SelectionRange, active?: CellPosition) => {
    setActiveCellState(active ?? range.start);
    setSelectionRange(range);
  }, []);

  const extendSelectionTo = useCallback(
    (target: CellPosition) => {
      setSelectionRange((prev) => ({ start: prev ? prev.start : activeCell, end: target }));
    },
    [activeCell],
  );

  const moveActiveCell = useCallback(
    (deltaCol: number, deltaRow: number, extend: boolean, colCount: number, rowCount: number) => {
      if (extend) {
        // Extend selection
        setSelectionRange((prev) => {
          const currentEnd = prev ? prev.end : activeCell;
          const newEnd: CellPosition = {
            col: clamp(currentEnd.col + deltaCol, 0, colCount - 1),
            row: clamp(currentEnd.row + deltaRow, 0, rowCount - 1),
          };
          return { start: activeCell, end: newEnd };
        });
      } else {
        // Move active cell
        setActiveCellState((prev) => ({
          col: clamp(prev.col + deltaCol, 0, colCount - 1),
          row: clamp(prev.row + deltaRow, 0, rowCount - 1),
        }));
        setSelectionRange(null);
      }
    },
    [activeCell],
  );

  const clearSelection = useCallback(() => {
    setSelectionRange(null);
  }, []);

  const getSelectedPositions = useCallback((): CellPosition[] => {
    if (!selectionRange) {
      return [activeCell];
    }
    const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(selectionRange);
    const positions: CellPosition[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        positions.push({ col: c, row: r });
      }
    }
    return positions;
  }, [activeCell, selectionRange]);

  const isCellSelected = useCallback(
    (col: number, row: number): boolean => {
      if (!selectionRange) {
        return col === activeCell.col && row === activeCell.row;
      }
      const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(selectionRange);
      return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
    },
    [activeCell, selectionRange],
  );

  const isCellActive = useCallback(
    (col: number, row: number): boolean => {
      return col === activeCell.col && row === activeCell.row;
    },
    [activeCell],
  );

  return {
    activeCell,
    selectionRange,
    setActiveCell,
    extendSelection,
    selectRange,
    extendSelectionTo,
    moveActiveCell,
    clearSelection,
    getSelectedPositions,
    isCellSelected,
    isCellActive,
  };
}
