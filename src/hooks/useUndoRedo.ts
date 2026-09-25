import { useCallback, useRef, useState } from 'react';
import type { CellData, CellDataMap, SheetData } from '../types/grid';
import { deepCloneSheets } from '../utils/sheetUtils';

const MAX_HISTORY = 100;

/**
 * Deep clone a CellDataMap, ensuring no shared references.
 */
function deepCloneCellDataMap(data: CellDataMap): CellDataMap {
  const clone: CellDataMap = new Map();
  for (const [key, cell] of data) {
    const clonedCell: CellData = {
      rawValue: cell.rawValue,
      displayValue: cell.displayValue,
    };
    if (cell.formula !== undefined) {
      clonedCell.formula = cell.formula;
    }
    if (cell.dependencies !== undefined) {
      clonedCell.dependencies = [...cell.dependencies];
    }
    if (cell.error !== undefined) {
      clonedCell.error = cell.error;
    }
    if (cell.style !== undefined) {
      clonedCell.style = { ...cell.style };
    }
    clone.set(key, clonedCell);
  }
  return clone;
}

/** A workbook snapshot for undo/redo */
export interface WorkbookSnapshot {
  sheets: SheetData[];
  activeSheetId: string;
}

function deepCloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return {
    sheets: deepCloneSheets(snapshot.sheets),
    activeSheetId: snapshot.activeSheetId,
  };
}

/** One state in the undo timeline (developer tooling). */
export interface HistoryTimelineEntry {
  /** When this state came into being (the action that produced it), or null for the oldest kept state. */
  time: number | null;
  /** This is the live workbook (between the undo and redo stacks). */
  current: boolean;
}

export interface UseUndoRedoReturn {
  /** Push a snapshot before a mutation (workbook-level) */
  pushSnapshot: (data: CellDataMap | WorkbookSnapshot) => void;
  /** Undo: returns the previous snapshot, or undefined if nothing to undo */
  undo: (currentData: CellDataMap | WorkbookSnapshot) => CellDataMap | WorkbookSnapshot | undefined;
  /** Redo: returns the next snapshot, or undefined if nothing to redo */
  redo: (currentData: CellDataMap | WorkbookSnapshot) => CellDataMap | WorkbookSnapshot | undefined;
  canUndo: boolean;
  canRedo: boolean;
  /** Drop all undo/redo history (e.g. after restoring a saved workbook) */
  clearHistory: () => void;
  /** Oldest → newest states: the undo stack, the current state, then the redo stack. */
  timeline: HistoryTimelineEntry[];
  /** Stored snapshot of timeline state `index` (undefined for the current state or out of range). */
  getTimelineSnapshot: (index: number) => CellDataMap | WorkbookSnapshot | undefined;
  /**
   * Jump straight to timeline state `index` (like repeated undo/redo, in one step): returns the
   * snapshot to restore, or undefined if `index` is the current state. States in between stay
   * reachable (the stacks are rearranged, nothing is dropped).
   */
  jumpTo: (index: number, currentData: CellDataMap | WorkbookSnapshot) => CellDataMap | WorkbookSnapshot | undefined;
}

interface StackEntry {
  data: CellDataMap | WorkbookSnapshot;
  /** When the state this entry holds was created (null = unknown / oldest). */
  time: number | null;
}

function isWorkbookSnapshot(data: CellDataMap | WorkbookSnapshot): data is WorkbookSnapshot {
  return typeof data === 'object' && data !== null && 'sheets' in data && 'activeSheetId' in data;
}

function cloneData(data: CellDataMap | WorkbookSnapshot): CellDataMap | WorkbookSnapshot {
  if (isWorkbookSnapshot(data)) {
    return deepCloneSnapshot(data);
  }
  return deepCloneCellDataMap(data);
}

export function useUndoRedo(): UseUndoRedoReturn {
  const undoStackRef = useRef<StackEntry[]>([]);
  const redoStackRef = useRef<StackEntry[]>([]);
  // When the live state was created (the last action / undo / redo that produced it)
  const currentTimeRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [timeline, setTimeline] = useState<HistoryTimelineEntry[]>([{ time: null, current: true }]);

  const updateFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    setTimeline([
      ...undoStackRef.current.map((e) => ({ time: e.time, current: false })),
      { time: currentTimeRef.current, current: true },
      ...redoStackRef.current.slice().reverse().map((e) => ({ time: e.time, current: false })),
    ]);
  }, []);

  const pushSnapshot = useCallback(
    (data: CellDataMap | WorkbookSnapshot) => {
      undoStackRef.current.push({ data: cloneData(data), time: currentTimeRef.current });
      if (undoStackRef.current.length > MAX_HISTORY) {
        undoStackRef.current.shift();
      }
      currentTimeRef.current = Date.now();
      // Clear redo stack on new action
      redoStackRef.current = [];
      updateFlags();
    },
    [updateFlags],
  );

  const undo = useCallback(
    (currentData: CellDataMap | WorkbookSnapshot): CellDataMap | WorkbookSnapshot | undefined => {
      if (undoStackRef.current.length === 0) return undefined;
      // Save current state to redo stack
      redoStackRef.current.push({ data: cloneData(currentData), time: currentTimeRef.current });
      const entry = undoStackRef.current.pop()!;
      currentTimeRef.current = entry.time;
      updateFlags();
      return entry.data;
    },
    [updateFlags],
  );

  const redo = useCallback(
    (currentData: CellDataMap | WorkbookSnapshot): CellDataMap | WorkbookSnapshot | undefined => {
      if (redoStackRef.current.length === 0) return undefined;
      // Save current state to undo stack
      undoStackRef.current.push({ data: cloneData(currentData), time: currentTimeRef.current });
      const entry = redoStackRef.current.pop()!;
      currentTimeRef.current = entry.time;
      updateFlags();
      return entry.data;
    },
    [updateFlags],
  );

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    currentTimeRef.current = null;
    updateFlags();
  }, [updateFlags]);

  const getTimelineSnapshot = useCallback((index: number) => {
    const undoLen = undoStackRef.current.length;
    if (index < undoLen) return index >= 0 ? undoStackRef.current[index].data : undefined;
    const redoIndex = redoStackRef.current.length - 1 - (index - undoLen - 1);
    return index > undoLen && redoIndex >= 0 ? redoStackRef.current[redoIndex].data : undefined;
  }, []);

  const jumpTo = useCallback(
    (index: number, currentData: CellDataMap | WorkbookSnapshot): CellDataMap | WorkbookSnapshot | undefined => {
      const states: StackEntry[] = [
        ...undoStackRef.current,
        { data: cloneData(currentData), time: currentTimeRef.current },
        ...redoStackRef.current.slice().reverse(),
      ];
      const undoLen = undoStackRef.current.length;
      if (index === undoLen || index < 0 || index >= states.length) return undefined;
      const target = states[index];
      undoStackRef.current = states.slice(0, index);
      redoStackRef.current = states.slice(index + 1).reverse();
      currentTimeRef.current = target.time;
      updateFlags();
      return target.data;
    },
    [updateFlags],
  );

  return { pushSnapshot, undo, redo, canUndo, canRedo, clearHistory, timeline, getTimelineSnapshot, jumpTo };
}
