import { useCallback, useMemo, useRef, useState } from 'react';
import { GRID_CONSTANTS } from '../types/grid';
import { clamp } from '../utils/coordinates';

const { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } = GRID_CONSTANTS;

const MIN_COL_WIDTH = 30;
const MAX_COL_WIDTH = 500;
const MIN_ROW_HEIGHT = 20;
const MAX_ROW_HEIGHT = 500;

/** One sheet's custom column widths / row heights. */
export interface SheetSizes {
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  /** This sheet's size for columns without an entry (e.g. an imported xlsx's default width). */
  defaultColWidth?: number;
  /** This sheet's size for rows without an entry (e.g. an imported xlsx's default height). */
  defaultRowHeight?: number;
  /**
   * Rows whose height was set by auto-fit (wrap text / font size) rather than by the user or a file.
   * Auto-fit may grow and shrink these; other custom heights it only ever grows. Not persisted:
   * after a reload every custom height counts as user-set.
   */
  autoRowHeights?: Set<number>;
}

const colDefault = (sizes: SheetSizes) => sizes.defaultColWidth ?? DEFAULT_COL_WIDTH;
const rowDefault = (sizes: SheetSizes) => sizes.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;

/** Deep copy of one sheet's sizes (maps + defaults). */
function cloneSheetSizes(sizes: SheetSizes): SheetSizes {
  return {
    ...sizes,
    colWidths: new Map(sizes.colWidths),
    rowHeights: new Map(sizes.rowHeights),
    ...(sizes.autoRowHeights ? { autoRowHeights: new Set(sizes.autoRowHeights) } : {}),
  };
}

/** Shift a set of row/column indices for an insert or delete at `index`. */
function shiftIndexSet(set: Set<number>, index: number, operation: 'insert' | 'delete'): Set<number> {
  const next = new Set<number>();
  for (const i of set) {
    if (operation === 'insert') next.add(i >= index ? i + 1 : i);
    else if (i !== index) next.add(i > index ? i - 1 : i);
  }
  return next;
}

export interface UseColumnRowSizesReturn {
  getColWidth: (colIndex: number) => number;
  setColWidth: (colIndex: number, width: number) => void;
  getRowHeight: (rowIndex: number) => number;
  /** Set a row's height; `auto: true` marks it as auto-fit (see SheetSizes.autoRowHeights). */
  setRowHeight: (rowIndex: number, height: number, options?: { auto?: boolean }) => void;
  /** Drop a row's custom height (back to the sheet default). */
  resetRowHeight: (rowIndex: number) => void;
  /** Whether the row's height was set by the user or a file (not by auto-fit, not default). */
  isRowHeightManual: (rowIndex: number) => boolean;
  /** Shift size entries when columns/rows are inserted or deleted */
  shiftColWidths: (index: number, operation: 'insert' | 'delete') => void;
  shiftRowHeights: (index: number, operation: 'insert' | 'delete') => void;
  /** Version counter that increments on any size change (triggers re-render) */
  sizeVersion: number;
  /** The active sheet's width for columns without a custom width */
  defaultColWidth: number;
  /** The active sheet's height for rows without a custom height */
  defaultRowHeight: number;
  /** Get all custom column widths of the active sheet (bulk export) */
  getAllColWidths: () => Map<number, number>;
  /** Get all custom row heights of the active sheet (bulk export) */
  getAllRowHeights: () => Map<number, number>;
  /** Restore all column widths of the active sheet (bulk import) */
  restoreColWidths: (widths: Map<number, number>) => void;
  /** Restore all row heights of the active sheet (bulk import) */
  restoreRowHeights: (heights: Map<number, number>) => void;
  /** Cumulative pixel offset of all columns before `colIndex` (O(log n) via binary search) */
  getColOffset: (colIndex: number) => number;
  /** Cumulative pixel offset of all rows before `rowIndex` (O(log n) via binary search) */
  getRowOffset: (rowIndex: number) => number;
  /** Bulk export of every sheet's own sizes (e.g. xlsx/native file export, one entry per sheet id) */
  getAllSizesBySheet: () => Map<string, SheetSizes>;
  /** Bulk import: replaces every sheet's size maps wholesale (e.g. after opening a file) */
  restoreAllSizes: (sizes: Map<string, SheetSizes>) => void;
  /** Copy one sheet's column widths/row heights onto another (e.g. right after duplicating a sheet) */
  copySheetSizes: (fromSheetId: string, toSheetId: string) => void;
}

/** Sorted custom-size indices with a running prefix sum of (customSize - defaultSize) diffs. */
interface OffsetIndex {
  indices: number[];
  prefixSum: number[];
}

const EMPTY_OFFSET_INDEX: OffsetIndex = { indices: [], prefixSum: [] };

function buildOffsetIndex(sizes: Map<number, number>, defaultSize: number): OffsetIndex {
  if (sizes.size === 0) return EMPTY_OFFSET_INDEX;
  const entries = Array.from(sizes.entries()).sort((a, b) => a[0] - b[0]);
  const indices: number[] = new Array(entries.length);
  const prefixSum: number[] = new Array(entries.length);
  let sum = 0;
  for (let i = 0; i < entries.length; i++) {
    const [idx, size] = entries[i];
    sum += size - defaultSize;
    indices[i] = idx;
    prefixSum[i] = sum;
  }
  return { indices, prefixSum };
}

/** Sum of (customSize - defaultSize) diffs for all custom entries with index < targetIndex. */
function sumDiffsBefore(oi: OffsetIndex, targetIndex: number): number {
  let lo = 0;
  let hi = oi.indices.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (oi.indices[mid] < targetIndex) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? oi.prefixSum[lo - 1] : 0;
}

function computeOffset(index: number, oi: OffsetIndex, defaultSize: number): number {
  return index * defaultSize + sumDiffsBefore(oi, index);
}

/** Shift a single size map's keys for a column/row insert or delete at `index`. */
function shiftSizeMap(map: Map<number, number>, index: number, operation: 'insert' | 'delete'): Map<number, number> {
  const newMap = new Map<number, number>();
  for (const [i, size] of map) {
    if (operation === 'insert') {
      newMap.set(i >= index ? i + 1 : i, size);
    } else if (i === index) {
      // deleted — drop it
    } else {
      newMap.set(i > index ? i - 1 : i, size);
    }
  }
  return newMap;
}

/**
 * Tracks column widths and row heights, independently per sheet (keyed by sheet id).
 * All of `getColWidth`/`setColWidth`/`getRowHeight`/`setRowHeight`/`shift*`/`getAll*`/`restore*`/
 * `getColOffset`/`getRowOffset` operate on whichever sheet `activeSheetId` currently names.
 */
export function useColumnRowSizes(activeSheetId: string): UseColumnRowSizesReturn {
  // Per-sheet size maps, keyed by sheet id. Created lazily on first access (an empty entry means
  // every column/row on that sheet is still at its default size).
  const sheetSizesRef = useRef<Map<string, SheetSizes>>(new Map());
  const [sizeVersion, setSizeVersion] = useState(0);

  const getSheetSizes = useCallback((sheetId: string): SheetSizes => {
    let entry = sheetSizesRef.current.get(sheetId);
    if (!entry) {
      entry = { colWidths: new Map(), rowHeights: new Map() };
      sheetSizesRef.current.set(sheetId, entry);
    }
    return entry;
  }, []);

  // Prefix-sum offset indices for the active sheet only, rebuilt whenever it changes or any
  // size mutation bumps sizeVersion (mutations on other sheets cause a harmless extra rebuild).
  // The active sheet's defaults (only restoreAllSizes changes them, which bumps sizeVersion)
  const defaultColWidth = useMemo(
    () => colDefault(getSheetSizes(activeSheetId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSheetId, sizeVersion],
  );
  const defaultRowHeight = useMemo(
    () => rowDefault(getSheetSizes(activeSheetId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSheetId, sizeVersion],
  );

  const colOffsetIndex = useMemo(
    () => buildOffsetIndex(getSheetSizes(activeSheetId).colWidths, defaultColWidth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSheetId, sizeVersion, defaultColWidth],
  );
  const rowOffsetIndex = useMemo(
    () => buildOffsetIndex(getSheetSizes(activeSheetId).rowHeights, defaultRowHeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSheetId, sizeVersion, defaultRowHeight],
  );

  const getColWidth = useCallback((colIndex: number): number => {
    const sizes = getSheetSizes(activeSheetId);
    return sizes.colWidths.get(colIndex) ?? colDefault(sizes);
  }, [activeSheetId, getSheetSizes]);

  const setColWidth = useCallback((colIndex: number, width: number) => {
    const clamped = clamp(width, MIN_COL_WIDTH, MAX_COL_WIDTH);
    getSheetSizes(activeSheetId).colWidths.set(colIndex, clamped);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const getRowHeight = useCallback((rowIndex: number): number => {
    const sizes = getSheetSizes(activeSheetId);
    return sizes.rowHeights.get(rowIndex) ?? rowDefault(sizes);
  }, [activeSheetId, getSheetSizes]);

  const setRowHeight = useCallback((rowIndex: number, height: number, options?: { auto?: boolean }) => {
    const clamped = clamp(height, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    const sizes = getSheetSizes(activeSheetId);
    sizes.rowHeights.set(rowIndex, clamped);
    if (options?.auto) (sizes.autoRowHeights ??= new Set()).add(rowIndex);
    else sizes.autoRowHeights?.delete(rowIndex);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const resetRowHeight = useCallback((rowIndex: number) => {
    const sizes = getSheetSizes(activeSheetId);
    if (!sizes.rowHeights.delete(rowIndex)) return;
    sizes.autoRowHeights?.delete(rowIndex);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const isRowHeightManual = useCallback((rowIndex: number): boolean => {
    const sizes = getSheetSizes(activeSheetId);
    return sizes.rowHeights.has(rowIndex) && !sizes.autoRowHeights?.has(rowIndex);
  }, [activeSheetId, getSheetSizes]);

  const shiftColWidths = useCallback((index: number, operation: 'insert' | 'delete') => {
    const entry = getSheetSizes(activeSheetId);
    entry.colWidths = shiftSizeMap(entry.colWidths, index, operation);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const shiftRowHeights = useCallback((index: number, operation: 'insert' | 'delete') => {
    const entry = getSheetSizes(activeSheetId);
    entry.rowHeights = shiftSizeMap(entry.rowHeights, index, operation);
    if (entry.autoRowHeights) entry.autoRowHeights = shiftIndexSet(entry.autoRowHeights, index, operation);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const getAllColWidths = useCallback((): Map<number, number> => {
    return new Map(getSheetSizes(activeSheetId).colWidths);
  }, [activeSheetId, getSheetSizes]);

  const getAllRowHeights = useCallback((): Map<number, number> => {
    return new Map(getSheetSizes(activeSheetId).rowHeights);
  }, [activeSheetId, getSheetSizes]);

  const restoreColWidths = useCallback((widths: Map<number, number>) => {
    getSheetSizes(activeSheetId).colWidths = new Map(widths);
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const restoreRowHeights = useCallback((heights: Map<number, number>) => {
    const sizes = getSheetSizes(activeSheetId);
    sizes.rowHeights = new Map(heights);
    sizes.autoRowHeights = undefined;
    setSizeVersion((v) => v + 1);
  }, [activeSheetId, getSheetSizes]);

  const getColOffset = useCallback((colIndex: number): number => {
    return computeOffset(colIndex, colOffsetIndex, defaultColWidth);
  }, [colOffsetIndex, defaultColWidth]);

  const getRowOffset = useCallback((rowIndex: number): number => {
    return computeOffset(rowIndex, rowOffsetIndex, defaultRowHeight);
  }, [rowOffsetIndex, defaultRowHeight]);

  const getAllSizesBySheet = useCallback((): Map<string, SheetSizes> => {
    const result = new Map<string, SheetSizes>();
    for (const [sheetId, entry] of sheetSizesRef.current) {
      result.set(sheetId, cloneSheetSizes(entry));
    }
    return result;
  }, []);

  const restoreAllSizes = useCallback((sizes: Map<string, SheetSizes>) => {
    const next = new Map<string, SheetSizes>();
    for (const [sheetId, entry] of sizes) {
      next.set(sheetId, cloneSheetSizes(entry));
    }
    sheetSizesRef.current = next;
    setSizeVersion((v) => v + 1);
  }, []);

  const copySheetSizes = useCallback((fromSheetId: string, toSheetId: string) => {
    sheetSizesRef.current.set(toSheetId, cloneSheetSizes(getSheetSizes(fromSheetId)));
    setSizeVersion((v) => v + 1);
  }, [getSheetSizes]);

  return {
    getColWidth,
    setColWidth,
    getRowHeight,
    setRowHeight,
    resetRowHeight,
    isRowHeightManual,
    shiftColWidths,
    shiftRowHeights,
    sizeVersion,
    defaultColWidth,
    defaultRowHeight,
    getAllColWidths,
    getAllRowHeights,
    restoreColWidths,
    restoreRowHeights,
    getColOffset,
    getRowOffset,
    getAllSizesBySheet,
    restoreAllSizes,
    copySheetSizes,
  };
}
