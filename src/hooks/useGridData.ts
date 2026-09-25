import { useCallback, useRef, useState } from 'react';
import type {
  CellData,
  CellDataMap,
  CellPosition,
  CellStyle,
  ConditionalFormatRule,
  FilterCondition,
  FilterRange,
  MergeInfo,
  NamedRange,
  PivotTableConfig,
  SelectionRange,
  SheetData,
  SortKey,
  ValidationRule,
  WorkbookData,
} from '../types/grid';
import type { ChartData } from '../types/chart';
// GRID_CONSTANTS used indirectly via createEmptySheet
import { cellKey, colIndexToLetter, parseCellKey } from '../utils/coordinates';
import { updateReferences } from '../utils/referenceUpdater';
import { parseCached } from '../engine/astCache';
import { evaluate, extractReferences } from '../engine/evaluator';
import { DependencyGraph } from '../engine/dependency';
import type { GlobalRangeDep } from '../engine/dependency';
import type {
  FormulaResult,
  FunctionReturnValue,
  NamedRangeResolver,
  RangeExpander,
  SheetNameResolver,
} from '../engine/types';
import { isFormulaError, isSpillResult } from '../engine/types';
import { formatNumberForText } from '../engine/coerce';
import { parseUserInput } from '../utils/valueParser';
import { useUndoRedo } from './useUndoRedo';
import type { HistoryTimelineEntry, WorkbookSnapshot } from './useUndoRedo';
import {
  createEmptySheet,
  generateSheetName,
  generateCopyName,
  deepCloneSheet,
  generateSheetId,
} from '../utils/sheetUtils';
import { resolveSpill, clearSpillRange } from '../engine/spill';
import type { SparklineConfig } from '../types/sparkline';
import {
  addGroup as addGroupFn,
  removeGroup as removeGroupFn,
  toggleGroupCollapse as toggleGroupCollapseFn,
  setExpandLevel as setExpandLevelFn,
  shiftGroupRanges,
} from '../grouping/groupManager';
import { computeSortOrder } from '../utils/sortRange';
import { shiftFormula } from '../utils/formulaShift';
import { findDuplicateRows, normalizeWhitespace, splitText } from '../utils/dataCleanup';
import { getCellDisplay } from '../utils/cellDisplay';
import { FormulaSyntaxError } from '../engine/syntaxError';
import { recalcProfiler } from '../engine/recalcProfiler';
import type { PassCacheStats } from '../engine/types';

/** Caches shared by one recalculation pass (see CLAUDE.md "Performance invariants"). */
interface PassCache {
  rangeCache: Map<string, FormulaResult[][]>;
  callCache: Map<string, FunctionReturnValue>;
  /** Only while the recalculation profiler records. */
  passStats?: PassCacheStats;
}

/** The message + position of a formula syntax error, for CellData.parseError (other errors: none). */
function toParseErrorInfo(e: unknown): CellData['parseError'] {
  return e instanceof FormulaSyntaxError
    ? { message: e.message, start: e.start, end: e.end }
    : undefined;
}

export interface UseGridDataReturn {
  getCellData: (col: number, row: number) => CellData | undefined;
  setCellValue: (col: number, row: number, value: string) => void;
  deleteCells: (positions: CellPosition[]) => void;
  /** Batch-set multiple cell values as a single undo step */
  batchSetCellValues: (entries: Array<{ col: number; row: number; value: string }>) => void;
  /** Batch-set cell values on an arbitrary (possibly inactive) sheet, as a single undo step
   * (used by "replace all" when searching across all sheets). */
  batchSetCellValuesOnSheet: (
    sheetId: string,
    entries: Array<{ col: number; row: number; value: string }>,
  ) => void;
  /** Replace the entire cell data map (e.g. for import). Single undo step. */
  replaceAllData: (data: CellDataMap) => void;
  /** Get the raw CellDataMap (for export) */
  getDataMap: () => CellDataMap;
  /** Apply style to selected cells (single undo step) */
  setCellStyle: (positions: CellPosition[], style: Partial<CellStyle>) => void;
  /** Insert a column before or after the given index */
  insertColumn: (
    colIndex: number,
    position: 'before' | 'after',
    colCount: number,
    maxCols: number,
  ) => boolean;
  /** Delete a column */
  deleteColumn: (colIndex: number) => boolean;
  /** Insert a row before or after the given index */
  insertRow: (
    rowIndex: number,
    position: 'before' | 'after',
    rowCount: number,
    maxRows: number,
  ) => boolean;
  /** Delete a row */
  deleteRow: (rowIndex: number) => boolean;
  /** Insert `count` columns before the given absolute index, as a single undo step */
  insertColumns: (index: number, count: number, colCount: number, maxCols: number) => boolean;
  /** Delete columns `start`..`end` (inclusive), as a single undo step */
  deleteColumns: (start: number, end: number) => boolean;
  /** Insert `count` rows before the given absolute index, as a single undo step */
  insertRows: (index: number, count: number, rowCount: number, maxRows: number) => boolean;
  /** Delete rows `start`..`end` (inclusive), as a single undo step */
  deleteRows: (start: number, end: number) => boolean;
  /** Undo last operation */
  undo: () => void;
  /** Redo last undone operation */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Developer tools: undo timeline (oldest → newest, including the current state). */
  historyTimeline: HistoryTimelineEntry[];
  jumpToHistory: (index: number) => void;
  getHistorySnapshot: (index: number) => WorkbookSnapshot | undefined;
  getDependencyInfo: (
    sheetId: string,
    key: string,
  ) => {
    precedents: string[];
    rangePrecedents: GlobalRangeDep[];
    dependents: string[];
  };
  /** Trigger re-render after mutations */
  version: number;

  // Multi-sheet operations
  sheets: SheetData[];
  activeSheetId: string;
  addSheet: () => void;
  deleteSheet: (sheetId: string) => boolean;
  renameSheet: (sheetId: string, newName: string) => boolean;
  setActiveSheet: (sheetId: string) => void;
  getActiveSheet: () => SheetData;
  getColCount: () => number;
  getRowCount: () => number;
  setColCount: (count: number) => void;
  setRowCount: (count: number) => void;
  /** Duplicate a sheet (values, formulas, styles, charts/sparklines/CF rules with new ids). Returns the new sheet's id, or null if not found. */
  duplicateSheet: (sheetId: string) => string | null;
  /** Move a sheet to a new position within the sheets array (toIndex is clamped). */
  moveSheet: (sheetId: string, toIndex: number) => void;
  /** Set (or clear) a sheet's tab color. */
  setSheetTabColor: (sheetId: string, color: string | undefined) => void;
  /** Hide or show a sheet. Returns false (no-op) if this would leave zero visible sheets. */
  setSheetHidden: (sheetId: string, hidden: boolean) => boolean;

  // Row/column hide/unhide (active sheet)
  hideRows: (start: number, end: number) => void;
  unhideRows: (start: number, end: number) => void;
  hideCols: (start: number, end: number) => void;
  unhideCols: (start: number, end: number) => void;

  // Per-sheet frozen pane
  getFrozenRows: () => number;
  getFrozenCols: () => number;
  setFrozenRows: (count: number) => void;
  setFrozenCols: (count: number) => void;

  // Per-sheet filter (value-based)
  getFilterState: () => Map<number, Set<string>>;
  setFilterState: (state: Map<number, Set<string>>) => void;
  // Per-sheet filter range + condition-based filters
  getFilterRange: () => FilterRange | undefined;
  /** "フィルタを作成": sets the filter range, resetting any previous value/condition filters. */
  createFilter: (range: FilterRange) => void;
  /** "フィルタを削除": clears filterRange, filterState and filterConditions. */
  removeFilter: () => void;
  getFilterConditions: () => Record<number, FilterCondition>;
  setFilterCondition: (col: number, condition: FilterCondition | undefined) => void;

  // Range/sheet sort (Google Sheets-style; replaces cell data in place, keeping styles/comments/validation)
  sortRange: (
    range: { startCol: number; endCol: number; startRow: number; endRow: number },
    keys: SortKey[],
    onSorted?: (order: number[]) => void,
  ) => boolean;

  // Sort: replace cell data directly (avoids re-parsing)
  replaceCellDataDirect: (newData: CellDataMap) => void;
  /** Clear cells on a specific sheet (for cross-sheet cut-paste) */
  clearCellsOnSheet: (sheetId: string, positions: Array<{ col: number; row: number }>) => void;

  // Data cleanup tools
  /** "重複を削除": dedupes rows in `range` by the display value of `checkCols` (absolute column indices). */
  removeDuplicateRows: (
    range: { startCol: number; endCol: number; startRow: number; endRow: number },
    hasHeader: boolean,
    checkCols: number[],
  ) => { duplicateCount: number; uniqueCount: number };
  /** "空白文字を削除": trims/collapses whitespace in string (non-formula) cells within `range`. */
  trimWhitespaceInRange: (range: {
    startCol: number;
    endCol: number;
    startRow: number;
    endRow: number;
  }) => void;
  /** "テキストを列に分割": splits column `col`'s cells (startRow..endRow) on `delimiter` into the columns to its right. */
  splitTextToColumns: (col: number, startRow: number, endRow: number, delimiter: string) => void;

  // Conditional format
  addConditionalFormatRule: (rule: Omit<ConditionalFormatRule, 'id'>) => void;
  updateConditionalFormatRule: (ruleId: string, updates: Partial<ConditionalFormatRule>) => void;
  deleteConditionalFormatRule: (ruleId: string) => void;
  getConditionalFormatRules: () => ConditionalFormatRule[];

  // Workbook-level replace (for native file import)
  replaceWorkbook: (workbook: WorkbookData, options?: { resetHistory?: boolean }) => void;

  // Document title (Google Sheets-style editable title; not part of undo/redo)
  title: string | undefined;
  setTitle: (title: string) => void;
  /** ファイル > 新規作成: reset to a single empty sheet, clearing named ranges/pivot tables/title and undo history. */
  newWorkbook: () => void;

  // Cell merge operations
  mergeCells: (range: SelectionRange) => void;
  unmergeCells: (anchorKey: string) => void;
  getMergeInfo: (col: number, row: number) => MergeInfo | undefined;

  // Cell comment operations
  setCellComment: (col: number, row: number, comment: string | undefined) => void;

  // Data validation operations
  setValidationRule: (positions: CellPosition[], rule: ValidationRule | undefined) => void;

  // Chart operations
  addChart: (chart: ChartData) => void;
  updateChart: (chartId: string, updates: Partial<ChartData>) => void;
  deleteChart: (chartId: string) => void;
  getCharts: () => ChartData[];

  // Named range operations
  namedRanges: NamedRange[];
  addNamedRange: (name: string, range: string, refSheetId?: string) => boolean;
  updateNamedRange: (
    oldName: string,
    newName: string,
    range: string,
    refSheetId?: string,
  ) => boolean;
  deleteNamedRange: (name: string) => boolean;

  // Sparkline operations
  addSparkline: (config: SparklineConfig) => void;
  updateSparkline: (id: string, updates: Partial<SparklineConfig>) => void;
  deleteSparkline: (id: string) => void;
  getSparklines: () => SparklineConfig[];

  // Grouping operations
  addRowGroup: (start: number, end: number) => boolean;
  addColGroup: (start: number, end: number) => boolean;
  removeRowGroup: (groupId: string) => void;
  removeColGroup: (groupId: string) => void;
  toggleRowGroupCollapse: (groupId: string) => void;
  toggleColGroupCollapse: (groupId: string) => void;
  setRowExpandLevel: (level: number) => void;
  setColExpandLevel: (level: number) => void;

  // Pivot table operations
  pivotTables: PivotTableConfig[];
  addPivotTable: (config: PivotTableConfig) => void;
  updatePivotTable: (id: string, updates: Partial<PivotTableConfig>) => void;
  deletePivotTable: (id: string) => void;

  // Formula evaluation helper (for function wizard)
  evaluateFormula: (formula: string) => string;
  /** Evaluate a formula (leading '=' optional) as if positioned at (col, row) on the given sheet (defaults to active). Used by conditional formatting / data validation custom formulas. */
  evaluateFormulaAt: (formula: string, col: number, row: number, sheetId?: string) => FormulaResult;
  /** Row-major values of a range string ('A1:B3' / 'Sheet2!A1:A5' / "'My Sheet'!A1:A5"). null if it can't be resolved. */
  resolveRangeValues: (range: string, sheetId?: string) => FormulaResult[] | null;

  /** Run several mutations as one undo step */
  transact: (fn: () => void) => void;
}

/**
 * Expand a range reference (e.g., "A1" to "B3") into an array of cell keys.
 */
const expandRange: RangeExpander = (startKey: string, endKey: string): string[] => {
  const start = parseCellKey(startKey);
  const end = parseCellKey(endKey);

  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);

  const keys: string[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      keys.push(`${colIndexToLetter(col)}${row + 1}`);
    }
  }
  return keys;
};

/**
 * Format a formula result for display.
 */
function formatResult(result: FormulaResult): string {
  if (isFormulaError(result)) {
    return result.code;
  }
  if (typeof result === 'boolean') {
    return result ? 'TRUE' : 'FALSE';
  }
  if (typeof result === 'number') {
    return formatNumberForText(result);
  }
  return String(result);
}

// Shared empty values so getters return a stable identity when a sheet has no filter (memo-friendly)
const EMPTY_FILTER_STATE: Map<number, Set<string>> = new Map();
const EMPTY_FILTER_CONDITIONS: Record<number, FilterCondition> = {};

function plainDisplayValue(v: number | string | boolean): string {
  if (typeof v === 'number') return formatNumberForText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Fill in `computed`/`displayValue` for plain (non-formula) cells that lack them,
 * e.g. after deserializing a file (only rawValue is persisted). Idempotent.
 */
function hydratePlainCells(sheets: SheetData[]): void {
  for (const sheet of sheets) {
    for (const cell of sheet.cells.values()) {
      // Imported/deserialized formulas only carry rawValue ('=SUM(A1:A3)'); register them as formulas
      // so the following rebuildGlobalDepGraph + recalculateAll evaluate them.
      if (
        cell.formula === undefined &&
        !cell.spillSource &&
        cell.rawValue.length > 1 &&
        cell.rawValue.startsWith('=')
      ) {
        cell.formula = cell.rawValue.slice(1);
        cell.computed = undefined;
        continue;
      }
      if (
        cell.formula !== undefined ||
        cell.spillSource ||
        cell.computed !== undefined ||
        cell.rawValue === ''
      )
        continue;
      const parsed =
        cell.style?.numberFormat === 'plainText'
          ? { value: cell.rawValue }
          : parseUserInput(cell.rawValue);
      cell.computed = parsed.value;
      cell.displayValue = plainDisplayValue(parsed.value);
    }
  }
}

// ===== Sparkline reference shifting helpers =====

/** Shift sparkline dataRange and locationCell when a column is inserted or deleted */
function shiftSparklineRefsForCol(
  sparklines: SparklineConfig[],
  colIndex: number,
  op: 'insert' | 'delete',
): SparklineConfig[] {
  return sparklines
    .map((s) => {
      const newDataRange = shiftRangeStringCol(s.dataRange, colIndex, op);
      const newLocation = shiftCellKeyCol(s.locationCell, colIndex, op);
      if (!newLocation) return null; // deleted
      return { ...s, dataRange: newDataRange, locationCell: newLocation };
    })
    .filter((s): s is SparklineConfig => s !== null);
}

/** Shift sparkline dataRange and locationCell when a row is inserted or deleted */
function shiftSparklineRefsForRow(
  sparklines: SparklineConfig[],
  rowIndex: number,
  op: 'insert' | 'delete',
): SparklineConfig[] {
  return sparklines
    .map((s) => {
      const newDataRange = shiftRangeStringRow(s.dataRange, rowIndex, op);
      const newLocation = shiftCellKeyRow(s.locationCell, rowIndex, op);
      if (!newLocation) return null; // deleted
      return { ...s, dataRange: newDataRange, locationCell: newLocation };
    })
    .filter((s): s is SparklineConfig => s !== null);
}

function shiftCellKeyCol(key: string, colIndex: number, op: 'insert' | 'delete'): string | null {
  const { col, row } = parseCellKey(key);
  if (op === 'insert') {
    if (col >= colIndex) return cellKey(col + 1, row);
  } else {
    if (col === colIndex) return null;
    if (col > colIndex) return cellKey(col - 1, row);
  }
  return key;
}

function shiftCellKeyRow(key: string, rowIndex: number, op: 'insert' | 'delete'): string | null {
  const { col, row } = parseCellKey(key);
  if (op === 'insert') {
    if (row >= rowIndex) return cellKey(col, row + 1);
  } else {
    if (row === rowIndex) return null;
    if (row > rowIndex) return cellKey(col, row - 1);
  }
  return key;
}

function shiftRangeStringCol(range: string, colIndex: number, op: 'insert' | 'delete'): string {
  const parts = range.split(':');
  if (parts.length !== 2) return range;
  const start = shiftCellKeyCol(parts[0], colIndex, op);
  const end = shiftCellKeyCol(parts[1], colIndex, op);
  if (!start || !end) return range;
  return `${start}:${end}`;
}

function shiftRangeStringRow(range: string, rowIndex: number, op: 'insert' | 'delete'): string {
  const parts = range.split(':');
  if (parts.length !== 2) return range;
  const start = shiftCellKeyRow(parts[0], rowIndex, op);
  const end = shiftCellKeyRow(parts[1], rowIndex, op);
  if (!start || !end) return range;
  return `${start}:${end}`;
}

export function useGridData(): UseGridDataReturn {
  // Multi-sheet state
  const [initialSheet] = useState(() => createEmptySheet('Sheet1'));
  const sheetsRef = useRef<SheetData[]>([initialSheet]);
  const activeSheetIdRef = useRef<string>(initialSheet.id);

  // State mirrors for rendering (updated alongside version)
  const [sheetsState, setSheetsState] = useState<SheetData[]>([initialSheet]);
  const [activeSheetIdState, setActiveSheetIdState] = useState<string>(initialSheet.id);

  // Named ranges (workbook scope)
  const namedRangesRef = useRef<NamedRange[]>([]);
  const [namedRangesState, setNamedRangesState] = useState<NamedRange[]>([]);

  // Pivot tables (workbook scope)
  const pivotTablesRef = useRef<PivotTableConfig[]>([]);
  const [pivotTablesState, setPivotTablesState] = useState<PivotTableConfig[]>([]);

  // Document title (workbook scope; not part of undo/redo history, see setTitle)
  const titleRef = useRef<string | undefined>(undefined);
  const [titleState, setTitleState] = useState<string | undefined>(undefined);

  // Global dependency graph uses sheetId:cellKey as keys for cross-sheet deps
  const depGraphRef = useRef(new DependencyGraph());
  const versionRef = useRef(0);
  const [version, setVersionState] = useState(0);
  const {
    pushSnapshot,
    undo: undoStack,
    redo: redoStack,
    canUndo,
    canRedo,
    clearHistory,
    timeline: historyTimeline,
    getTimelineSnapshot,
    jumpTo: jumpHistoryTo,
  } = useUndoRedo();

  // Global keys (sheetId:cellKey) of cells whose formula is volatile (TODAY, NOW, ...)
  const volatileKeysRef = useRef(new Set<string>());
  // Cache of per-sheet used-range bounds, for resolving column/row-wide references (A:A, 1:3, A2:C)
  const usedBoundsCacheRef = useRef(new Map<string, { rows: number; cols: number }>());
  // Global keys written/cleared by spill during the current setCellValueInternal call(s),
  // collected so the caller can include them as extra recalculation triggers
  const lastSpillTouchedRef = useRef<string[]>([]);

  // Helper: bump version and sync state mirrors from refs
  const bumpVersion = useCallback(() => {
    usedBoundsCacheRef.current.clear();
    setSheetsState(sheetsRef.current);
    setActiveSheetIdState(activeSheetIdRef.current);
    setNamedRangesState(namedRangesRef.current);
    setPivotTablesState(pivotTablesRef.current);
    setTitleState(titleRef.current);
    versionRef.current += 1;
    setVersionState(versionRef.current);
  }, []);

  // Helper: get active sheet
  const getActiveSheet = useCallback((): SheetData => {
    const sheet = sheetsRef.current.find((s) => s.id === activeSheetIdRef.current);
    return sheet ?? sheetsRef.current[0];
  }, []);

  // Helper: get sheet by id
  const getSheetById = useCallback((sheetId: string): SheetData | undefined => {
    return sheetsRef.current.find((s) => s.id === sheetId);
  }, []);

  // Helper: resolve a sheet name to a sheet ID (for the evaluator)
  const resolveSheetName: SheetNameResolver = useCallback(
    (sheetName: string): string | undefined => {
      const sheet = sheetsRef.current.find((s) => s.name === sheetName);
      return sheet?.id;
    },
    [],
  );

  // Helper: build a named-range resolver scoped to the sheet a formula lives on.
  // A named range with no refSheetId targets the formula's own sheet (sheetId), not
  // necessarily the currently active sheet. Keys are only prefixed with `${targetSheetId}:`
  // when the target sheet differs from the evaluating sheet, since the evaluator's
  // resolver treats unprefixed keys as belonging to the evaluating sheet.
  const namedRangeResolverFor = useCallback((sheetId: string): NamedRangeResolver => {
    return (name: string) => {
      const nr = namedRangesRef.current.find((r) => r.name === name);
      if (!nr) return undefined;

      const rangeStr = nr.range;
      const targetSheetId = nr.refSheetId ?? sheetId;
      const addPrefix = targetSheetId !== sheetId;

      if (rangeStr.includes(':')) {
        const [startStr, endStr] = rangeStr.split(':');
        const keys = expandRange(startStr, endStr);
        return {
          keys: addPrefix ? keys.map((k) => `${targetSheetId}:${k}`) : keys,
          sheetId: targetSheetId,
        };
      }
      return {
        keys: addPrefix ? [`${targetSheetId}:${rangeStr}`] : [rangeStr],
        sheetId: targetSheetId,
      };
    };
  }, []);

  /** Bounds of the used range for a sheet (max row+1 / col+1 among non-empty/formula cells), cached. */
  const getUsedBounds = useCallback((sheetId: string): { rows: number; cols: number } => {
    const cached = usedBoundsCacheRef.current.get(sheetId);
    if (cached) return cached;

    const sheet = sheetsRef.current.find((s) => s.id === sheetId);
    let maxRow = -1;
    let maxCol = -1;
    if (sheet) {
      for (const [key, cell] of sheet.cells) {
        // Spill targets have no rawValue/formula but hold values, so they count as used
        if (cell.rawValue === '' && cell.formula === undefined && !cell.spillSource) continue;
        const { col, row } = parseCellKey(key);
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
      }
    }
    const bounds = { rows: maxRow + 1, cols: maxCol + 1 };
    usedBoundsCacheRef.current.set(sheetId, bounds);
    return bounds;
  }, []);

  /** Render a range's coordinates back into a formula-style label (e.g. 'A1:B3', 'A:C', '1:3'). */
  function rangeLabel(r: {
    startCol: number;
    startRow: number;
    endCol: number | null;
    endRow: number | null;
  }): string {
    if (r.endRow === null) {
      // Column-wide / end-open range: 'A:C' if the whole column, else 'A2:C'
      const startLabel =
        r.startRow === 0
          ? colIndexToLetter(r.startCol)
          : `${colIndexToLetter(r.startCol)}${r.startRow + 1}`;
      return `${startLabel}:${colIndexToLetter(r.endCol ?? r.startCol)}`;
    }
    if (r.endCol === null) {
      // Row-wide range: '1:3'
      return `${r.startRow + 1}:${r.endRow + 1}`;
    }
    return `${colIndexToLetter(r.startCol)}${r.startRow + 1}:${colIndexToLetter(r.endCol)}${r.endRow + 1}`;
  }

  // Helper: build a global key for dependency graph
  const globalKey = useCallback((sheetId: string, cellKey: string): string => {
    return `${sheetId}:${cellKey}`;
  }, []);

  // Helper: parse a global key
  const parseGlobalKey = useCallback((gKey: string): { sheetId: string; cellKey: string } => {
    const colonIdx = gKey.indexOf(':');
    if (colonIdx === -1) return { sheetId: activeSheetIdRef.current, cellKey: gKey };
    return { sheetId: gKey.substring(0, colonIdx), cellKey: gKey.substring(colonIdx + 1) };
  }, []);

  /**
   * Create a workbook snapshot for undo/redo
   */
  const createWorkbookSnapshot = useCallback((): WorkbookSnapshot => {
    // Live references: useUndoRedo deep-clones on push/undo/redo, so cloning here would double the cost
    return {
      sheets: sheetsRef.current,
      activeSheetId: activeSheetIdRef.current,
    };
  }, []);

  /**
   * Push workbook snapshot for undo
   */
  // Transactions group several mutations (e.g. paste = values + styles) into a single undo step:
  // only the first snapshot inside the outermost transaction is recorded.
  const transactionDepthRef = useRef(0);
  const transactionSnapshotTakenRef = useRef(false);

  const pushWorkbookSnapshot = useCallback(() => {
    if (transactionDepthRef.current > 0) {
      if (transactionSnapshotTakenRef.current) return;
      transactionSnapshotTakenRef.current = true;
    }
    pushSnapshot(createWorkbookSnapshot());
  }, [pushSnapshot, createWorkbookSnapshot]);

  const transact = useCallback((fn: () => void) => {
    if (transactionDepthRef.current === 0) transactionSnapshotTakenRef.current = false;
    transactionDepthRef.current++;
    try {
      fn();
    } finally {
      transactionDepthRef.current--;
    }
  }, []);

  /**
   * Rebuild the global dependency graph from all sheets by re-parsing every formula
   * (rather than trusting each cell's stored `dependencies` snapshot).
   */
  const rebuildGlobalDepGraph = useCallback(() => {
    const graph = depGraphRef.current;
    graph.rebuildFromCellData(new Map()); // Clear
    volatileKeysRef.current.clear();

    for (const sheet of sheetsRef.current) {
      const resolveNR = namedRangeResolverFor(sheet.id);
      for (const [key, cell] of sheet.cells) {
        if (cell.formula === undefined) continue;
        const gKey = globalKey(sheet.id, key);
        try {
          const ast = parseCached(cell.formula);
          const refs = extractReferences(ast, resolveSheetName, resolveNR);
          const globalDeps = refs.cells.map((c) => (c.includes(':') ? c : globalKey(sheet.id, c)));
          const rangeDeps: GlobalRangeDep[] = refs.ranges.map((r) => ({
            sheetId: r.sheetId ?? sheet.id,
            startCol: r.startCol,
            startRow: r.startRow,
            endCol: r.endCol,
            endRow: r.endRow,
          }));
          graph.setDependencies(gKey, globalDeps, rangeDeps);
          if (refs.volatile) volatileKeysRef.current.add(gKey);
        } catch {
          // Parse failure: leave this cell with no registered dependencies.
        }
      }
    }
  }, [globalKey, namedRangeResolverFor, resolveSheetName]);

  /**
   * Resolve a cell key to its evaluated value (for use by the evaluator).
   * Supports both local keys (A1) and cross-sheet keys (sheetId:A1).
   */
  const resolveCell = useCallback(
    (key: string): FormulaResult => {
      let targetSheet: SheetData;
      let cellRef: string;

      if (key.includes(':')) {
        const { sheetId, cellKey: ck } = parseGlobalKey(key);
        const sheet = getSheetById(sheetId);
        if (!sheet) {
          return { type: 'error' as const, code: '#REF!' as import('../engine/types').ErrorCode };
        }
        targetSheet = sheet;
        cellRef = ck;
      } else {
        targetSheet = getActiveSheet();
        cellRef = key;
      }

      const normalizedKey = cellRef.toUpperCase();
      const cell = targetSheet.cells.get(normalizedKey);
      if (!cell) return ''; // Empty cell returns empty string (coerced to 0 in numeric context)
      if (cell.error) {
        return { type: 'error' as const, code: cell.error as import('../engine/types').ErrorCode };
      }
      if (cell.computed !== undefined) return cell.computed;
      // Fallback: parse from the display/raw string (used when `computed` hasn't been set yet)
      if (cell.formula !== undefined) {
        // For formula cells, return the evaluated result
        const display = cell.displayValue;
        // Try to parse as number
        const num = Number(display);
        if (display !== '' && !isNaN(num) && display !== 'TRUE' && display !== 'FALSE') {
          return num;
        }
        if (display === 'TRUE') return true;
        if (display === 'FALSE') return false;
        return display;
      }
      // For plain value cells
      const raw = cell.rawValue;
      if (raw === '') return '';
      // Try to parse as boolean
      if (raw.toUpperCase() === 'TRUE') return true;
      if (raw.toUpperCase() === 'FALSE') return false;
      // Try to parse as number
      const num = Number(raw);
      if (!isNaN(num)) return num;
      return raw;
    },
    [getActiveSheet, getSheetById, parseGlobalKey],
  );

  /**
   * Evaluate a single cell's formula and update its displayValue/computed.
   * The gKey is the global key (sheetId:cellKey).
   * Returns the global keys of any cells written to or cleared by spill (for
   * chaining into the next recalculation pass); empty if spill wasn't involved.
   */
  const evaluateCell = useCallback(
    (gKey: string, passCache?: PassCache): string[] => {
      const { sheetId, cellKey: ck } = parseGlobalKey(gKey);
      const sheet = getSheetById(sheetId);
      if (!sheet) return [];
      const cell = sheet.cells.get(ck);
      if (!cell || cell.formula === undefined) return [];

      const touched: string[] = [];

      try {
        const ast = parseCached(cell.formula);
        cell.parseError = undefined;
        // Create a resolver that resolves using global keys relative to the cell's sheet
        const sheetResolver = (key: string): FormulaResult => {
          if (key.includes(':')) return resolveCell(key);
          return resolveCell(globalKey(sheetId, key));
        };

        // Hyperlink metadata callback
        let hyperlinkMeta: { url: string; label: string } | undefined;
        const setHyperlinkMeta = (url: string, label: string) => {
          hyperlinkMeta = { url, label };
        };

        const { col, row } = parseCellKey(ck);
        const result = evaluate(
          ast,
          sheetResolver,
          expandRange,
          resolveSheetName,
          namedRangeResolverFor(sheetId),
          setHyperlinkMeta,
          {
            getSheetBounds: (sid) => getUsedBounds(sid ?? sheetId),
            currentCell: { col, row, sheetId },
            rangeCache: passCache?.rangeCache,
            callCache: passCache?.callCache,
            passStats: passCache?.passStats,
          },
        );

        if (isSpillResult(result)) {
          // Handle spill for array functions
          const spillRes = resolveSpill(result, ck, sheet.cells);
          if ('error' in spillRes) {
            if (cell.spillExtent) {
              const oldSpillKeys = clearSpillRange(ck, sheet.cells);
              for (const key of oldSpillKeys) {
                sheet.cells.delete(key);
                touched.push(globalKey(sheetId, key));
              }
            }
            cell.displayValue = '#SPILL!';
            cell.error = '#SPILL!';
            cell.computed = undefined;
            cell.spillExtent = undefined;
          } else {
            // Clear old spill range
            const oldSpillKeys = clearSpillRange(ck, sheet.cells);
            for (const key of oldSpillKeys) {
              sheet.cells.delete(key);
              touched.push(globalKey(sheetId, key));
            }
            // Write spill cells
            for (const [spillKey, spillCell] of spillRes.cells) {
              sheet.cells.set(spillKey, spillCell);
              touched.push(globalKey(sheetId, spillKey));
            }
            // Update origin cell
            const originVal = result.values[0]?.[0];
            const originIsError = originVal !== undefined && isFormulaError(originVal);
            cell.displayValue = originVal !== undefined ? formatResult(originVal) : '';
            cell.error = originIsError
              ? (originVal as import('../engine/types').FormulaError).code
              : undefined;
            cell.computed = originVal === undefined || originIsError ? undefined : originVal;
            cell.spillExtent = spillRes.spillExtent;
          }
        } else if (isFormulaError(result)) {
          // Clear any old spill range
          if (cell.spillExtent) {
            const oldSpillKeys = clearSpillRange(ck, sheet.cells);
            for (const key of oldSpillKeys) {
              sheet.cells.delete(key);
              touched.push(globalKey(sheetId, key));
            }
            cell.spillExtent = undefined;
          }
          cell.displayValue = result.code;
          cell.error = result.code;
          cell.computed = undefined;
        } else {
          // Clear any old spill range
          if (cell.spillExtent) {
            const oldSpillKeys = clearSpillRange(ck, sheet.cells);
            for (const key of oldSpillKeys) {
              sheet.cells.delete(key);
              touched.push(globalKey(sheetId, key));
            }
            cell.spillExtent = undefined;
          }
          cell.displayValue = formatResult(result);
          cell.error = undefined;
          cell.computed = result;
        }

        // Apply hyperlink metadata
        cell.hyperlink = hyperlinkMeta;
      } catch (e) {
        cell.displayValue = '#ERROR!';
        cell.error = '#ERROR!';
        cell.computed = undefined;
        cell.parseError = toParseErrorInfo(e);
      }

      return touched;
    },
    [
      resolveCell,
      parseGlobalKey,
      getSheetById,
      globalKey,
      resolveSheetName,
      namedRangeResolverFor,
      getUsedBounds,
    ],
  );

  /**
   * Recalculate all dependent cells when a cell changes. Volatile cells are always
   * included as extra triggers. Loops (bounded) to also propagate through any
   * additional spill writes/clears produced along the way.
   */
  const recalculateDependents = useCallback(
    (changedGlobalKeys: string[], alsoEvaluate: string[] = []): void => {
      let pending = changedGlobalKeys;
      let extra = [...alsoEvaluate, ...volatileKeysRef.current];
      const rec = recalcProfiler.begin('dependents');
      for (let iter = 0; iter < 10 && (pending.length > 0 || extra.length > 0); iter++) {
        const order = depGraphRef.current.getRecalculationOrder(pending, extra);
        extra = [];
        // One pass evaluates in topological order, so a range's contents are final before any formula
        // reads it: resolved ranges can be shared across the pass (fresh cache per pass: spills may change).
        const passCache: PassCache = {
          rangeCache: new Map(),
          callCache: new Map(),
          passStats: rec?.stats,
        };
        const touched: string[] = [];
        if (rec) {
          rec.iterations++;
          for (const g of order) {
            const t0 = performance.now();
            touched.push(...evaluateCell(g, passCache));
            recalcProfiler.cell(rec, g, performance.now() - t0);
          }
        } else {
          for (const g of order) touched.push(...evaluateCell(g, passCache));
        }
        pending = touched;
      }
      if (rec && rec.evaluations > 0) recalcProfiler.end(rec);
    },
    [evaluateCell],
  );

  /**
   * Recalculate all formula cells (used after restoring a snapshot).
   */
  const recalculateAll = useCallback((): void => {
    const formulaKeys: string[] = [];
    for (const sheet of sheetsRef.current) {
      for (const [key, cell] of sheet.cells) {
        if (cell.formula !== undefined) formulaKeys.push(globalKey(sheet.id, key));
      }
    }

    if (formulaKeys.length > 0) {
      // Every formula is seeded directly (no need to BFS from plain cells), then evaluated in
      // topological order with one shared range cache.
      const order = depGraphRef.current.getRecalculationOrder([], formulaKeys);
      const rec = recalcProfiler.begin('all');
      const passCache: PassCache = {
        rangeCache: new Map(),
        callCache: new Map(),
        passStats: rec?.stats,
      };
      if (rec) {
        rec.iterations = 1;
        for (const gKey of order) {
          const t0 = performance.now();
          evaluateCell(gKey, passCache);
          recalcProfiler.cell(rec, gKey, performance.now() - t0);
        }
        recalcProfiler.end(rec);
      } else {
        for (const gKey of order) {
          evaluateCell(gKey, passCache);
        }
      }
    }
  }, [evaluateCell, globalKey]);

  const getCellData = useCallback(
    (col: number, row: number): CellData | undefined => {
      return getActiveSheet().cells.get(cellKey(col, row));
    },
    [getActiveSheet],
  );

  /**
   * Internal: set a single cell value without undo snapshot.
   * Returns the global key of the changed cell.
   */
  const setCellValueInternal = useCallback(
    (
      col: number,
      row: number,
      value: string,
      targetSheet?: SheetData,
      deferEval?: string[],
    ): string => {
      const sheet = targetSheet ?? getActiveSheet();
      const key = cellKey(col, row);
      const gKey = globalKey(sheet.id, key);
      const graph = depGraphRef.current;
      const existingCell0 = sheet.cells.get(key);
      const existingStyle = existingCell0?.style;
      // Cell metadata that survives a value change (notes and validation rules are not part of the value)
      const keep: Pick<CellData, 'comment' | 'validation'> = {};
      if (existingCell0?.comment !== undefined) keep.comment = existingCell0.comment;
      if (existingCell0?.validation !== undefined) keep.validation = existingCell0.validation;
      const hasKeep = keep.comment !== undefined || keep.validation !== undefined;

      usedBoundsCacheRef.current.clear();

      if (value === '') {
        // Clear the cell value
        graph.removeDependencies(gKey);
        volatileKeysRef.current.delete(gKey);
        // Clear any spill range from this cell
        const existingCell = sheet.cells.get(key);
        if (existingCell?.spillExtent) {
          const spillKeys = clearSpillRange(key, sheet.cells);
          for (const sk of spillKeys) {
            sheet.cells.delete(sk);
            lastSpillTouchedRef.current.push(globalKey(sheet.id, sk));
          }
        }
        if (existingStyle || hasKeep) {
          // Preserve style / note / validation on an emptied cell
          sheet.cells.set(key, {
            rawValue: '',
            displayValue: '',
            style: existingStyle,
            ...keep,
          });
        } else {
          sheet.cells.delete(key);
        }
        return gKey;
      }

      // Check if this is a formula
      if (value.startsWith('=') && value.length > 1) {
        const formulaStr = value.slice(1); // Remove the '='

        try {
          const ast = parseCached(formulaStr);
          const resolveNR = namedRangeResolverFor(sheet.id);
          const refs = extractReferences(ast, resolveSheetName, resolveNR);

          // Convert local cell deps to global keys
          const globalDeps = refs.cells.map((dep) =>
            dep.includes(':') ? dep : globalKey(sheet.id, dep),
          );
          const rangeDeps: GlobalRangeDep[] = refs.ranges.map((r) => ({
            sheetId: r.sheetId ?? sheet.id,
            startCol: r.startCol,
            startRow: r.startRow,
            endCol: r.endCol,
            endRow: r.endRow,
          }));
          const depLabels = [
            ...globalDeps,
            ...rangeDeps.map((r) => `${r.sheetId}:${rangeLabel(r)}`),
          ];

          // Check for circular references
          const oldDeps = graph.getDependsOn(gKey);
          graph.removeDependencies(gKey);

          if (graph.wouldCreateCycle(gKey, globalDeps, rangeDeps)) {
            // Restore old deps if cycle detected
            if (oldDeps.size > 0) {
              graph.setDependencies(gKey, Array.from(oldDeps));
            }
            sheet.cells.set(key, {
              rawValue: value,
              displayValue: '#REF!',
              formula: formulaStr,
              dependencies: depLabels,
              error: '#REF!',
              style: existingStyle,
              ...keep,
            });
            return gKey;
          }

          // Register dependencies
          graph.setDependencies(gKey, globalDeps, rangeDeps);
          if (refs.volatile) {
            volatileKeysRef.current.add(gKey);
          } else {
            volatileKeysRef.current.delete(gKey);
          }

          // Clear any old spill range from this cell
          const oldCell = sheet.cells.get(key);
          if (oldCell?.spillExtent) {
            const spillKeys = clearSpillRange(key, sheet.cells);
            for (const sk of spillKeys) {
              sheet.cells.delete(sk);
              lastSpillTouchedRef.current.push(globalKey(sheet.id, sk));
            }
          }

          // Batch callers defer evaluation: store the formula now and evaluate all of them afterwards
          // in one topological pass (with a shared range cache) instead of once per written cell.
          if (deferEval) {
            sheet.cells.set(key, {
              rawValue: value,
              displayValue: '',
              formula: formulaStr,
              dependencies: depLabels,
              style: existingStyle,
              ...keep,
            });
            deferEval.push(gKey);
            return gKey;
          }

          // Evaluate the formula
          const sheetResolver = (k: string): FormulaResult => {
            if (k.includes(':')) return resolveCell(k);
            return resolveCell(globalKey(sheet.id, k));
          };

          // Hyperlink metadata callback
          let hyperlinkMeta: { url: string; label: string } | undefined;
          const setHyperlinkMeta = (url: string, label: string) => {
            hyperlinkMeta = { url, label };
          };

          const result = evaluate(
            ast,
            sheetResolver,
            expandRange,
            resolveSheetName,
            resolveNR,
            setHyperlinkMeta,
            {
              getSheetBounds: (sid) => getUsedBounds(sid ?? sheet.id),
              currentCell: { col, row, sheetId: sheet.id },
            },
          );

          if (isSpillResult(result)) {
            const spillRes = resolveSpill(result, key, sheet.cells);
            if ('error' in spillRes) {
              sheet.cells.set(key, {
                rawValue: value,
                displayValue: '#SPILL!',
                formula: formulaStr,
                dependencies: depLabels,
                error: '#SPILL!',
                style: existingStyle,
                ...keep,
              });
            } else {
              // Write spill target cells
              for (const [spillKey, spillCell] of spillRes.cells) {
                sheet.cells.set(spillKey, spillCell);
                lastSpillTouchedRef.current.push(globalKey(sheet.id, spillKey));
              }
              // Write origin cell
              const originVal = result.values[0]?.[0];
              const originIsError = originVal !== undefined && isFormulaError(originVal);
              sheet.cells.set(key, {
                rawValue: value,
                displayValue: originVal !== undefined ? formatResult(originVal) : '',
                formula: formulaStr,
                dependencies: depLabels,
                error: originIsError
                  ? (originVal as import('../engine/types').FormulaError).code
                  : undefined,
                computed: originVal === undefined || originIsError ? undefined : originVal,
                style: existingStyle,
                ...keep,
                spillExtent: spillRes.spillExtent,
                hyperlink: hyperlinkMeta,
              });
            }
          } else if (isFormulaError(result)) {
            sheet.cells.set(key, {
              rawValue: value,
              displayValue: result.code,
              formula: formulaStr,
              dependencies: depLabels,
              error: result.code,
              style: existingStyle,
              ...keep,
              hyperlink: hyperlinkMeta,
            });
          } else {
            sheet.cells.set(key, {
              rawValue: value,
              displayValue: formatResult(result),
              formula: formulaStr,
              dependencies: depLabels,
              computed: result,
              style: existingStyle,
              ...keep,
              hyperlink: hyperlinkMeta,
            });
          }
        } catch (e) {
          // Parse error
          graph.removeDependencies(gKey);
          volatileKeysRef.current.delete(gKey);
          sheet.cells.set(key, {
            rawValue: value,
            displayValue: '#ERROR!',
            formula: formulaStr,
            error: '#ERROR!',
            parseError: toParseErrorInfo(e),
            style: existingStyle,
            ...keep,
          });
        }
      } else {
        // Plain value
        graph.removeDependencies(gKey);
        volatileKeysRef.current.delete(gKey);
        const existingCell = sheet.cells.get(key);
        if (existingCell?.spillExtent) {
          const spillKeys = clearSpillRange(key, sheet.cells);
          for (const sk of spillKeys) {
            sheet.cells.delete(sk);
            lastSpillTouchedRef.current.push(globalKey(sheet.id, sk));
          }
        }

        // Cells formatted as plain text keep the input verbatim (no number/date detection)
        const parsed =
          existingStyle?.numberFormat === 'plainText' ? { value } : parseUserInput(value);
        // Auto-apply the detected format (e.g. "10%" → percent) only while the cell's format is automatic
        const hasExplicitFormat =
          existingStyle?.numberFormat !== undefined && existingStyle.numberFormat !== 'auto';
        const style =
          parsed.formatHint && !hasExplicitFormat
            ? {
                ...existingStyle,
                numberFormat: parsed.formatHint.numberFormat,
                numberFormatPattern: parsed.formatHint.pattern,
              }
            : existingStyle;

        sheet.cells.set(key, {
          rawValue: value,
          displayValue: plainDisplayValue(parsed.value),
          computed: parsed.value,
          style,
          ...keep,
        });
      }

      return gKey;
    },
    [
      resolveCell,
      getActiveSheet,
      globalKey,
      resolveSheetName,
      namedRangeResolverFor,
      getUsedBounds,
    ],
  );

  const setCellValue = useCallback(
    (col: number, row: number, value: string) => {
      // Push undo snapshot before mutation
      pushWorkbookSnapshot();

      lastSpillTouchedRef.current = [];
      const gKey = setCellValueInternal(col, row, value);
      const spillTouched = lastSpillTouchedRef.current;
      lastSpillTouchedRef.current = [];

      // Recalculate all cells that depend on this cell (plus any spill side effects)
      recalculateDependents([gKey, ...spillTouched]);

      bumpVersion();
    },
    [pushWorkbookSnapshot, setCellValueInternal, recalculateDependents, bumpVersion],
  );

  const deleteCells = useCallback(
    (positions: CellPosition[]) => {
      const sheet = getActiveSheet();
      // Only cells with content (spill targets are owned by their origin formula and are skipped)
      const targets: string[] = [];
      for (const pos of positions) {
        const key = cellKey(pos.col, pos.row);
        const cell = sheet.cells.get(key);
        if (cell && !cell.spillSource && cell.rawValue !== '') targets.push(key);
      }

      if (targets.length === 0) return;

      // Push undo snapshot before mutation
      pushWorkbookSnapshot();

      // Clearing to '' removes the value/formula (and any spill range) but keeps style, note and validation
      lastSpillTouchedRef.current = [];
      const changed = targets.map((key) => {
        const { col, row } = parseCellKey(key);
        return setCellValueInternal(col, row, '');
      });
      const spillTouched = lastSpillTouchedRef.current;
      lastSpillTouchedRef.current = [];

      recalculateDependents([...changed, ...spillTouched]);
      bumpVersion();
    },
    [
      getActiveSheet,
      pushWorkbookSnapshot,
      setCellValueInternal,
      recalculateDependents,
      bumpVersion,
    ],
  );

  const batchSetCellValues = useCallback(
    (entries: Array<{ col: number; row: number; value: string }>) => {
      // Push undo snapshot before mutation
      pushWorkbookSnapshot();

      lastSpillTouchedRef.current = [];
      const changedKeys: string[] = [];
      const deferredFormulas: string[] = [];
      for (const entry of entries) {
        const gKey = setCellValueInternal(
          entry.col,
          entry.row,
          entry.value,
          undefined,
          deferredFormulas,
        );
        changedKeys.push(gKey);
      }
      const spillTouched = lastSpillTouchedRef.current;
      lastSpillTouchedRef.current = [];

      recalculateDependents([...changedKeys, ...spillTouched], deferredFormulas);
      bumpVersion();
    },
    [pushWorkbookSnapshot, setCellValueInternal, recalculateDependents, bumpVersion],
  );

  const batchSetCellValuesOnSheet = useCallback(
    (sheetId: string, entries: Array<{ col: number; row: number; value: string }>) => {
      const targetSheet = getSheetById(sheetId);
      if (!targetSheet) return;

      pushWorkbookSnapshot();

      lastSpillTouchedRef.current = [];
      const changedKeys: string[] = [];
      for (const entry of entries) {
        const gKey = setCellValueInternal(entry.col, entry.row, entry.value, targetSheet);
        changedKeys.push(gKey);
      }
      const spillTouched = lastSpillTouchedRef.current;
      lastSpillTouchedRef.current = [];

      recalculateDependents([...changedKeys, ...spillTouched]);
      bumpVersion();
    },
    [getSheetById, pushWorkbookSnapshot, setCellValueInternal, recalculateDependents, bumpVersion],
  );

  const replaceAllData = useCallback(
    (newData: CellDataMap) => {
      // Push undo snapshot before mutation
      pushWorkbookSnapshot();

      const sheet = getActiveSheet();
      // Replace data in the active sheet
      sheet.cells = newData;
      hydratePlainCells([sheet]);

      // Rebuild dependency graph from all sheets
      rebuildGlobalDepGraph();

      // Recalculate all formula cells
      recalculateAll();

      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  const getDataMap = useCallback((): CellDataMap => {
    return getActiveSheet().cells;
  }, [getActiveSheet]);

  /**
   * Restore from a workbook snapshot (for undo/redo)
   */
  const restoreFromSnapshot = useCallback(
    (snapshot: WorkbookSnapshot) => {
      sheetsRef.current = snapshot.sheets;
      activeSheetIdRef.current = snapshot.activeSheetId;
      usedBoundsCacheRef.current.clear();
      rebuildGlobalDepGraph();
      if (namedRangesRef.current.length > 0) {
        // Named ranges are not part of the snapshot, so cached results may be stale: recompute everything
        recalculateAll();
      } else {
        // The snapshot's computed values were consistent when taken; only volatile formulas can differ
        recalculateDependents([]);
      }
      bumpVersion();
    },
    [rebuildGlobalDepGraph, recalculateAll, recalculateDependents, bumpVersion],
  );

  const undo = useCallback(() => {
    const snapshot = undoStack(createWorkbookSnapshot());
    if (!snapshot) return;

    // It's always a WorkbookSnapshot now
    if ('sheets' in snapshot) {
      restoreFromSnapshot(snapshot as WorkbookSnapshot);
    }
  }, [undoStack, createWorkbookSnapshot, restoreFromSnapshot]);

  const redo = useCallback(() => {
    const snapshot = redoStack(createWorkbookSnapshot());
    if (!snapshot) return;

    if ('sheets' in snapshot) {
      restoreFromSnapshot(snapshot as WorkbookSnapshot);
    }
  }, [redoStack, createWorkbookSnapshot, restoreFromSnapshot]);

  /** Developer tools: jump to any state of the undo timeline in one step. */
  const jumpToHistory = useCallback(
    (index: number) => {
      const snapshot = jumpHistoryTo(index, createWorkbookSnapshot());
      if (snapshot && 'sheets' in snapshot) restoreFromSnapshot(snapshot as WorkbookSnapshot);
    },
    [jumpHistoryTo, createWorkbookSnapshot, restoreFromSnapshot],
  );

  /** Developer tools: a timeline state's workbook (the live one for the current state). */
  const getHistorySnapshot = useCallback(
    (index: number): WorkbookSnapshot | undefined => {
      const snapshot = getTimelineSnapshot(index);
      if (snapshot && 'sheets' in snapshot) return snapshot as WorkbookSnapshot;
      return undefined;
    },
    [getTimelineSnapshot],
  );

  /** Developer tools: what a cell depends on and what depends on it (global keys `sheetId:A1`). */
  const getDependencyInfo = useCallback(
    (sheetId: string, key: string) => {
      const graph = depGraphRef.current;
      const gKey = globalKey(sheetId, key);
      return {
        precedents: Array.from(graph.getDependsOn(gKey)),
        rangePrecedents: graph.getRangeDependsOn(gKey),
        dependents: Array.from(graph.getDependents(gKey)),
      };
    },
    [globalKey],
  );

  const setCellStyle = useCallback(
    (positions: CellPosition[], style: Partial<CellStyle>) => {
      // Push undo snapshot before mutation
      pushWorkbookSnapshot();

      const sheet = getActiveSheet();
      for (const pos of positions) {
        const key = cellKey(pos.col, pos.row);
        const existing = sheet.cells.get(key);
        if (existing) {
          sheet.cells.set(key, { ...existing, style: { ...existing.style, ...style } });
        } else {
          // Create a cell entry for style-only cells
          sheet.cells.set(key, {
            rawValue: '',
            displayValue: '',
            style: { ...style },
          });
        }
      }

      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  /**
   * Shift cell data in the map for column insert/delete.
   */
  const shiftCellDataForColumn = useCallback(
    (index: number, operation: 'insert' | 'delete') => {
      const sheet = getActiveSheet();
      // Formulas on other sheets that point at this sheet (Sheet1!A1) follow the structural change too
      for (const other of sheetsRef.current) {
        if (other.id === sheet.id) continue;
        for (const [otherKey, otherCell] of other.cells) {
          if (!otherCell.formula) continue;
          const res = updateReferences(otherCell.formula, 'column', index, operation, {
            appliesToUnqualified: false,
            targetSheetName: sheet.name,
          });
          if (res.formula === otherCell.formula) continue;
          other.cells.set(otherKey, {
            ...otherCell,
            rawValue: '=' + res.formula,
            formula: res.formula,
            ...(res.hasRefError
              ? { displayValue: '#REF!', error: '#REF!', computed: undefined }
              : {}),
          });
        }
      }
      const oldMap = sheet.cells;
      const newMap: CellDataMap = new Map();

      for (const [key, cell] of oldMap) {
        const pos = parseCellKey(key);

        let newCol = pos.col;
        if (operation === 'insert') {
          if (pos.col >= index) newCol = pos.col + 1;
        } else {
          if (pos.col === index) continue; // deleted
          if (pos.col > index) newCol = pos.col - 1;
        }

        const newKey = cellKey(newCol, pos.row);

        // Update formula references
        if (cell.rawValue.startsWith('=') && cell.formula) {
          const { formula: updatedFormula, hasRefError } = updateReferences(
            cell.formula,
            'column',
            index,
            operation,
            { targetSheetName: sheet.name },
          );
          const newRawValue = '=' + updatedFormula;

          if (hasRefError) {
            newMap.set(newKey, {
              ...cell,
              rawValue: newRawValue,
              displayValue: '#REF!',
              formula: updatedFormula,
              computed: undefined,
              error: '#REF!',
              style: cell.style ? { ...cell.style } : undefined,
            });
          } else {
            newMap.set(newKey, {
              ...cell,
              rawValue: newRawValue,
              formula: updatedFormula,
              style: cell.style ? { ...cell.style } : undefined,
            });
          }
        } else {
          newMap.set(newKey, {
            ...cell,
            style: cell.style ? { ...cell.style } : undefined,
          });
        }
      }

      sheet.cells = newMap;
    },
    [getActiveSheet],
  );

  /**
   * Shift cell data in the map for row insert/delete.
   */
  const shiftCellDataForRow = useCallback(
    (index: number, operation: 'insert' | 'delete') => {
      const sheet = getActiveSheet();
      // Formulas on other sheets that point at this sheet (Sheet1!A1) follow the structural change too
      for (const other of sheetsRef.current) {
        if (other.id === sheet.id) continue;
        for (const [otherKey, otherCell] of other.cells) {
          if (!otherCell.formula) continue;
          const res = updateReferences(otherCell.formula, 'row', index, operation, {
            appliesToUnqualified: false,
            targetSheetName: sheet.name,
          });
          if (res.formula === otherCell.formula) continue;
          other.cells.set(otherKey, {
            ...otherCell,
            rawValue: '=' + res.formula,
            formula: res.formula,
            ...(res.hasRefError
              ? { displayValue: '#REF!', error: '#REF!', computed: undefined }
              : {}),
          });
        }
      }
      const oldMap = sheet.cells;
      const newMap: CellDataMap = new Map();

      for (const [key, cell] of oldMap) {
        const pos = parseCellKey(key);

        let newRow = pos.row;
        if (operation === 'insert') {
          if (pos.row >= index) newRow = pos.row + 1;
        } else {
          if (pos.row === index) continue; // deleted
          if (pos.row > index) newRow = pos.row - 1;
        }

        const newKey = cellKey(pos.col, newRow);

        // Update formula references
        if (cell.rawValue.startsWith('=') && cell.formula) {
          const { formula: updatedFormula, hasRefError } = updateReferences(
            cell.formula,
            'row',
            index,
            operation,
            { targetSheetName: sheet.name },
          );
          const newRawValue = '=' + updatedFormula;

          if (hasRefError) {
            newMap.set(newKey, {
              ...cell,
              rawValue: newRawValue,
              displayValue: '#REF!',
              formula: updatedFormula,
              computed: undefined,
              error: '#REF!',
              style: cell.style ? { ...cell.style } : undefined,
            });
          } else {
            newMap.set(newKey, {
              ...cell,
              rawValue: newRawValue,
              formula: updatedFormula,
              style: cell.style ? { ...cell.style } : undefined,
            });
          }
        } else {
          newMap.set(newKey, {
            ...cell,
            style: cell.style ? { ...cell.style } : undefined,
          });
        }
      }

      sheet.cells = newMap;
    },
    [getActiveSheet],
  );

  /**
   * Shift a sorted array of hidden row/col indices for an insert/delete at `index`.
   * insert: indices >= index move +1. delete: the index itself is removed, indices > index move -1.
   * Returns undefined (instead of an empty array) when nothing remains hidden, per SheetData's convention.
   */
  function shiftHiddenIndices(
    indices: number[] | undefined,
    index: number,
    op: 'insert' | 'delete',
  ): number[] | undefined {
    if (!indices || indices.length === 0) return indices;
    if (op === 'insert') {
      return indices.map((i) => (i >= index ? i + 1 : i));
    }
    const shifted = indices.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
    return shifted.length > 0 ? shifted : undefined;
  }

  const insertColumn = useCallback(
    (
      colIndex: number,
      position: 'before' | 'after',
      colCount: number,
      maxCols: number,
    ): boolean => {
      if (colCount >= maxCols) return false;

      const insertAt = position === 'before' ? colIndex : colIndex + 1;

      pushWorkbookSnapshot();
      shiftCellDataForColumn(insertAt, 'insert');

      // Shift column groups
      const sheet = getActiveSheet();
      sheet.colGroups = shiftGroupRanges(sheet.colGroups, insertAt, 'insert');
      sheet.hiddenCols = shiftHiddenIndices(sheet.hiddenCols, insertAt, 'insert');

      // Shift sparkline references for column insert
      if (sheet.sparklines.length > 0) {
        sheet.sparklines = shiftSparklineRefsForCol(sheet.sparklines, insertAt, 'insert');
      }

      // Rebuild dependency graph and recalculate
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      pushWorkbookSnapshot,
      shiftCellDataForColumn,
      getActiveSheet,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  const deleteColumn = useCallback(
    (colIndex: number): boolean => {
      pushWorkbookSnapshot();
      shiftCellDataForColumn(colIndex, 'delete');

      // Shift column groups
      const sheet = getActiveSheet();
      sheet.colGroups = shiftGroupRanges(sheet.colGroups, colIndex, 'delete');
      sheet.hiddenCols = shiftHiddenIndices(sheet.hiddenCols, colIndex, 'delete');

      // Shift sparkline references for column delete
      if (sheet.sparklines.length > 0) {
        sheet.sparklines = shiftSparklineRefsForCol(sheet.sparklines, colIndex, 'delete');
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      pushWorkbookSnapshot,
      shiftCellDataForColumn,
      getActiveSheet,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  const insertRow = useCallback(
    (
      rowIndex: number,
      position: 'before' | 'after',
      rowCount: number,
      maxRows: number,
    ): boolean => {
      if (rowCount >= maxRows) return false;

      const insertAt = position === 'before' ? rowIndex : rowIndex + 1;

      pushWorkbookSnapshot();
      shiftCellDataForRow(insertAt, 'insert');

      // Shift row groups
      const sheet = getActiveSheet();
      sheet.rowGroups = shiftGroupRanges(sheet.rowGroups, insertAt, 'insert');
      sheet.hiddenRows = shiftHiddenIndices(sheet.hiddenRows, insertAt, 'insert');

      // Shift sparkline references for row insert
      if (sheet.sparklines.length > 0) {
        sheet.sparklines = shiftSparklineRefsForRow(sheet.sparklines, insertAt, 'insert');
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      pushWorkbookSnapshot,
      shiftCellDataForRow,
      getActiveSheet,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  const deleteRow = useCallback(
    (rowIndex: number): boolean => {
      pushWorkbookSnapshot();
      shiftCellDataForRow(rowIndex, 'delete');

      // Shift row groups
      const sheet = getActiveSheet();
      sheet.rowGroups = shiftGroupRanges(sheet.rowGroups, rowIndex, 'delete');
      sheet.hiddenRows = shiftHiddenIndices(sheet.hiddenRows, rowIndex, 'delete');

      // Shift sparkline references for row delete
      if (sheet.sparklines.length > 0) {
        sheet.sparklines = shiftSparklineRefsForRow(sheet.sparklines, rowIndex, 'delete');
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      pushWorkbookSnapshot,
      shiftCellDataForRow,
      getActiveSheet,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  // ===== Multi-row/column insert/delete (single undo step) =====

  const insertColumns = useCallback(
    (index: number, count: number, colCount: number, maxCols: number): boolean => {
      if (count <= 0) return false;
      if (colCount + count > maxCols) return false;
      transact(() => {
        for (let i = 0; i < count; i++) {
          insertColumn(index, 'before', colCount + i, maxCols);
        }
      });
      return true;
    },
    [transact, insertColumn],
  );

  const deleteColumns = useCallback(
    (start: number, end: number): boolean => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const count = hi - lo + 1;
      transact(() => {
        for (let i = 0; i < count; i++) {
          deleteColumn(lo);
        }
      });
      return true;
    },
    [transact, deleteColumn],
  );

  const insertRows = useCallback(
    (index: number, count: number, rowCount: number, maxRows: number): boolean => {
      if (count <= 0) return false;
      if (rowCount + count > maxRows) return false;
      transact(() => {
        for (let i = 0; i < count; i++) {
          insertRow(index, 'before', rowCount + i, maxRows);
        }
      });
      return true;
    },
    [transact, insertRow],
  );

  const deleteRows = useCallback(
    (start: number, end: number): boolean => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const count = hi - lo + 1;
      transact(() => {
        for (let i = 0; i < count; i++) {
          deleteRow(lo);
        }
      });
      return true;
    },
    [transact, deleteRow],
  );

  // ===== Row/column hide/unhide (active sheet) =====

  const hideRows = useCallback(
    (start: number, end: number): void => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const set = new Set(sheet.hiddenRows ?? []);
      for (let r = lo; r <= hi; r++) set.add(r);
      sheet.hiddenRows = Array.from(set).sort((a, b) => a - b);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const unhideRows = useCallback(
    (start: number, end: number): void => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const filtered = (sheet.hiddenRows ?? []).filter((r) => r < lo || r > hi);
      sheet.hiddenRows = filtered.length > 0 ? filtered : undefined;
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const hideCols = useCallback(
    (start: number, end: number): void => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const set = new Set(sheet.hiddenCols ?? []);
      for (let c = lo; c <= hi; c++) set.add(c);
      sheet.hiddenCols = Array.from(set).sort((a, b) => a - b);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const unhideCols = useCallback(
    (start: number, end: number): void => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const filtered = (sheet.hiddenCols ?? []).filter((c) => c < lo || c > hi);
      sheet.hiddenCols = filtered.length > 0 ? filtered : undefined;
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  // ===== Multi-sheet operations =====

  const addSheet = useCallback(() => {
    pushWorkbookSnapshot();
    const existingNames = sheetsRef.current.map((s) => s.name);
    const newName = generateSheetName(existingNames);
    const newSheet = createEmptySheet(newName);
    sheetsRef.current = [...sheetsRef.current, newSheet];
    activeSheetIdRef.current = newSheet.id;
    bumpVersion();
  }, [pushWorkbookSnapshot, bumpVersion]);

  const deleteSheet = useCallback(
    (sheetId: string): boolean => {
      if (sheetsRef.current.length <= 1) return false;

      pushWorkbookSnapshot();

      const idx = sheetsRef.current.findIndex((s) => s.id === sheetId);
      if (idx === -1) return false;

      const deletedSheet = sheetsRef.current[idx];
      sheetsRef.current = sheetsRef.current.filter((s) => s.id !== sheetId);

      // If the deleted sheet was active, switch to an adjacent sheet
      if (activeSheetIdRef.current === sheetId) {
        const newIdx = Math.min(idx, sheetsRef.current.length - 1);
        activeSheetIdRef.current = sheetsRef.current[newIdx].id;
      }

      // If every remaining sheet is hidden, unhide the first one so at least one tab stays visible
      if (sheetsRef.current.length > 0 && sheetsRef.current.every((s) => s.hidden)) {
        sheetsRef.current[0].hidden = false;
      }

      // Update formulas in other sheets that reference the deleted sheet
      for (const sheet of sheetsRef.current) {
        for (const [key, cell] of sheet.cells) {
          if (cell.formula && cell.dependencies) {
            const hasDeletedRef = cell.dependencies.some((dep) =>
              dep.startsWith(deletedSheet.id + ':'),
            );
            if (hasDeletedRef) {
              sheet.cells.set(key, {
                ...cell,
                displayValue: '#REF!',
                error: '#REF!',
              });
            }
          }
        }
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  const renameSheet = useCallback(
    (sheetId: string, newName: string): boolean => {
      const trimmed = newName.trim();
      if (!trimmed) return false;

      // Check for duplicate names
      const duplicate = sheetsRef.current.some((s) => s.id !== sheetId && s.name === trimmed);
      if (duplicate) return false;

      const sheetIdx = sheetsRef.current.findIndex((s) => s.id === sheetId);
      if (sheetIdx === -1) return false;

      pushWorkbookSnapshot();

      const oldName = sheetsRef.current[sheetIdx].name;
      sheetsRef.current = sheetsRef.current.map((s, i) =>
        i === sheetIdx ? { ...s, name: trimmed } : s,
      );

      // Update formulas in other sheets that reference the renamed sheet by name
      // We need to update rawValue of cells that contain "=OldName!..." to "=NewName!..."
      for (const s of sheetsRef.current) {
        for (const [key, cell] of s.cells) {
          if (cell.rawValue.startsWith('=') && cell.formula) {
            // Replace occurrences of the old sheet name reference
            const updatedFormula = updateSheetNameInFormula(cell.formula, oldName, trimmed);
            if (updatedFormula !== cell.formula) {
              s.cells.set(key, {
                ...cell,
                formula: updatedFormula,
                rawValue: '=' + updatedFormula,
              });
            }
          }
        }
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  const setActiveSheet = useCallback(
    (sheetId: string) => {
      const sheet = sheetsRef.current.find((s) => s.id === sheetId);
      if (sheet) {
        activeSheetIdRef.current = sheetId;
        bumpVersion();
      }
    },
    [bumpVersion],
  );

  const duplicateSheet = useCallback(
    (sheetId: string): string | null => {
      const idx = sheetsRef.current.findIndex((s) => s.id === sheetId);
      if (idx === -1) return null;

      pushWorkbookSnapshot();

      const original = sheetsRef.current[idx];
      const cloned = deepCloneSheet(original);
      const newId = generateSheetId();
      const existingNames = sheetsRef.current.map((s) => s.name);
      const newName = generateCopyName(original.name, existingNames);

      // Give charts/sparklines/conditional format rules fresh ids (same generation scheme as their originals)
      // so they don't collide with the source sheet's entries.
      const newSheet: SheetData = {
        ...cloned,
        id: newId,
        name: newName,
        charts: cloned.charts.map((c) => ({
          ...c,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        })),
        sparklines: cloned.sparklines.map((s) => ({
          ...s,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        })),
        conditionalFormatRules: cloned.conditionalFormatRules.map((r) => ({
          ...r,
          id: `cfr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        })),
      };

      sheetsRef.current = [
        ...sheetsRef.current.slice(0, idx + 1),
        newSheet,
        ...sheetsRef.current.slice(idx + 1),
      ];
      activeSheetIdRef.current = newId;

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return newId;
    },
    [pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  const moveSheet = useCallback(
    (sheetId: string, toIndex: number): void => {
      const idx = sheetsRef.current.findIndex((s) => s.id === sheetId);
      if (idx === -1) return;

      pushWorkbookSnapshot();

      const sheets = [...sheetsRef.current];
      const [moved] = sheets.splice(idx, 1);
      const clampedIndex = Math.max(0, Math.min(toIndex, sheets.length));
      sheets.splice(clampedIndex, 0, moved);
      sheetsRef.current = sheets;

      bumpVersion();
    },
    [pushWorkbookSnapshot, bumpVersion],
  );

  const setSheetTabColor = useCallback(
    (sheetId: string, color: string | undefined): void => {
      const sheet = getSheetById(sheetId);
      if (!sheet) return;

      pushWorkbookSnapshot();
      sheet.tabColor = color;
      bumpVersion();
    },
    [getSheetById, pushWorkbookSnapshot, bumpVersion],
  );

  const setSheetHidden = useCallback(
    (sheetId: string, hidden: boolean): boolean => {
      const sheet = getSheetById(sheetId);
      if (!sheet) return false;

      if (hidden) {
        const visibleAfter = sheetsRef.current.filter((s) => s.id !== sheetId && !s.hidden).length;
        if (visibleAfter === 0) return false;
      }

      pushWorkbookSnapshot();
      sheet.hidden = hidden;

      // If we just hid the active sheet, switch to the next visible sheet (or the previous one)
      if (hidden && activeSheetIdRef.current === sheetId) {
        const idx = sheetsRef.current.findIndex((s) => s.id === sheetId);
        let next: SheetData | undefined;
        for (let i = idx + 1; i < sheetsRef.current.length; i++) {
          if (!sheetsRef.current[i].hidden) {
            next = sheetsRef.current[i];
            break;
          }
        }
        if (!next) {
          for (let i = idx - 1; i >= 0; i--) {
            if (!sheetsRef.current[i].hidden) {
              next = sheetsRef.current[i];
              break;
            }
          }
        }
        if (next) activeSheetIdRef.current = next.id;
      }

      bumpVersion();
      return true;
    },
    [getSheetById, pushWorkbookSnapshot, bumpVersion],
  );

  const getColCount = useCallback((): number => {
    return getActiveSheet().colCount;
  }, [getActiveSheet]);

  const getRowCount = useCallback((): number => {
    return getActiveSheet().rowCount;
  }, [getActiveSheet]);

  const setColCount = useCallback(
    (count: number) => {
      const sheet = getActiveSheet();
      sheet.colCount = count;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  const setRowCount = useCallback(
    (count: number) => {
      const sheet = getActiveSheet();
      sheet.rowCount = count;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  // Per-sheet frozen pane
  const getFrozenRows = useCallback((): number => {
    return getActiveSheet().frozenRows ?? 0;
  }, [getActiveSheet]);

  const getFrozenCols = useCallback((): number => {
    return getActiveSheet().frozenCols ?? 0;
  }, [getActiveSheet]);

  const setFrozenRows = useCallback(
    (count: number) => {
      getActiveSheet().frozenRows = count;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  const setFrozenCols = useCallback(
    (count: number) => {
      getActiveSheet().frozenCols = count;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  // Per-sheet filter state (value checkboxes)
  const getFilterState = useCallback((): Map<number, Set<string>> => {
    return getActiveSheet().filterState ?? EMPTY_FILTER_STATE;
  }, [getActiveSheet]);

  const setFilterState = useCallback(
    (state: Map<number, Set<string>>) => {
      getActiveSheet().filterState = state;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  // Per-sheet filter range + condition-based filters
  const getFilterRange = useCallback((): FilterRange | undefined => {
    return getActiveSheet().filterRange;
  }, [getActiveSheet]);

  const createFilter = useCallback(
    (range: FilterRange) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      sheet.filterRange = range;
      sheet.filterState = new Map();
      sheet.filterConditions = {};
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const removeFilter = useCallback(() => {
    pushWorkbookSnapshot();
    const sheet = getActiveSheet();
    sheet.filterRange = undefined;
    sheet.filterState = new Map();
    sheet.filterConditions = {};
    bumpVersion();
  }, [pushWorkbookSnapshot, getActiveSheet, bumpVersion]);

  const getFilterConditions = useCallback((): Record<number, FilterCondition> => {
    return getActiveSheet().filterConditions ?? EMPTY_FILTER_CONDITIONS;
  }, [getActiveSheet]);

  const setFilterCondition = useCallback(
    (col: number, condition: FilterCondition | undefined) => {
      const sheet = getActiveSheet();
      const next = { ...(sheet.filterConditions ?? {}) };
      if (condition) {
        next[col] = condition;
      } else {
        delete next[col];
      }
      sheet.filterConditions = next;
      bumpVersion();
    },
    [getActiveSheet, bumpVersion],
  );

  /**
   * Sort the rows of `range` in place by `keys` (Google Sheets-style range/sheet sort).
   * Only cells within [startCol, endCol] move; cell data (rawValue/style/comment/validation)
   * moves with its row, and formulas are shifted by shiftFormula(f, 0, newRow - oldRow) so
   * their relative references keep pointing at the same relative offset (like a cell move).
   * Returns false without changing anything if the range contains a merged cell.
   */
  const sortRange = useCallback(
    (
      range: { startCol: number; endCol: number; startRow: number; endRow: number },
      keys: SortKey[],
      /** Called with the applied order (order[i] = original row now at startRow + i), e.g. to animate the move. */
      onSorted?: (order: number[]) => void,
    ): boolean => {
      const sheet = getActiveSheet();

      if (sheet.merges) {
        for (const key of sheet.merges.keys()) {
          const { col, row } = parseCellKey(key);
          if (
            col >= range.startCol &&
            col <= range.endCol &&
            row >= range.startRow &&
            row <= range.endRow
          ) {
            return false;
          }
        }
      }

      const getValue = (col: number, row: number): FormulaResult => {
        const cell = sheet.cells.get(cellKey(col, row));
        if (!cell) return '';
        if (cell.error)
          return {
            type: 'error' as const,
            code: cell.error as import('../engine/types').ErrorCode,
          };
        if (cell.computed !== undefined) return cell.computed;
        return '';
      };

      const order = computeSortOrder(getValue, range.startRow, range.endRow, keys);
      if (order.length === 0) return true;

      // Snapshot the range's cells (per new-position index) before mutating anything.
      const snapshot: Array<Map<number, CellData>> = order.map((origRow) => {
        const rowMap = new Map<number, CellData>();
        for (let c = range.startCol; c <= range.endCol; c++) {
          const cell = sheet.cells.get(cellKey(c, origRow));
          if (cell) rowMap.set(c, cell);
        }
        return rowMap;
      });

      pushWorkbookSnapshot();

      for (let i = 0; i < order.length; i++) {
        const newRow = range.startRow + i;
        const oldRow = order[i];
        const rowMap = snapshot[i];
        for (let c = range.startCol; c <= range.endCol; c++) {
          const destKey = cellKey(c, newRow);
          const cell = rowMap.get(c);
          if (!cell) {
            sheet.cells.delete(destKey);
            continue;
          }
          let newCell: CellData = { ...cell };
          if (cell.formula !== undefined && newRow !== oldRow) {
            const shifted = shiftFormula(cell.formula, 0, newRow - oldRow);
            newCell = { ...newCell, formula: shifted, rawValue: '=' + shifted };
          }
          sheet.cells.set(destKey, newCell);
        }
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      onSorted?.(order);
      return true;
    },
    [getActiveSheet, pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  /**
   * "重複を削除": within `range`, delete rows whose `checkCols` display-string combination
   * (case-sensitive) already occurred in an earlier row, then compact the remaining rows
   * upward. Only cells within [startCol, endCol] move; nothing outside `range` is touched.
   */
  const removeDuplicateRows = useCallback(
    (
      range: { startCol: number; endCol: number; startRow: number; endRow: number },
      hasHeader: boolean,
      checkCols: number[],
    ): { duplicateCount: number; uniqueCount: number } => {
      const sheet = getActiveSheet();
      const dataStartRow = hasHeader ? range.startRow + 1 : range.startRow;
      const dataEndRow = range.endRow;
      if (dataStartRow > dataEndRow) return { duplicateCount: 0, uniqueCount: 0 };

      const rows: string[][] = [];
      for (let r = dataStartRow; r <= dataEndRow; r++) {
        const row: string[] = [];
        for (let c = range.startCol; c <= range.endCol; c++) {
          const cell = sheet.cells.get(cellKey(c, r));
          row[c - range.startCol] = getCellDisplay(cell, cell?.style).text;
        }
        rows.push(row);
      }
      const relativeCheckCols = checkCols.map((c) => c - range.startCol);
      const { keptRowIndices, duplicateCount } = findDuplicateRows(rows, relativeCheckCols);
      if (duplicateCount === 0) return { duplicateCount: 0, uniqueCount: rows.length };

      pushWorkbookSnapshot();

      const keptSnapshots: Array<Map<number, CellData>> = keptRowIndices.map((idx) => {
        const absRow = dataStartRow + idx;
        const rowMap = new Map<number, CellData>();
        for (let c = range.startCol; c <= range.endCol; c++) {
          const cell = sheet.cells.get(cellKey(c, absRow));
          if (cell) rowMap.set(c, cell);
        }
        return rowMap;
      });

      for (let i = 0; i < keptSnapshots.length; i++) {
        const newRow = dataStartRow + i;
        const oldRow = dataStartRow + keptRowIndices[i];
        const rowMap = keptSnapshots[i];
        for (let c = range.startCol; c <= range.endCol; c++) {
          const destKey = cellKey(c, newRow);
          const cell = rowMap.get(c);
          if (!cell) {
            sheet.cells.delete(destKey);
            continue;
          }
          let newCell: CellData = { ...cell };
          if (cell.formula !== undefined && newRow !== oldRow) {
            const shifted = shiftFormula(cell.formula, 0, newRow - oldRow);
            newCell = { ...newCell, formula: shifted, rawValue: '=' + shifted };
          }
          sheet.cells.set(destKey, newCell);
        }
      }
      // The tail (former duplicate rows, now beyond the compacted kept rows) is cleared.
      for (let r = dataStartRow + keptSnapshots.length; r <= dataEndRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          sheet.cells.delete(cellKey(c, r));
        }
      }

      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return { duplicateCount, uniqueCount: keptSnapshots.length };
    },
    [getActiveSheet, pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  /** "空白文字を削除": trims/collapses whitespace in string (non-formula) cells within `range`, as one undo step. */
  const trimWhitespaceInRange = useCallback(
    (range: { startCol: number; endCol: number; startRow: number; endRow: number }) => {
      const sheet = getActiveSheet();
      const entries: Array<{ col: number; row: number; value: string }> = [];
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          const cell = sheet.cells.get(cellKey(c, r));
          if (!cell || cell.formula !== undefined || typeof cell.computed !== 'string') continue;
          const normalized = normalizeWhitespace(cell.rawValue);
          if (normalized !== cell.rawValue) entries.push({ col: c, row: r, value: normalized });
        }
      }
      if (entries.length > 0) batchSetCellValues(entries);
    },
    [getActiveSheet, batchSetCellValues],
  );

  /**
   * "テキストを列に分割": split column `col`'s cells (rows startRow..endRow) on `delimiter`,
   * expanding each cell's parts into the columns to its right (overwriting existing values).
   */
  const splitTextToColumns = useCallback(
    (col: number, startRow: number, endRow: number, delimiter: string) => {
      const sheet = getActiveSheet();
      const entries: Array<{ col: number; row: number; value: string }> = [];
      for (let r = startRow; r <= endRow; r++) {
        const cell = sheet.cells.get(cellKey(col, r));
        if (!cell || cell.rawValue === '') continue;
        const parts = splitText(cell.displayValue, delimiter);
        for (let i = 0; i < parts.length; i++) {
          entries.push({ col: col + i, row: r, value: parts[i] });
        }
      }
      if (entries.length > 0) batchSetCellValues(entries);
    },
    [getActiveSheet, batchSetCellValues],
  );

  /**
   * Replace the active sheet's cell data directly (for sort) without re-parsing.
   * Pushes undo snapshot, replaces data, rebuilds dep graph, recalculates.
   */
  const replaceCellDataDirect = useCallback(
    (newData: CellDataMap) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      sheet.cells = newData;
      hydratePlainCells([sheet]);
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  /**
   * Clear cells on a specific sheet (for cross-sheet cut-paste).
   * Does NOT push its own undo snapshot -- caller should batch with paste.
   */
  const clearCellsOnSheet = useCallback(
    (sheetId: string, positions: Array<{ col: number; row: number }>) => {
      const sheet = getSheetById(sheetId);
      if (!sheet) return;
      const graph = depGraphRef.current;
      for (const pos of positions) {
        const key = cellKey(pos.col, pos.row);
        const gKey = globalKey(sheetId, key);
        graph.removeDependencies(gKey);
        sheet.cells.delete(key);
      }
    },
    [getSheetById, globalKey],
  );

  // --- Conditional format CRUD ---
  const addConditionalFormatRule = useCallback(
    (rule: Omit<ConditionalFormatRule, 'id'>) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const id = `cfr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newRule: ConditionalFormatRule = {
        ...rule,
        id,
        range: { ...rule.range },
        style: { ...rule.style },
      };
      sheet.conditionalFormatRules = [...(sheet.conditionalFormatRules ?? []), newRule];
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const updateConditionalFormatRule = useCallback(
    (ruleId: string, updates: Partial<ConditionalFormatRule>) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      sheet.conditionalFormatRules = (sheet.conditionalFormatRules ?? []).map((r) =>
        r.id === ruleId
          ? {
              ...r,
              ...updates,
              range: updates.range ? { ...updates.range } : { ...r.range },
              style: updates.style ? { ...updates.style } : { ...r.style },
            }
          : r,
      );
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const deleteConditionalFormatRule = useCallback(
    (ruleId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      sheet.conditionalFormatRules = (sheet.conditionalFormatRules ?? []).filter(
        (r) => r.id !== ruleId,
      );
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const getConditionalFormatRules = useCallback((): ConditionalFormatRule[] => {
    return getActiveSheet().conditionalFormatRules ?? [];
  }, [getActiveSheet]);

  // --- Replace entire workbook (for native file import) ---
  const replaceWorkbook = useCallback(
    (workbook: WorkbookData, options?: { resetHistory?: boolean }) => {
      if (options?.resetHistory) {
        clearHistory();
      } else {
        pushWorkbookSnapshot();
      }
      hydratePlainCells(workbook.sheets);
      sheetsRef.current = workbook.sheets;
      activeSheetIdRef.current = workbook.activeSheetId;
      if (workbook.namedRanges) {
        namedRangesRef.current = workbook.namedRanges;
      }
      if (workbook.pivotTables) {
        pivotTablesRef.current = workbook.pivotTables;
      }
      titleRef.current = workbook.title;
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
    },
    [pushWorkbookSnapshot, clearHistory, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  // --- Document title (not part of undo/redo; bumpVersion() alone triggers autosave) ---
  const setTitle = useCallback(
    (title: string) => {
      titleRef.current = title || undefined;
      bumpVersion();
    },
    [bumpVersion],
  );

  // --- New workbook ("ファイル > 新規作成"): reset everything, bypassing undo history ---
  const newWorkbook = useCallback(() => {
    clearHistory();
    const sheet = createEmptySheet('Sheet1');
    sheetsRef.current = [sheet];
    activeSheetIdRef.current = sheet.id;
    namedRangesRef.current = [];
    pivotTablesRef.current = [];
    titleRef.current = undefined;
    rebuildGlobalDepGraph();
    recalculateAll();
    bumpVersion();
  }, [clearHistory, rebuildGlobalDepGraph, recalculateAll, bumpVersion]);

  // --- Cell merge operations ---
  const mergeCells = useCallback(
    (range: SelectionRange) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const startCol = Math.min(range.start.col, range.end.col);
      const endCol = Math.max(range.start.col, range.end.col);
      const startRow = Math.min(range.start.row, range.end.row);
      const endRow = Math.max(range.start.row, range.end.row);
      const colSpan = endCol - startCol + 1;
      const rowSpan = endRow - startRow + 1;
      if (colSpan <= 1 && rowSpan <= 1) return;

      const anchorKey = cellKey(startCol, startRow);
      if (!sheet.merges) sheet.merges = new Map();

      // Set anchor
      sheet.merges.set(anchorKey, { anchorKey, colSpan, rowSpan });
      // Set non-anchor cells
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = cellKey(c, r);
          if (key !== anchorKey) {
            sheet.merges.set(key, { anchorKey, colSpan: 0, rowSpan: 0 });
          }
        }
      }
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const unmergeCells = useCallback(
    (anchorKey: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.merges) return;
      const info = sheet.merges.get(anchorKey);
      if (!info || info.colSpan === 0) return; // not an anchor

      const anchorPos = parseCellKey(anchorKey);
      for (let r = anchorPos.row; r < anchorPos.row + info.rowSpan; r++) {
        for (let c = anchorPos.col; c < anchorPos.col + info.colSpan; c++) {
          sheet.merges.delete(cellKey(c, r));
        }
      }
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const getMergeInfo = useCallback(
    (col: number, row: number): MergeInfo | undefined => {
      const sheet = getActiveSheet();
      return sheet.merges?.get(cellKey(col, row));
    },
    [getActiveSheet],
  );

  // --- Cell comment operations ---
  const setCellComment = useCallback(
    (col: number, row: number, comment: string | undefined) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      const key = cellKey(col, row);
      const existing = sheet.cells.get(key);
      if (existing) {
        if (comment) {
          existing.comment = comment;
        } else {
          delete existing.comment;
        }
      } else if (comment) {
        sheet.cells.set(key, { rawValue: '', displayValue: '', comment });
      }
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  // --- Data validation operations ---
  const setValidationRule = useCallback(
    (positions: CellPosition[], rule: ValidationRule | undefined) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      for (const pos of positions) {
        const key = cellKey(pos.col, pos.row);
        const existing = sheet.cells.get(key);
        if (existing) {
          if (rule) {
            existing.validation = { ...rule };
          } else {
            delete existing.validation;
          }
        } else if (rule) {
          sheet.cells.set(key, { rawValue: '', displayValue: '', validation: { ...rule } });
        }
      }
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  // --- Chart operations ---
  const addChart = useCallback(
    (chart: ChartData) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.charts) sheet.charts = [];
      sheet.charts = [...sheet.charts, chart];
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const updateChart = useCallback(
    (chartId: string, updates: Partial<ChartData>) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.charts) return;
      sheet.charts = sheet.charts.map((c) => (c.id === chartId ? { ...c, ...updates } : c));
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const deleteChart = useCallback(
    (chartId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.charts) return;
      sheet.charts = sheet.charts.filter((c) => c.id !== chartId);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const getCharts = useCallback((): ChartData[] => {
    return getActiveSheet().charts ?? [];
  }, [getActiveSheet]);

  // --- Sparkline operations ---
  const addSparkline = useCallback(
    (config: import('../types/sparkline').SparklineConfig) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.sparklines) sheet.sparklines = [];
      sheet.sparklines = [...sheet.sparklines, config];
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const updateSparkline = useCallback(
    (id: string, updates: Partial<import('../types/sparkline').SparklineConfig>) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.sparklines) return;
      sheet.sparklines = sheet.sparklines.map((s) => (s.id === id ? { ...s, ...updates } : s));
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const deleteSparkline = useCallback(
    (id: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.sparklines) return;
      sheet.sparklines = sheet.sparklines.filter((s) => s.id !== id);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const getSparklines = useCallback((): import('../types/sparkline').SparklineConfig[] => {
    return getActiveSheet().sparklines ?? [];
  }, [getActiveSheet]);

  // --- Grouping operations ---
  const addRowGroup = useCallback(
    (start: number, end: number): boolean => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.rowGroups) sheet.rowGroups = [];
      const result = addGroupFn(sheet.rowGroups, start, end);
      if ('error' in result) return false;
      sheet.rowGroups = result.groups;
      bumpVersion();
      return true;
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const addColGroup = useCallback(
    (start: number, end: number): boolean => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.colGroups) sheet.colGroups = [];
      const result = addGroupFn(sheet.colGroups, start, end);
      if ('error' in result) return false;
      sheet.colGroups = result.groups;
      bumpVersion();
      return true;
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const removeRowGroup = useCallback(
    (groupId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.rowGroups) return;
      sheet.rowGroups = removeGroupFn(sheet.rowGroups, groupId);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const removeColGroup = useCallback(
    (groupId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.colGroups) return;
      sheet.colGroups = removeGroupFn(sheet.colGroups, groupId);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const toggleRowGroupCollapse = useCallback(
    (groupId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.rowGroups) return;
      sheet.rowGroups = toggleGroupCollapseFn(sheet.rowGroups, groupId);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const toggleColGroupCollapse = useCallback(
    (groupId: string) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.colGroups) return;
      sheet.colGroups = toggleGroupCollapseFn(sheet.colGroups, groupId);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const setRowExpandLevel = useCallback(
    (level: number) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.rowGroups) return;
      sheet.rowGroups = setExpandLevelFn(sheet.rowGroups, level);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  const setColExpandLevel = useCallback(
    (level: number) => {
      pushWorkbookSnapshot();
      const sheet = getActiveSheet();
      if (!sheet.colGroups) return;
      sheet.colGroups = setExpandLevelFn(sheet.colGroups, level);
      bumpVersion();
    },
    [pushWorkbookSnapshot, getActiveSheet, bumpVersion],
  );

  // --- Named range operations ---

  /** Validate a named range name */
  const isValidNamedRangeName = useCallback((name: string): boolean => {
    if (!name || name.trim() === '') return false;
    // Must not start with a digit
    if (/^\d/.test(name)) return false;
    // Must not be a valid cell reference
    if (/^[A-Za-z]+\d+$/.test(name) && parseInt(name.replace(/^[A-Za-z]+/, ''), 10) >= 1)
      return false;
    // Must not collide with boolean literals
    if (name.toUpperCase() === 'TRUE' || name.toUpperCase() === 'FALSE') return false;
    return true;
  }, []);

  const addNamedRange = useCallback(
    (name: string, range: string, refSheetId?: string): boolean => {
      if (!isValidNamedRangeName(name)) return false;
      // Check for duplicate names
      if (namedRangesRef.current.some((r) => r.name === name)) return false;
      pushWorkbookSnapshot();
      namedRangesRef.current = [
        ...namedRangesRef.current,
        {
          name,
          range,
          refSheetId: refSheetId ?? activeSheetIdRef.current,
        },
      ];
      // Recalculate all (formulas may now reference the new name)
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      isValidNamedRangeName,
      pushWorkbookSnapshot,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  const updateNamedRange = useCallback(
    (oldName: string, newName: string, range: string, refSheetId?: string): boolean => {
      const idx = namedRangesRef.current.findIndex((r) => r.name === oldName);
      if (idx === -1) return false;
      if (oldName !== newName) {
        if (!isValidNamedRangeName(newName)) return false;
        if (namedRangesRef.current.some((r) => r.name === newName)) return false;
      }
      pushWorkbookSnapshot();

      // Update formulas that reference the old name
      if (oldName !== newName) {
        for (const sheet of sheetsRef.current) {
          for (const [key, cell] of sheet.cells) {
            if (cell.formula && cell.rawValue.startsWith('=')) {
              // Simple text replacement of the name in formulas
              const regex = new RegExp(
                `(?<![\\p{L}\\p{N}_])${escapeRegExp(oldName)}(?![\\p{L}\\p{N}_])`,
                'gu',
              );
              const updatedFormula = cell.formula.replace(regex, newName);
              if (updatedFormula !== cell.formula) {
                sheet.cells.set(key, {
                  ...cell,
                  formula: updatedFormula,
                  rawValue: '=' + updatedFormula,
                });
              }
            }
          }
        }
      }

      namedRangesRef.current = namedRangesRef.current.map((r, i) =>
        i === idx ? { name: newName, range, refSheetId: refSheetId ?? r.refSheetId } : r,
      );
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [
      isValidNamedRangeName,
      pushWorkbookSnapshot,
      rebuildGlobalDepGraph,
      recalculateAll,
      bumpVersion,
    ],
  );

  const deleteNamedRange = useCallback(
    (name: string): boolean => {
      const idx = namedRangesRef.current.findIndex((r) => r.name === name);
      if (idx === -1) return false;
      pushWorkbookSnapshot();
      namedRangesRef.current = namedRangesRef.current.filter((r) => r.name !== name);
      rebuildGlobalDepGraph();
      recalculateAll();
      bumpVersion();
      return true;
    },
    [pushWorkbookSnapshot, rebuildGlobalDepGraph, recalculateAll, bumpVersion],
  );

  // --- Pivot table operations ---
  const addPivotTable = useCallback(
    (config: PivotTableConfig) => {
      pushWorkbookSnapshot();
      pivotTablesRef.current = [...pivotTablesRef.current, { ...config }];
      bumpVersion();
    },
    [pushWorkbookSnapshot, bumpVersion],
  );

  const updatePivotTable = useCallback(
    (id: string, updates: Partial<PivotTableConfig>) => {
      pushWorkbookSnapshot();
      pivotTablesRef.current = pivotTablesRef.current.map((pt) =>
        pt.id === id ? { ...pt, ...updates } : pt,
      );
      bumpVersion();
    },
    [pushWorkbookSnapshot, bumpVersion],
  );

  const deletePivotTable = useCallback(
    (id: string) => {
      pushWorkbookSnapshot();
      pivotTablesRef.current = pivotTablesRef.current.filter((pt) => pt.id !== id);
      bumpVersion();
    },
    [pushWorkbookSnapshot, bumpVersion],
  );

  // --- Formula evaluation helper (for function wizard) ---
  const evaluateFormulaHelper = useCallback(
    (formula: string): string => {
      try {
        const formulaStr = formula.startsWith('=') ? formula.slice(1) : formula;
        if (!formulaStr.trim()) return '';
        const ast = parseCached(formulaStr);
        const sheetId = activeSheetIdRef.current;
        const sheetResolver = (key: string): FormulaResult => {
          if (key.includes(':')) return resolveCell(key);
          return resolveCell(globalKey(sheetId, key));
        };
        const result = evaluate(
          ast,
          sheetResolver,
          expandRange,
          resolveSheetName,
          namedRangeResolverFor(sheetId),
          undefined,
          {
            getSheetBounds: (sid) => getUsedBounds(sid ?? sheetId),
          },
        );
        if (isSpillResult(result)) {
          const firstRow = result.values[0];
          if (firstRow && firstRow.length > 0) {
            const first = firstRow[0];
            if (isFormulaError(first)) return first.code;
            return String(first);
          }
          return '';
        }
        if (isFormulaError(result)) return result.code;
        return String(result);
      } catch {
        return '#ERROR!';
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [resolveSheetName, namedRangeResolverFor, getUsedBounds],
  );

  // --- Formula evaluation at an arbitrary cell position (conditional format / data validation) ---
  const evaluateFormulaAt = useCallback(
    (formula: string, col: number, row: number, sheetId?: string): FormulaResult => {
      const targetSheetId = sheetId ?? activeSheetIdRef.current;
      try {
        const formulaStr = formula.startsWith('=') ? formula.slice(1) : formula;
        const ast = parseCached(formulaStr);
        const sheetResolver = (key: string): FormulaResult => {
          if (key.includes(':')) return resolveCell(key);
          return resolveCell(globalKey(targetSheetId, key));
        };
        const result = evaluate(
          ast,
          sheetResolver,
          expandRange,
          resolveSheetName,
          namedRangeResolverFor(targetSheetId),
          undefined,
          {
            getSheetBounds: (sid) => getUsedBounds(sid ?? targetSheetId),
            currentCell: { col, row, sheetId: targetSheetId },
          },
        );
        if (isSpillResult(result)) {
          return result.values[0]?.[0] ?? '';
        }
        return result;
      } catch {
        return { type: 'error' as const, code: '#ERROR!' as import('../engine/types').ErrorCode };
      }
    },
    [resolveCell, globalKey, resolveSheetName, namedRangeResolverFor, getUsedBounds],
  );

  // --- Row-major range value resolution (data validation list source / conditional format helpers) ---
  const resolveRangeValues = useCallback(
    (range: string, sheetId?: string): FormulaResult[] | null => {
      const trimmed = range.trim();
      let sheetName: string | undefined;
      let rangePart = trimmed;

      const quotedMatch = /^'((?:[^']|'')*)'!(.+)$/.exec(trimmed);
      if (quotedMatch) {
        sheetName = quotedMatch[1].replace(/''/g, "'");
        rangePart = quotedMatch[2];
      } else {
        const unquotedMatch = /^([A-Za-z_][\w.]*)!(.+)$/.exec(trimmed);
        if (unquotedMatch) {
          sheetName = unquotedMatch[1];
          rangePart = unquotedMatch[2];
        }
      }

      let targetSheetId = sheetId ?? activeSheetIdRef.current;
      if (sheetName !== undefined) {
        const resolved = resolveSheetName(sheetName);
        if (!resolved) return null;
        targetSheetId = resolved;
      }
      if (!getSheetById(targetSheetId)) return null;

      const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;
      const parts = rangePart.split(':');
      if (parts.length === 1) {
        if (!CELL_RE.test(parts[0])) return null;
        const pos = parseCellKey(parts[0].replace(/\$/g, '').toUpperCase());
        return [resolveCell(globalKey(targetSheetId, cellKey(pos.col, pos.row)))];
      }
      if (parts.length !== 2 || !CELL_RE.test(parts[0]) || !CELL_RE.test(parts[1])) return null;

      const start = parseCellKey(parts[0].replace(/\$/g, '').toUpperCase());
      const end = parseCellKey(parts[1].replace(/\$/g, '').toUpperCase());
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);

      const values: FormulaResult[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          values.push(resolveCell(globalKey(targetSheetId, cellKey(c, r))));
        }
      }
      return values;
    },
    [resolveSheetName, getSheetById, resolveCell, globalKey],
  );

  return {
    getCellData,
    setCellValue,
    deleteCells,
    batchSetCellValues,
    batchSetCellValuesOnSheet,
    replaceAllData,
    getDataMap,
    setCellStyle,
    insertColumn,
    deleteColumn,
    insertRow,
    deleteRow,
    insertColumns,
    deleteColumns,
    insertRows,
    deleteRows,
    hideRows,
    unhideRows,
    hideCols,
    unhideCols,
    undo,
    redo,
    canUndo,
    canRedo,
    historyTimeline,
    jumpToHistory,
    getHistorySnapshot,
    getDependencyInfo,
    version,
    // Multi-sheet (state mirrors updated alongside version)
    sheets: sheetsState,
    activeSheetId: activeSheetIdState,
    addSheet,
    deleteSheet,
    renameSheet,
    setActiveSheet,
    getActiveSheet,
    duplicateSheet,
    moveSheet,
    setSheetTabColor,
    setSheetHidden,
    getColCount,
    getRowCount,
    setColCount,
    setRowCount,
    getFrozenRows,
    getFrozenCols,
    setFrozenRows,
    setFrozenCols,
    getFilterState,
    setFilterState,
    getFilterRange,
    createFilter,
    removeFilter,
    getFilterConditions,
    setFilterCondition,
    sortRange,
    replaceCellDataDirect,
    clearCellsOnSheet,
    removeDuplicateRows,
    trimWhitespaceInRange,
    splitTextToColumns,
    addConditionalFormatRule,
    updateConditionalFormatRule,
    deleteConditionalFormatRule,
    getConditionalFormatRules,
    replaceWorkbook,
    // Document title
    title: titleState,
    setTitle,
    newWorkbook,
    // Cell merge
    mergeCells,
    unmergeCells,
    getMergeInfo,
    // Cell comments
    setCellComment,
    // Data validation
    setValidationRule,
    // Charts
    addChart,
    updateChart,
    deleteChart,
    getCharts,
    // Named ranges
    namedRanges: namedRangesState,
    addNamedRange,
    updateNamedRange,
    deleteNamedRange,
    // Sparklines
    addSparkline,
    updateSparkline,
    deleteSparkline,
    getSparklines,
    // Grouping
    addRowGroup,
    addColGroup,
    removeRowGroup,
    removeColGroup,
    toggleRowGroupCollapse,
    toggleColGroupCollapse,
    setRowExpandLevel,
    setColExpandLevel,
    // Pivot tables
    pivotTables: pivotTablesState,
    addPivotTable,
    updatePivotTable,
    deletePivotTable,
    // Formula evaluation helper
    evaluateFormula: evaluateFormulaHelper,
    evaluateFormulaAt,
    resolveRangeValues,
    transact,
  };
}

/**
 * Update sheet name references in a formula string.
 * Handles both bare names (Sheet1!A1) and quoted names ('My Sheet'!A1).
 */
function updateSheetNameInFormula(formula: string, oldName: string, newName: string): string {
  // Handle quoted sheet names: 'OldName'!
  const quotedPattern = new RegExp(`'${escapeRegExp(oldName)}'!`, 'g');
  let updated = formula.replace(
    quotedPattern,
    needsQuoting(newName) ? `'${newName}'!` : `${newName}!`,
  );

  // Handle unquoted sheet names: OldName!
  // Only match if not preceded by a quote
  const unquotedPattern = new RegExp(`(?<!')${escapeRegExp(oldName)}!`, 'g');
  updated = updated.replace(
    unquotedPattern,
    needsQuoting(newName) ? `'${newName}'!` : `${newName}!`,
  );

  return updated;
}

function needsQuoting(name: string): boolean {
  return /[^A-Za-z0-9_]/.test(name);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
