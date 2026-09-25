import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GRID_CONSTANTS } from '../../types/grid';
import type {
  CellStyle,
  CellPosition,
  FilterCondition,
  MergeInfo,
  NumberFormat,
  SortKey,
} from '../../types/grid';
import type { ChartData } from '../../types/chart';
import { Cell } from '../Cell';
import type { CellValidationUi } from '../Cell';
import { ColumnHeader } from '../Header/ColumnHeader';
import { RowHeader } from '../Header/RowHeader';
import { FormulaBar } from '../FormulaBar';
import { StatusBar } from '../StatusBar';
import { DropOverlay } from './DropOverlay';
import { MenuBar } from '../MenuBar';
import { Toolbar } from '../Toolbar';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import { SheetTabs } from '../SheetTabs';
import { SearchPanel } from '../SearchPanel';
import { useGridData } from '../../hooks/useGridData';
import { useSelection } from '../../hooks/useSelection';
import { useKeyboard } from '../../hooks/useKeyboard';
import type { ConfirmDirection } from '../../hooks/useKeyboard';
import { useClipboard } from '../../hooks/useClipboard';
import type { PasteMode, PastePlan } from '../../hooks/useClipboard';
import { useDragAutoScroll } from '../../hooks/useDragAutoScroll';
import { clampDragPoint } from '../../utils/dragAutoScroll';
import { useDragDrop } from '../../hooks/useDragDrop';
import { useFileIO } from '../../hooks/useFileIO';
import { useColumnRowSizes } from '../../hooks/useColumnRowSizes';
import { useTheme } from '../../hooks/useTheme';
import { SpreadsheetContext } from '../../context/SpreadsheetContext';
import type { SpreadsheetActions } from '../../context/SpreadsheetContext';
import { ThemeToggle } from '../Toolbar/ThemeToggle';
import { cellKey, parseCellKey, clamp } from '../../utils/coordinates';
import { detectFillPattern, generateFillValues } from '../../utils/fillAuto';
import { toggleAbsoluteRef } from '../../utils/referenceUpdater';
import { shiftFormula } from '../../utils/formulaShift';
import { findDataEdge } from '../../utils/navigation';
import { formatDisplayValue, patternForStyle, adjustDecimals } from '../../utils/numberFormat';
import { getCellDisplay } from '../../utils/cellDisplay';
import { evaluateCondition, createConditionalFormatter } from '../../utils/conditionalFormat';
import { detectDelimiter } from '../../utils/dataCleanup';
import { UNTITLED_SPREADSHEET_NAME } from '../../utils/filename';
import { SidePanel } from '../SidePanel';
const ConditionalFormatPanel = lazy(() =>
  import('../ConditionalFormatPanel').then((m) => ({ default: m.ConditionalFormatPanel })),
);
const DataValidationPanel = lazy(() =>
  import('../DataValidationPanel').then((m) => ({ default: m.DataValidationPanel })),
);
import { ValidationDropdown } from '../ValidationDropdown';
import {
  validateInput,
  toggleCheckboxValue,
  isCheckboxChecked,
  getListOptions,
} from '../../utils/validation';
import type { ValidationContext } from '../../utils/validation';
const NamedRangeDialog = lazy(() =>
  import('../NamedRangeDialog').then((m) => ({ default: m.NamedRangeDialog })),
);
const ShortcutsDialog = lazy(() =>
  import('../ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })),
);
const DevTools = lazy(() => import('../DevTools/DevTools').then((m) => ({ default: m.DevTools })));
const SortRangeDialog = lazy(() =>
  import('../SortRangeDialog').then((m) => ({ default: m.SortRangeDialog })),
);
const RemoveDuplicatesDialog = lazy(() =>
  import('../RemoveDuplicatesDialog').then((m) => ({ default: m.RemoveDuplicatesDialog })),
);
import { FilterMenu } from '../FilterMenu';
import { useToast, ToastContainer } from '../Toast';
import { CellContextMenu } from './CellContextMenu';
import { CommentTooltip } from '../CommentTooltip';
const ChartEditorPanel = lazy(() =>
  import('../ChartEditorPanel').then((m) => ({ default: m.ChartEditorPanel })),
);
const ChartOverlay = lazy(() =>
  import('../ChartOverlay').then((m) => ({ default: m.ChartOverlay })),
);
import { DocumentTitle } from '../DocumentTitle';
const SparklineDialog = lazy(() =>
  import('../SparklineDialog').then((m) => ({ default: m.SparklineDialog })),
);
const PrintPreviewDialog = lazy(() =>
  import('../PrintPreviewDialog').then((m) => ({ default: m.PrintPreviewDialog })),
);
const PivotTableDialog = lazy(() =>
  import('../PivotTableDialog').then((m) => ({ default: m.PivotTableDialog })),
);
const FunctionWizardDialog = lazy(() =>
  import('../FunctionWizardDialog').then((m) => ({ default: m.FunctionWizardDialog })),
);
import { buildPivotTable as buildPivotTableFn } from '../../pivot/pivotEngine';
import { RowGroupBar } from '../Header/RowGroupBar';
import { ColGroupBar } from '../Header/ColGroupBar';
import { computeCollapsedIndices, getMaxGroupLevel } from '../../grouping/groupManager';
import { extractFormulaRefs } from '../../utils/formulaRefExtractor';
import { useAutosave } from '../../hooks/useAutosave';
import { SaveStatus } from '../SaveStatus';
import { serialize, deserialize } from '../../io/tabulaSerializer';
import { CellEditor } from '../CellEditor';
import { SelectionCursor } from './SelectionCursor';
import { PrecedentArrows } from './PrecedentArrows';
import { RecalcHeatmap } from '../DevTools/RecalcHeatmap';
import type { DevToolsHost } from '../DevTools/types';
import { recalcProfiler } from '../../engine/recalcProfiler';
import { hideSplash } from '../../splash';
import { FunctionHint } from '../FormulaBar/FunctionHint';
import { useCaretPosition } from '../../hooks/useCaretPosition';
import { AppIcon } from '../AppIcon';
import { useFormulaBar } from '../../hooks/useFormulaBar';
import { Autocomplete } from '../FormulaBar/Autocomplete';
import type { ErrorCode, FunctionMeta } from '../../engine/types';
import { makeError } from '../../engine/types';
import { STORAGE_KEYS } from '../../utils/storageKeys';

const REF_COLORS = [
  '#2563EB', // blue
  '#DC2626', // red
  '#9333EA', // purple
  '#059669', // green
  '#D97706', // amber
  '#0891B2', // cyan
  '#E11D48', // rose
  '#7C3AED', // violet
];

// Same default font stack as the body / Cell text rendering (src/index.css)
const DEFAULT_CELL_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Every CellStyle key, defaulted to undefined — used as a base so applying a copied/painted style
// fully replaces the target's existing style instead of shallow-merging with its leftover properties.
const EMPTY_CELL_STYLE: CellStyle = {
  bold: undefined,
  italic: undefined,
  underline: undefined,
  strikethrough: undefined,
  textAlign: undefined,
  verticalAlign: undefined,
  backgroundColor: undefined,
  textColor: undefined,
  numberFormat: undefined,
  numberFormatPattern: undefined,
  fontSize: undefined,
  fontFamily: undefined,
  wrapText: undefined,
  borders: undefined,
};

/** Format painter (paint format): build a full replacement style from a copied (partial) style. */
function fullCellStyle(style: CellStyle | undefined): CellStyle {
  return { ...EMPTY_CELL_STYLE, ...style };
}

const {
  MAX_COL_COUNT,
  MAX_ROW_COUNT,
  ROW_HEADER_WIDTH,
  COL_HEADER_HEIGHT,
  OVERSCAN_COUNT,
  AUTO_EXPAND_ROWS,
  AUTO_EXPAND_COLS,
} = GRID_CONSTANTS;

/** Stable empty set so "no filtered rows" keeps the same identity across renders */
const EMPTY_ROW_SET: Set<number> = new Set();

function resolveMergeAnchor(
  col: number,
  row: number,
  getMergeInfo: (c: number, r: number) => MergeInfo | undefined,
): { col: number; row: number } {
  const info = getMergeInfo(col, row);
  if (info && info.colSpan === 0 && info.rowSpan === 0) {
    return parseCellKey(info.anchorKey);
  }
  return { col, row };
}

/**
 * Binary search for the index i in [0, count) such that offset(i) <= x < offset(i+1).
 * `getOffset` must be monotonically non-decreasing (e.g. getColOffset/getRowOffset).
 * Only valid to use when there are no hidden rows/cols (offsets line up with plain indices).
 */
function findIndexByOffset(x: number, count: number, getOffset: (i: number) => number): number {
  if (count <= 0) return 0;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (getOffset(mid) <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function getRangePixelRect(
  startCol: number,
  endCol: number,
  startRow: number,
  endRow: number,
  getColWidth: (c: number) => number,
  getRowHeight: (r: number) => number,
): { left: number; top: number; width: number; height: number } {
  let left = 0;
  for (let c = 0; c < startCol; c++) left += getColWidth(c);
  let width = 0;
  for (let c = startCol; c <= endCol; c++) width += getColWidth(c);
  let top = 0;
  for (let r = 0; r < startRow; r++) top += getRowHeight(r);
  let height = 0;
  for (let r = startRow; r <= endRow; r++) height += getRowHeight(r);
  return { left, top, width, height };
}

/**
 * Expand a single anchor cell to the bounds of its surrounding contiguous data island
 * (the same "current region" rule Excel/Sheets use for e.g. Ctrl+A / auto filter range
 * detection): grow left/right/up/down while an adjacent row/column within the current
 * bounds has a value, until no side can grow further.
 */
function expandToDataRegion(
  anchor: { col: number; row: number },
  hasValue: (col: number, row: number) => boolean,
  maxCol: number,
  maxRow: number,
): { startCol: number; endCol: number; startRow: number; endRow: number } {
  if (!hasValue(anchor.col, anchor.row)) {
    return { startCol: anchor.col, endCol: anchor.col, startRow: anchor.row, endRow: anchor.row };
  }

  let left = anchor.col;
  let right = anchor.col;
  let top = anchor.row;
  let bottom = anchor.row;

  const colHasValue = (col: number) => {
    for (let r = top; r <= bottom; r++) if (hasValue(col, r)) return true;
    return false;
  };
  const rowHasValue = (row: number) => {
    for (let c = left; c <= right; c++) if (hasValue(c, row)) return true;
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    while (left > 0 && colHasValue(left - 1)) {
      left--;
      changed = true;
    }
    while (right < maxCol && colHasValue(right + 1)) {
      right++;
      changed = true;
    }
    while (top > 0 && rowHasValue(top - 1)) {
      top--;
      changed = true;
    }
    while (bottom < maxRow && rowHasValue(bottom + 1)) {
      bottom++;
      changed = true;
    }
  }

  return { startCol: left, endCol: right, startRow: top, endRow: bottom };
}

/** Every CellStyle key, used by fullStyle() below to build a "replace, don't merge" style object. */
const FULL_STYLE_KEYS: Array<keyof CellStyle> = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'textAlign',
  'verticalAlign',
  'backgroundColor',
  'textColor',
  'numberFormat',
  'numberFormatPattern',
  'fontSize',
  'fontFamily',
  'wrapText',
  'borders',
];

/**
 * Build a CellStyle with every key explicitly set (undefined unless present in `s`), so that
 * setCellStyle's merge-with-existing-style behavior effectively replaces the whole style
 * instead of only overwriting the keys present in `s`. `s === null` clears all style.
 */
function fullStyle(s: CellStyle | null): CellStyle {
  const base = {} as Record<keyof CellStyle, undefined>;
  for (const key of FULL_STYLE_KEYS) base[key] = undefined;
  return { ...base, ...(s ?? {}) };
}

export function Grid() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const colHeaderRef = useRef<HTMLDivElement>(null);
  const rowHeaderRef = useRef<HTMLDivElement>(null);
  const measureDivRef = useRef<HTMLDivElement>(null);
  // Persistent cell editor textarea: the grid's actual keyboard focus target (nav mode
  // included), replacing scrollContainerRef as the thing that gets focus()'d.
  const cellEditorRef = useRef<HTMLTextAreaElement>(null);
  const focusGrid = useCallback(() => {
    cellEditorRef.current?.focus({ preventScroll: true });
  }, []);
  const [cellEditorHasFocus, setCellEditorHasFocus] = useState(false);
  // useEffect required: tracks native focus/blur on the persistent cell editor textarea so its
  // autocomplete dropdown only shows while it (not the formula bar) actually has focus
  useEffect(() => {
    const el = cellEditorRef.current;
    if (!el) return;
    const onFocus = () => setCellEditorHasFocus(true);
    const onBlur = () => setCellEditorHasFocus(false);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  }, []);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  // How the current edit was started: 'enter' via direct character input (arrow keys confirm+move),
  // 'edit' via F2/double-click/formula bar (arrow keys move the caret)
  const [editMode, setEditMode] = useState<'enter' | 'edit'>('edit');
  const isEditingRef = useRef(isEditing);
  // Caret of the in-cell editor, for the function argument hint
  const cellEditorCaret = useCaretPosition(cellEditorRef, isEditing && cellEditorHasFocus);
  isEditingRef.current = isEditing;
  const editValueRef = useRef(editValue);
  editValueRef.current = editValue;
  // Tracks the range of the last cell reference inserted by clicking during formula editing
  const lastCellRefInsertRef = useRef<{ start: number; end: number } | null>(null);
  // Tracks drag-to-select range reference during formula editing
  const isFormulaDragRef = useRef(false);
  const formulaDragAnchorRef = useRef<{ col: number; row: number } | null>(null);
  const formulaDragInputRef = useRef<HTMLInputElement | null>(null);
  const lastFormulaDragPosRef = useRef<{ col: number; row: number } | null>(null);
  // Parsed formula references for colored highlights (computed from editValue)
  const formulaRefs = useMemo(() => {
    if (!isEditing || !editValue.startsWith('=')) return [];
    return extractFormulaRefs(editValue);
  }, [isEditing, editValue]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Search panel
  const [showSearch, setShowSearch] = useState(false);

  // Filter menu (which column's ▼ is open), UI-only, not persisted per sheet
  const [filterDropdownCol, setFilterDropdownCol] = useState<number | null>(null);

  // Drag selection state
  const isDragSelecting = useRef(false);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragRafRef = useRef(0);
  const lastDragCellRef = useRef<{ col: number; row: number } | null>(null);
  const formulaDragPointRef = useRef<{ x: number; y: number } | null>(null);

  // Column/row header drag-to-select-range state
  const [headerDragType, setHeaderDragType] = useState<'col' | 'row' | null>(null);
  const headerDragAnchorRef = useRef<number>(0);

  // Fill handle state
  const [isFillDragging, setIsFillDragging] = useState(false);
  const [fillDragTarget, setFillDragTarget] = useState<{ col: number; row: number } | null>(null);
  const fillPointRef = useRef<{ x: number; y: number } | null>(null);

  // Offscreen canvas for column auto-fit text measurement
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Conditional format / data validation / chart editor side panel (docked right of the grid; mutually exclusive)
  const [sidePanel, setSidePanel] = useState<'conditionalFormat' | 'validation' | 'chart' | null>(
    null,
  );
  // Whether the next open of the validation panel should jump straight into the new-rule
  // (プルダウン) edit form, e.g. from 挿入 > プルダウン.
  const [validationPanelNewOnOpen, setValidationPanelNewOnOpen] = useState(false);

  // Data validation dropdown (list-type rule), positioned against the active cell's rect
  const [validationDropdown, setValidationDropdown] = useState<{
    col: number;
    row: number;
    rect: DOMRect;
  } | null>(null);

  // Named range dialog
  const [showNamedRangeDialog, setShowNamedRangeDialog] = useState(false);

  // Cell context menu
  const [cellContextMenu, setCellContextMenu] = useState<{
    col: number;
    row: number;
    x: number;
    y: number;
  } | null>(null);

  // Chart editor (side panel): id of the chart currently being edited (null = editor closed)
  const [editingChartId, setEditingChartId] = useState<string | null>(null);

  // Sparkline dialog
  const [showSparklineDialog, setShowSparklineDialog] = useState(false);

  // Print preview dialog
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Pivot table dialog
  const [showPivotTableDialog, setShowPivotTableDialog] = useState(false);

  // Function wizard dialog
  const [showFunctionWizard, setShowFunctionWizard] = useState(false);

  // Keyboard shortcuts dialog
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  // Developer tools window + the recalculation heatmap it can paint over the grid
  const [showDevTools, setShowDevTools] = useState(false);
  const [recalcHeatmap, setRecalcHeatmap] = useState(false);

  // Hovered cell (for comment tooltip)
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null);

  // Theme
  const { theme, setTheme } = useTheme();

  // Zoom (persisted to localStorage)
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.zoom);
      const parsed = saved ? Number(saved) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    } catch {
      return 100;
    }
  });
  const zoomFactor = zoom / 100;
  const handleZoomChange = useCallback((next: number) => {
    setZoom(next);
    try {
      localStorage.setItem(STORAGE_KEYS.zoom, String(next));
    } catch {
      // localStorage may be unavailable (private browsing, disabled storage) — zoom still works, just isn't persisted
    }
  }, []);

  // Format painter (paint format tool): captured style to apply to the next click/drag target
  const [formatPainter, setFormatPainter] = useState<{ style: CellStyle | undefined } | null>(null);

  const {
    getCellData,
    setCellValue,
    deleteCells,
    batchSetCellValues,
    batchSetCellValuesOnSheet,
    replaceAllData,
    getDataMap,
    setCellStyle,
    transact,
    insertColumn: gridInsertColumn,
    deleteColumn: gridDeleteColumn,
    insertRow: gridInsertRow,
    deleteRow: gridDeleteRow,
    insertColumns: gridInsertColumns,
    deleteColumns: gridDeleteColumns,
    insertRows: gridInsertRows,
    deleteRows: gridDeleteRows,
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
    // Multi-sheet
    sheets,
    activeSheetId,
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
    // Per-sheet frozen pane
    getFrozenRows,
    getFrozenCols,
    setFrozenRows,
    setFrozenCols,
    // Per-sheet filter
    getFilterState,
    setFilterState: setSheetFilterState,
    getFilterRange,
    createFilter,
    removeFilter,
    getFilterConditions,
    setFilterCondition,
    // Range/sheet sort
    sortRange,
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
    title,
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
    namedRanges,
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
    pivotTables,
    addPivotTable,
    updatePivotTable,
    deletePivotTable,
    // Formula evaluation
    evaluateFormula: evaluateFormulaFn,
    evaluateFormulaAt,
    resolveRangeValues,
  } = useGridData();

  // Column/Row sizes (per-sheet — depends on activeSheetId from useGridData() above)
  const {
    getColWidth,
    setColWidth,
    getRowHeight,
    setRowHeight,
    resetRowHeight,
    isRowHeightManual,
    defaultColWidth,
    defaultRowHeight,
    shiftColWidths,
    shiftRowHeights,
    sizeVersion,
    getAllSizesBySheet,
    restoreAllSizes,
    copySheetSizes,
    getColOffset,
    getRowOffset,
  } = useColumnRowSizes(activeSheetId);

  // Derive frozen/filter from active sheet
  const frozenRows = getFrozenRows();
  const frozenCols = getFrozenCols();
  const filterState = getFilterState();
  const filterRange = getFilterRange();
  const filterConditions = getFilterConditions();

  // Dynamic col/row count from active sheet
  const colCount = getColCount();
  const rowCount = getRowCount();

  // Conditional format rules for active sheet
  const conditionalFormatRules = getConditionalFormatRules();

  // Sparkline data for active sheet
  const activeSheet = getActiveSheet();
  const sparklines = useMemo(() => activeSheet.sparklines ?? [], [activeSheet.sparklines]);

  // Build a map from locationCell -> SparklineConfig for quick lookup
  const sparklineMap = useMemo(() => {
    const map = new Map<string, import('../../types/sparkline').SparklineConfig>();
    for (const s of sparklines) {
      map.set(s.locationCell, s);
    }
    return map;
  }, [sparklines]);

  // Helper: resolve sparkline data values from a range string
  const getSparklineValues = useCallback(
    (dataRange: string): number[] => {
      const values: number[] = [];
      const rangeParts = dataRange.split(':');
      if (rangeParts.length !== 2) return values;
      const startPos = parseCellKey(rangeParts[0]);
      const endPos = parseCellKey(rangeParts[1]);
      const minCol = Math.min(startPos.col, endPos.col);
      const maxCol = Math.max(startPos.col, endPos.col);
      const minRow = Math.min(startPos.row, endPos.row);
      const maxRow = Math.max(startPos.row, endPos.row);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = getCellData(c, r);
          const display = cell?.displayValue ?? '';
          const num = Number(display);
          values.push(isNaN(num) ? 0 : num);
        }
      }
      return values;
      // oxlint-disable-next-line react-hooks/exhaustive-deps
    },
    [getCellData, version],
  );

  // Compute group scales for sparklines with groupId
  const sparklineGroupScales = useMemo(() => {
    const groupData = new Map<string, number[]>();
    for (const s of sparklines) {
      if (!s.groupId) continue;
      const vals = getSparklineValues(s.dataRange);
      const existing = groupData.get(s.groupId) ?? [];
      groupData.set(s.groupId, [...existing, ...vals]);
    }
    const scales = new Map<string, { min: number; max: number }>();
    for (const [gid, vals] of groupData) {
      if (vals.length > 0) {
        scales.set(gid, { min: Math.min(...vals), max: Math.max(...vals) });
      }
    }
    return scales;
  }, [sparklines, getSparklineValues]);

  // --- Grouping: compute collapsed rows/cols ---
  const rowGroups = useMemo(() => activeSheet.rowGroups ?? [], [activeSheet.rowGroups]);
  const colGroups = useMemo(() => activeSheet.colGroups ?? [], [activeSheet.colGroups]);
  const maxRowGroupLevel = getMaxGroupLevel(rowGroups);
  const maxColGroupLevel = getMaxGroupLevel(colGroups);
  const GROUP_INDENT = 16;
  const rowDigits = String(rowCount).length;
  const baseRowHeaderWidth = Math.max(ROW_HEADER_WIDTH, rowDigits * 10 + 20);
  const dynamicRowHeaderWidth = baseRowHeaderWidth + maxRowGroupLevel * GROUP_INDENT;
  const dynamicColHeaderHeight = COL_HEADER_HEIGHT + maxColGroupLevel * GROUP_INDENT;

  const collapsedRows = useMemo(
    () => computeCollapsedIndices(rowGroups, frozenRows),
    [rowGroups, frozenRows],
  );
  const collapsedCols = useMemo(
    () => computeCollapsedIndices(colGroups, frozenCols),
    [colGroups, frozenCols],
  );

  // Conditional formatting: rebuilt (and its internal per-rule caches invalidated) whenever
  // the rule set or workbook data changes.
  const conditionalFormatter = useMemo(
    () =>
      createConditionalFormatter(conditionalFormatRules, {
        getValue: (c, r) => {
          const cell = getCellData(c, r);
          if (cell?.error) return makeError(cell.error as ErrorCode);
          if (cell?.computed !== undefined) return cell.computed;
          return cell?.displayValue ?? '';
        },
        evaluateFormulaAt: (formula, c, r) => evaluateFormulaAt(formula, c, r),
      }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [conditionalFormatRules, version],
  );
  const getCfStyle = useCallback(
    (col: number, row: number): import('../../types/grid').CellStyle | undefined =>
      conditionalFormatter(col, row),
    [conditionalFormatter],
  );

  // Data validation: per-cell display mode (checkbox / dropdown) and invalid-input message.
  const validationCtx: ValidationContext = useMemo(
    () => ({
      resolveRangeValues: (range: string) => resolveRangeValues(range),
      evaluateFormulaAt: (formula: string, c: number, r: number) =>
        evaluateFormulaAt(formula, c, r),
    }),
    [resolveRangeValues, evaluateFormulaAt],
  );

  const getValidationUi = useCallback(
    (col: number, row: number): { validationUi?: CellValidationUi; invalidMessage?: string } => {
      const cell = getCellData(col, row);
      const rule = cell?.validation;
      if (!rule) return {};

      const rawValue = cell?.rawValue ?? '';
      let validationUi: CellValidationUi | undefined;
      if (rule.type === 'checkbox') {
        validationUi = { kind: 'checkbox', checked: isCheckboxChecked(rule, rawValue) };
      } else if (rule.type === 'list' && (rule.showDropdown ?? true)) {
        validationUi = { kind: 'dropdown', style: rule.dropdownStyle ?? 'chip' };
      }

      const result = validateInput(rule, rawValue, { col, row }, validationCtx);
      return { validationUi, invalidMessage: result.valid ? undefined : result.message };
      // oxlint-disable-next-line react-hooks/exhaustive-deps
    },
    [getCellData, validationCtx, version],
  );

  const {
    activeCell,
    selectionRange,
    setActiveCell,
    extendSelection,
    selectRange,
    extendSelectionTo,
    moveActiveCell,
    getSelectedPositions,
    isCellSelected,
    isCellActive,
  } = useSelection();

  const activeCellRef = useRef(activeCell);
  activeCellRef.current = activeCell;

  const {
    copy: clipboardCopy,
    buildPastePlan,
    cancelClipboard,
    hasClipboard,
    clipboardRange,
  } = useClipboard();
  // Sheet the current internal clipboard was copied/cut from, tracked locally so the
  // marching-ants overlay can hide itself after switching to a different sheet.
  const clipboardSourceSheetIdRef = useRef<string | undefined>(undefined);

  // Normalized (start = top-left) current selection, or the active cell alone.
  const getNormalizedSelection = useCallback((): { start: CellPosition; end: CellPosition } => {
    if (!selectionRange) return { start: activeCell, end: activeCell };
    return {
      start: {
        col: Math.min(selectionRange.start.col, selectionRange.end.col),
        row: Math.min(selectionRange.start.row, selectionRange.end.row),
      },
      end: {
        col: Math.max(selectionRange.start.col, selectionRange.end.col),
        row: Math.max(selectionRange.start.row, selectionRange.end.row),
      },
    };
  }, [selectionRange, activeCell]);

  // --- Filter logic ---
  // Rows hidden by the active filter: below filterRange's header row (and within its row bounds),
  // failing either the value-checkbox filter (filterState) or a column's condition filter.
  const hiddenRows = useMemo((): Set<number> => {
    if (!filterRange) return EMPTY_ROW_SET;
    if (filterState.size === 0 && Object.keys(filterConditions).length === 0) return EMPTY_ROW_SET;

    const hidden = new Set<number>();
    const dataMap = getDataMap();
    const dataStartRow = filterRange.startRow + 1;
    const dataEndRow = filterRange.endRow ?? rowCount - 1;
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      for (let c = filterRange.startCol; c <= filterRange.endCol; c++) {
        const cell = dataMap.get(cellKey(c, r));
        const val = cell?.displayValue ?? '';
        const allowedValues = filterState.get(c);
        if (allowedValues && !allowedValues.has(val)) {
          hidden.add(r);
          break;
        }
        const condition = filterConditions[c];
        if (
          condition &&
          !evaluateCondition(val, {
            id: '',
            style: {},
            priority: 0,
            enabled: true,
            range: { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
            operator: condition.operator,
            value1: condition.value1 ?? '',
            value2: condition.value2,
          })
        ) {
          hidden.add(r);
          break;
        }
      }
    }
    return hidden;
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRange, filterState, filterConditions, rowCount, version]);

  // Rows/cols that are not rendered (explicitly hidden, group-collapsed, or filtered out). Overlay positions
  // (fill handle, selection/copy outlines, formula-reference boxes, cell editor, frozen panes) must use the
  // *visible* sizes below, otherwise every hidden column/row before the target shifts them.
  const explicitHiddenCols = activeSheet.hiddenCols;
  const explicitHiddenRows = activeSheet.hiddenRows;
  const isColHidden = useCallback(
    (c: number) => collapsedCols.has(c) || (explicitHiddenCols?.includes(c) ?? false),
    [collapsedCols, explicitHiddenCols],
  );
  const isRowHidden = useCallback(
    (r: number) =>
      hiddenRows.has(r) || collapsedRows.has(r) || (explicitHiddenRows?.includes(r) ?? false),
    [hiddenRows, collapsedRows, explicitHiddenRows],
  );
  const visibleColWidth = useCallback(
    (c: number) => (isColHidden(c) ? 0 : getColWidth(c)),
    [isColHidden, getColWidth],
  );
  const visibleRowHeight = useCallback(
    (r: number) => (isRowHidden(r) ? 0 : getRowHeight(r)),
    [isRowHidden, getRowHeight],
  );

  const formulaRefRects = useMemo(() => {
    return formulaRefs.map((fRef) =>
      getRangePixelRect(
        fRef.startCol,
        fRef.endCol,
        fRef.startRow,
        fRef.endRow,
        visibleColWidth,
        visibleRowHeight,
      ),
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaRefs, visibleColWidth, visibleRowHeight, sizeVersion]);

  // Content-space rects for the gliding selection cursor (active cell expanded to its merge, plus the
  // multi-cell range outline). The cursor only lives in the scrollable pane; frozen-pane cells keep
  // drawing their own static outline.
  const cursorRects = useMemo(() => {
    const merge = getMergeInfo(activeCell.col, activeCell.row);
    const active = getRangePixelRect(
      activeCell.col,
      activeCell.col + Math.max(1, merge?.colSpan ?? 1) - 1,
      activeCell.row,
      activeCell.row + Math.max(1, merge?.rowSpan ?? 1) - 1,
      visibleColWidth,
      visibleRowHeight,
    );
    const sel = getNormalizedSelection();
    const isRange = sel.start.col !== sel.end.col || sel.start.row !== sel.end.row;
    const selection = isRange
      ? getRangePixelRect(
          sel.start.col,
          sel.end.col,
          sel.start.row,
          sel.end.row,
          visibleColWidth,
          visibleRowHeight,
        )
      : active;
    return {
      active: activeCell.col >= frozenCols && activeCell.row >= frozenRows ? active : null,
      range: isRange ? selection : null,
      // Whole selection (or the active cell): drives the row/column header highlight bands
      selection,
      // Active cell incl. merge span, regardless of pane (precedent arrows target)
      activeRect: active,
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCell,
    getNormalizedSelection,
    getMergeInfo,
    visibleColWidth,
    visibleRowHeight,
    frozenCols,
    frozenRows,
    sizeVersion,
  ]);

  // "Trace precedents" for the selected formula cell: same-sheet references (up to 8), colored like
  // the in-editor reference highlights. Cross-sheet references (Sheet2!A1) are skipped.
  const activeFormula = getCellData(activeCell.col, activeCell.row)?.formula;
  const precedentArrows = useMemo(() => {
    if (isEditing || !activeFormula) return null;
    const formula = '=' + activeFormula;
    const maxCol = colCount - 1;
    const maxRow = rowCount - 1;
    const sources = extractFormulaRefs(formula)
      .filter((r) => formula[r.start - 1] !== '!')
      .slice(0, 8)
      .map((r, i) => ({
        rect: getRangePixelRect(
          Math.min(r.startCol, r.endCol, maxCol),
          Math.min(Math.max(r.startCol, r.endCol), maxCol),
          Math.min(r.startRow, r.endRow, maxRow),
          Math.min(Math.max(r.startRow, r.endRow), maxRow),
          visibleColWidth,
          visibleRowHeight,
        ),
        color: REF_COLORS[i % REF_COLORS.length],
      }))
      .filter((s) => s.rect.width > 0 && s.rect.height > 0);
    if (sources.length === 0) return null;
    return {
      key: `${activeSheetId}:${activeCell.col},${activeCell.row}:${activeFormula}`,
      sources,
      target: cursorRects.activeRect,
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditing,
    activeFormula,
    activeCell,
    activeSheetId,
    colCount,
    rowCount,
    visibleColWidth,
    visibleRowHeight,
    cursorRects,
    sizeVersion,
  ]);

  // Sheet-level hidden row/col sets (explicit hide, distinct from filter/group collapse) — used
  // by keyboard navigation's hidden-skip logic and the header boundary unhide indicators.
  const hiddenRowSet = useMemo(
    () => new Set(activeSheet.hiddenRows ?? []),
    [activeSheet.hiddenRows],
  );
  const hiddenColSet = useMemo(
    () => new Set(activeSheet.hiddenCols ?? []),
    [activeSheet.hiddenCols],
  );

  // Visible row indices (for virtualizer, combining filter + grouping + sheet-level hidden rows)
  const visibleRowIndices = useMemo((): number[] => {
    const indices: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      if (!hiddenRows.has(r) && !collapsedRows.has(r) && !hiddenRowSet.has(r)) {
        indices.push(r);
      }
    }
    return indices;
  }, [rowCount, hiddenRows, collapsedRows, hiddenRowSet]);

  const visibleRowCount = visibleRowIndices.length;

  // Visible row/col index sets, for O(1) "is this row/col visible" checks (keyboard navigation).
  const visibleRowIndexSet = useMemo(() => new Set(visibleRowIndices), [visibleRowIndices]);

  // --- Sort logic ---
  // Single shared useToast() instance: showToast is used by sort/dedupe handlers below,
  // toasts/dismissToast feed the single <ToastContainer> rendered near the end of this component.
  const { toasts, showToast, dismissToast } = useToast();

  // Sort motion: after a sort, every moved row slides from where its data used to be to its new
  // position (Cell animates translateY from --sort-dy to 0). `phase` restarts the animation per sort.
  const [sortMotion, setSortMotion] = useState<{
    phase: number;
    startCol: number;
    endCol: number;
    rows: Map<number, { dy: number; delay: number }>;
  } | null>(null);
  const sortPhaseRef = useRef(0);
  const animateSort = useCallback(
    (range: { startCol: number; endCol: number; startRow: number }, order: number[]) => {
      if (order.length === 0 || order.length > 5000) return;
      const lastRow = Math.max(range.startRow + order.length - 1, ...order);
      const tops = new Array<number>(lastRow + 1);
      let y = 0;
      for (let r = 0; r <= lastRow; r++) {
        tops[r] = y;
        y += visibleRowHeight(r);
      }
      const rows = new Map<number, { dy: number; delay: number }>();
      order.forEach((oldRow, i) => {
        const newRow = range.startRow + i;
        const dy = tops[oldRow] - tops[newRow];
        // A light cascade down the range: later rows set off a little later
        if (dy !== 0) rows.set(newRow, { dy, delay: Math.min(i * 14, 220) });
      });
      if (rows.size === 0) return;
      sortPhaseRef.current += 1;
      setSortMotion({
        phase: sortPhaseRef.current,
        startCol: range.startCol,
        endCol: range.endCol,
        rows,
      });
    },
    [visibleRowHeight],
  );
  // useEffect required: timer that drops the finished sort motion (so cells lose their animation)
  useEffect(() => {
    if (!sortMotion) return;
    const timer = setTimeout(() => setSortMotion(null), 1100);
    return () => clearTimeout(timer);
  }, [sortMotion]);
  const getSortMotionProps = useCallback(
    (col: number, row: number) => {
      if (!sortMotion || col < sortMotion.startCol || col > sortMotion.endCol) return undefined;
      const m = sortMotion.rows.get(row);
      return m ? { dy: m.dy, delay: m.delay, phase: sortMotion.phase } : undefined;
    },
    [sortMotion],
  );

  /** Sort `range` and animate the rows into place; toasts when the range contains merged cells. */
  const sortAndAnimate = useCallback(
    (
      range: { startCol: number; endCol: number; startRow: number; endRow: number },
      keys: SortKey[],
    ) => {
      const ok = sortRange(range, keys, (order) => animateSort(range, order));
      if (!ok) showToast('結合されたセルを含む範囲は並べ替えできません', 'error');
    },
    [sortRange, animateSort, showToast],
  );

  /** Sort the whole sheet (below any frozen rows) by a single column — used by the column
   * header context menu and the データ menu's "Sort sheet" commands. */
  const sortSheetByColumn = useCallback(
    (colIndex: number, ascending: boolean) => {
      sortAndAnimate(
        { startCol: 0, endCol: colCount - 1, startRow: frozenRows, endRow: rowCount - 1 },
        [{ col: colIndex, ascending }],
      );
    },
    [sortAndAnimate, colCount, rowCount, frozenRows],
  );

  /** FilterMenu's "A→Z/Z→A で並べ替え": sorts only the filter range's data rows (below its header row). */
  const sortFilterRangeByColumn = useCallback(
    (colIndex: number, ascending: boolean) => {
      if (!filterRange) return;
      sortAndAnimate(
        {
          startCol: filterRange.startCol,
          endCol: filterRange.endCol,
          startRow: filterRange.startRow + 1,
          endRow: filterRange.endRow ?? rowCount - 1,
        },
        [{ col: colIndex, ascending }],
      );
    },
    [sortAndAnimate, filterRange, rowCount],
  );

  // "範囲を並べ替え" dialog
  const [showSortRangeDialog, setShowSortRangeDialog] = useState(false);
  const handleConfirmSortRange = useCallback(
    (
      range: { startCol: number; endCol: number; startRow: number; endRow: number },
      keys: SortKey[],
    ) => {
      sortAndAnimate(range, keys);
    },
    [sortAndAnimate],
  );

  // --- Filter logic ---
  /** Unique display values within the filter's data rows (below the header row) for one column. */
  const getUniqueValuesForColumn = useCallback(
    (colIndex: number): string[] => {
      if (!filterRange) return [];
      const dataMap = getDataMap();
      const values = new Set<string>();
      const dataStartRow = filterRange.startRow + 1;
      const dataEndRow = filterRange.endRow ?? rowCount - 1;
      for (let r = dataStartRow; r <= dataEndRow; r++) {
        const cell = dataMap.get(cellKey(colIndex, r));
        values.add(cell?.displayValue ?? '');
      }
      return Array.from(values).sort();
      // oxlint-disable-next-line react-hooks/exhaustive-deps
    },
    [filterRange, getDataMap, rowCount, version],
  );

  const handleFilterMenuApply = useCallback(
    (colIndex: number, values: Set<string> | undefined, condition: FilterCondition | undefined) => {
      const prev = getFilterState();
      const next = new Map(prev);
      if (values) next.set(colIndex, values);
      else next.delete(colIndex);
      setSheetFilterState(next);
      setFilterCondition(colIndex, condition);
    },
    [getFilterState, setSheetFilterState, setFilterCondition],
  );

  /** "フィルタを作成" / "フィルタを削除" (データ menu + toolbar): toggles the filter on the current selection. */
  const handleToggleFilter = useCallback(() => {
    if (filterRange) {
      removeFilter();
      return;
    }
    const sel = getNormalizedSelection();
    const isSingleCell = sel.start.col === sel.end.col && sel.start.row === sel.end.row;
    if (isSingleCell) {
      const hasValue = (c: number, r: number) => {
        const cell = getCellData(c, r);
        return !!cell && cell.rawValue !== '';
      };
      const region = expandToDataRegion(sel.start, hasValue, colCount - 1, rowCount - 1);
      createFilter(region);
    } else {
      createFilter({
        startCol: sel.start.col,
        endCol: sel.end.col,
        startRow: sel.start.row,
        endRow: sel.end.row,
      });
    }
  }, [
    filterRange,
    removeFilter,
    getNormalizedSelection,
    getCellData,
    colCount,
    rowCount,
    createFilter,
  ]);

  // --- Data cleanup ---
  const [showRemoveDuplicatesDialog, setShowRemoveDuplicatesDialog] = useState(false);
  const handleConfirmRemoveDuplicates = useCallback(
    (
      range: { startCol: number; endCol: number; startRow: number; endRow: number },
      hasHeader: boolean,
      checkCols: number[],
    ) => {
      const { duplicateCount, uniqueCount } = removeDuplicateRows(range, hasHeader, checkCols);
      showToast(
        `重複する行が ${duplicateCount} 行見つかり、削除されました。${uniqueCount} 行の一意の値が残っています。`,
      );
    },
    [removeDuplicateRows, showToast],
  );

  const handleTrimWhitespace = useCallback(() => {
    const sel = getNormalizedSelection();
    trimWhitespaceInRange({
      startCol: sel.start.col,
      endCol: sel.end.col,
      startRow: sel.start.row,
      endRow: sel.end.row,
    });
  }, [getNormalizedSelection, trimWhitespaceInRange]);

  // "テキストを列に分割": popover to change the auto-detected delimiter after the fact
  // (re-splitting is implemented as undo + re-split, per the design note in the spec).
  type SplitDelimiterMode = 'auto' | ',' | ';' | '.' | ' ' | 'custom';
  const [splitPopover, setSplitPopover] = useState<{
    col: number;
    startRow: number;
    endRow: number;
    mode: SplitDelimiterMode;
    custom: string;
  } | null>(null);

  const resolveSplitDelimiter = useCallback(
    (col: number, startRow: number, mode: SplitDelimiterMode, custom: string): string => {
      if (mode === 'auto') return detectDelimiter(getCellData(col, startRow)?.displayValue ?? '');
      if (mode === 'custom') return custom;
      return mode;
    },
    [getCellData],
  );

  const handleSplitTextToColumnsAction = useCallback(() => {
    const sel = getNormalizedSelection();
    const col = sel.start.col;
    const startRow = sel.start.row;
    const endRow = sel.end.row;
    const delimiter = resolveSplitDelimiter(col, startRow, 'auto', '');
    splitTextToColumns(col, startRow, endRow, delimiter);
    setSplitPopover({ col, startRow, endRow, mode: 'auto', custom: '' });
  }, [getNormalizedSelection, resolveSplitDelimiter, splitTextToColumns]);

  const handleChangeSplitDelimiter = useCallback(
    (mode: SplitDelimiterMode, custom: string) => {
      if (!splitPopover) return;
      const delimiter = resolveSplitDelimiter(
        splitPopover.col,
        splitPopover.startRow,
        mode,
        custom,
      );
      undo();
      splitTextToColumns(splitPopover.col, splitPopover.startRow, splitPopover.endRow, delimiter);
      setSplitPopover({ ...splitPopover, mode, custom });
    },
    [splitPopover, resolveSplitDelimiter, undo, splitTextToColumns],
  );

  // --- Clipboard handlers ---
  // GetCell implementation for useClipboard: rawValue + formatted display text + computed
  // value text (for "paste values only") + style.
  const getCellForClipboard = useCallback(
    (col: number, row: number) => {
      const data = getCellData(col, row);
      if (!data) return undefined;
      return {
        rawValue: data.rawValue,
        displayText: formatDisplayValue(data.displayValue, data.style?.numberFormat ?? 'auto'),
        valueText: data.formula !== undefined ? data.displayValue : data.rawValue,
        style: data.style,
      };
    },
    [getCellData],
  );

  const handleCopy = useCallback(
    (e?: ClipboardEvent) => {
      clipboardSourceSheetIdRef.current = activeSheetId;
      clipboardCopy(getNormalizedSelection(), getCellForClipboard, activeSheetId, false, e);
    },
    [clipboardCopy, getNormalizedSelection, getCellForClipboard, activeSheetId],
  );

  const handleCut = useCallback(
    (e?: ClipboardEvent) => {
      clipboardSourceSheetIdRef.current = activeSheetId;
      clipboardCopy(getNormalizedSelection(), getCellForClipboard, activeSheetId, true, e);
    },
    [clipboardCopy, getNormalizedSelection, getCellForClipboard, activeSheetId],
  );

  // Apply a paste plan built by useClipboard: writes values/styles, clears cut source cells,
  // auto-expands the grid, and selects the pasted range.
  const applyPastePlan = useCallback(
    (plan: PastePlan) => {
      const { entries, clearEntries, sourceSheetId, pastedRange } = plan;

      // Auto-expand grid to fit pasted data
      let maxCol = colCount;
      let maxRow = rowCount;
      for (const en of entries) {
        if (en.col + 1 > maxCol) maxCol = en.col + 1;
        if (en.row + 1 > maxRow) maxRow = en.row + 1;
      }
      if (clearEntries) {
        for (const en of clearEntries) {
          if (en.col + 1 > maxCol) maxCol = en.col + 1;
          if (en.row + 1 > maxRow) maxRow = en.row + 1;
        }
      }
      if (maxCol > colCount) setColCount(Math.min(maxCol + AUTO_EXPAND_COLS, MAX_COL_COUNT));
      if (maxRow > rowCount) setRowCount(Math.min(maxRow + AUTO_EXPAND_ROWS, MAX_ROW_COUNT));

      transact(() => {
        const crossSheetCut = !!(
          clearEntries &&
          clearEntries.length > 0 &&
          sourceSheetId &&
          sourceSheetId !== activeSheetId
        );
        const valueEntries = entries
          .filter((en) => en.value !== undefined)
          .map((en) => ({ col: en.col, row: en.row, value: en.value! }));

        if (crossSheetCut) {
          // batchSetCellValues records the undo snapshot; clearCellsOnSheet doesn't, so it must come second
          if (valueEntries.length > 0) batchSetCellValues(valueEntries);
          clearCellsOnSheet(sourceSheetId!, clearEntries!);
        } else if (clearEntries && clearEntries.length > 0) {
          batchSetCellValues([
            ...clearEntries.map((en) => ({ col: en.col, row: en.row, value: '' })),
            ...valueEntries,
          ]);
        } else if (valueEntries.length > 0) {
          batchSetCellValues(valueEntries);
        }

        // A same-sheet cut also clears the source cells' style (cross-sheet clearCellsOnSheet
        // above already removes the cells entirely, style included). Done before applying the pasted
        // styles, and skipping cells that are paste targets, so an overlapping move keeps its format.
        if (!crossSheetCut && clearEntries && clearEntries.length > 0) {
          const targetKeys = new Set(entries.map((en) => `${en.col},${en.row}`));
          const sourceOnly = clearEntries.filter((en) => !targetKeys.has(`${en.col},${en.row}`));
          if (sourceOnly.length > 0) {
            setCellStyle(
              sourceOnly.map((en) => ({ col: en.col, row: en.row })),
              fullStyle(null),
            );
          }
        }

        // Style entries: group identical full styles together to minimize setCellStyle/undo entries
        const styleEntries = entries.filter((en) => en.style !== undefined);
        if (styleEntries.length > 0) {
          const groups = new Map<string, { style: CellStyle; positions: CellPosition[] }>();
          for (const en of styleEntries) {
            const resolved = fullStyle(en.style ?? null);
            const groupKey = JSON.stringify(resolved);
            const group = groups.get(groupKey);
            if (group) group.positions.push({ col: en.col, row: en.row });
            else
              groups.set(groupKey, { style: resolved, positions: [{ col: en.col, row: en.row }] });
          }
          for (const { style, positions } of groups.values()) {
            setCellStyle(positions, style);
          }
        }
      });

      // Select the pasted range
      if (
        pastedRange.start.col === pastedRange.end.col &&
        pastedRange.start.row === pastedRange.end.row
      ) {
        setActiveCell(pastedRange.start);
      } else {
        selectRange(pastedRange, pastedRange.start);
      }
    },
    [
      colCount,
      rowCount,
      setColCount,
      setRowCount,
      activeSheetId,
      clearCellsOnSheet,
      batchSetCellValues,
      setCellStyle,
      setActiveCell,
      selectRange,
      transact,
    ],
  );

  const handlePasteMode = useCallback(
    async (mode: PasteMode, e?: ClipboardEvent) => {
      const plan = await buildPastePlan(getNormalizedSelection(), mode, e);
      if (plan) applyPastePlan(plan);
    },
    [buildPastePlan, getNormalizedSelection, applyPastePlan],
  );

  const handlePaste = useCallback(
    (e?: ClipboardEvent) => {
      void handlePasteMode('normal', e);
    },
    [handlePasteMode],
  );

  // --- Import/Export handlers ---
  const {
    handleImportFile,
    handleExportCSV,
    handleExportJSON,
    handleExportXLSX,
    handleSaveTabula,
    handleOpenTabula,
  } = useFileIO({
    getDataMap,
    replaceAllData,
    getColCount,
    getRowCount,
    setColCount,
    setRowCount,
    sheets,
    activeSheetId,
    replaceWorkbook,
    getAllSizesBySheet,
    restoreAllSizes,
    namedRanges,
    pivotTables,
    title,
  });

  // --- Autosave (IndexedDB) ---
  const serializeForAutosave = useCallback(
    () =>
      serialize({
        sheets,
        activeSheetId,
        colWidths: new Map(),
        rowHeights: new Map(),
        sizesBySheet: getAllSizesBySheet(),
        namedRanges,
        pivotTables,
        title,
        compact: true,
      }),
    [sheets, activeSheetId, getAllSizesBySheet, namedRanges, pivotTables, title],
  );
  const restoreFromAutosave = useCallback(
    (json: string) => {
      const result = deserialize(json);
      replaceWorkbook(result.workbook, { resetHistory: true });
      restoreAllSizes(result.sizesBySheet);
    },
    [replaceWorkbook, restoreAllSizes],
  );
  const {
    status: saveStatus,
    lastSavedAt,
    restored: autosaveRestored,
  } = useAutosave({
    version,
    sizeVersion,
    serialize: serializeForAutosave,
    restore: restoreFromAutosave,
  });

  // useEffect required: dismisses the static splash overlay from index.html (DOM outside React) once restored
  useEffect(() => {
    if (autosaveRestored) hideSplash();
  }, [autosaveRestored]);

  // useEffect required: syncs the browser tab title with the document title (external system)
  useEffect(() => {
    document.title = `${title || UNTITLED_SPREADSHEET_NAME} - Tabula`;
  }, [title]);

  // --- Drag & Drop ---
  const { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } =
    useDragDrop(handleImportFile);

  // --- Style management ---
  // Memoize to avoid changing the context value on unrelated re-renders
  const activeCellStyle = useMemo(
    () => getCellData(activeCell.col, activeCell.row)?.style,
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [getCellData, activeCell.col, activeCell.row, version],
  );

  const measureCellHeight = useCallback(
    (col: number, row: number): number => {
      const div = measureDivRef.current;
      if (!div) return defaultRowHeight;

      const cellData = getCellData(col, row);
      const style = cellData?.style;
      const text = cellData?.displayValue ?? cellData?.rawValue ?? '';
      const fontSize = style?.fontSize;

      const minFontHeight = fontSize ? Math.ceil(fontSize * 1.5) : defaultRowHeight;

      if (!text && !fontSize) return defaultRowHeight;

      const whiteSpace = style?.wrapText ? 'normal' : 'nowrap';
      const wordBreak = style?.wrapText ? 'break-word' : 'normal';
      // Batch all style writes into a single cssText assignment to avoid layout thrashing. cssText
      // replaces the whole inline style, so it must restate the off-screen/hidden positioning too.
      div.style.cssText = `position:absolute;visibility:hidden;top:-9999px;left:-9999px;height:auto;overflow:hidden;padding:0;width:${getColWidth(col) - 8}px;font-size:${fontSize ? `${fontSize}pt` : '13px'};font-family:${style?.fontFamily ?? ''};font-weight:${style?.bold ? 'bold' : 'normal'};white-space:${whiteSpace};word-break:${wordBreak};overflow-wrap:${wordBreak};line-height:1.4`;

      div.textContent = text;
      return Math.max(minFontHeight, div.scrollHeight + 4);
    },
    [getCellData, getColWidth, defaultRowHeight],
  );

  /**
   * Fit row heights to wrapped text / enlarged fonts (like Excel's auto-fit). Plain single-line text
   * never changes a height. Heights the user or an imported file set are only ever grown to fit;
   * heights auto-fit set itself grow and shrink, and return to the sheet default when not needed.
   */
  const autoResizeRows = useCallback(
    (rowIndices: Set<number>, options?: { force?: boolean }) => {
      const sheet = getActiveSheet();
      const colCount = sheet.colCount;
      for (const rowIndex of rowIndices) {
        let needed: number = defaultRowHeight;

        // Probe each column in this row directly instead of scanning the entire cell map
        for (let c = 0; c < colCount; c++) {
          const cellData = sheet.cells.get(cellKey(c, rowIndex));
          if (!cellData?.style?.wrapText && !cellData?.style?.fontSize) continue;
          const h = measureCellHeight(c, rowIndex);
          if (h > needed) needed = h;
        }

        // `force` (explicit auto-fit request) treats a user/file height like an auto-fit one
        if (!options?.force && isRowHeightManual(rowIndex)) {
          if (needed > getRowHeight(rowIndex)) setRowHeight(rowIndex, needed);
        } else if (needed > defaultRowHeight) {
          if (needed !== getRowHeight(rowIndex)) setRowHeight(rowIndex, needed, { auto: true });
        } else {
          resetRowHeight(rowIndex);
        }
      }
    },
    [
      getActiveSheet,
      measureCellHeight,
      setRowHeight,
      resetRowHeight,
      isRowHeightManual,
      getRowHeight,
      defaultRowHeight,
    ],
  );

  const handleSetCellStyle = useCallback(
    (style: Partial<CellStyle>) => {
      const positions = getSelectedPositions();
      setCellStyle(positions, style);

      // Defer measurement to after the DOM reflects the style changes
      const affectedRows = new Set(positions.map((p) => p.row));
      requestAnimationFrame(() => autoResizeRows(affectedRows));
    },
    [getSelectedPositions, setCellStyle, autoResizeRows],
  );

  const handleToggleBold = useCallback(() => {
    const currentBold = getCellData(activeCell.col, activeCell.row)?.style?.bold ?? false;
    handleSetCellStyle({ bold: !currentBold });
  }, [activeCell, getCellData, handleSetCellStyle]);

  const handleToggleItalic = useCallback(() => {
    const currentItalic = getCellData(activeCell.col, activeCell.row)?.style?.italic ?? false;
    handleSetCellStyle({ italic: !currentItalic });
  }, [activeCell, getCellData, handleSetCellStyle]);

  const handleToggleUnderline = useCallback(() => {
    const currentUnderline = getCellData(activeCell.col, activeCell.row)?.style?.underline ?? false;
    handleSetCellStyle({ underline: !currentUnderline });
  }, [activeCell, getCellData, handleSetCellStyle]);

  // --- Merge computed values ---
  const canMerge = useMemo(() => {
    if (!selectionRange) return false;
    const colSpan = Math.abs(selectionRange.end.col - selectionRange.start.col) + 1;
    const rowSpan = Math.abs(selectionRange.end.row - selectionRange.start.row) + 1;
    return colSpan > 1 || rowSpan > 1;
  }, [selectionRange]);

  const isMerged = useMemo(() => {
    const info = getMergeInfo(activeCell.col, activeCell.row);
    return info !== undefined;
  }, [getMergeInfo, activeCell.col, activeCell.row]);

  // --- Merge handlers ---
  const handleMergeCells = useCallback(() => {
    const range = selectionRange ?? { start: activeCell, end: activeCell };
    mergeCells(range);
  }, [mergeCells, selectionRange, activeCell]);

  const handleUnmergeCells = useCallback(() => {
    const info = getMergeInfo(activeCell.col, activeCell.row);
    if (info) {
      unmergeCells(info.anchorKey);
    }
  }, [getMergeInfo, unmergeCells, activeCell.col, activeCell.row]);

  // --- Cell context menu handler ---
  const handleCellContextMenu = useCallback((col: number, row: number, x: number, y: number) => {
    setCellContextMenu({ col, row, x, y });
  }, []);

  // --- Cell hover handlers ---
  // Hover only matters for cells with a note (comment tooltip). Updating state for every hovered cell
  // re-rendered the whole grid on each mouse move, so cells without a note are ignored.
  const handleCellMouseEnter = useCallback(
    (col: number, row: number) => {
      const hasNote = !!getCellData(col, row)?.comment;
      setHoveredCell((prev) => {
        if (!hasNote) return prev === null ? prev : null;
        return prev && prev.col === col && prev.row === row ? prev : { col, row };
      });
    },
    [getCellData],
  );

  const handleCellMouseLeave = useCallback(() => {
    setHoveredCell((prev) => (prev === null ? prev : null));
  }, []);

  // --- Chart insert handler: 挿入 > グラフ creates a default chart from the current selection
  // and immediately opens the editor for it (Google Sheets-style flow). ---
  const handleInsertChart = useCallback(() => {
    const chart: ChartData = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      type: 'bar',
      title: 'グラフ',
      sourceRange: {
        startCol: selectionRange
          ? Math.min(selectionRange.start.col, selectionRange.end.col)
          : activeCell.col,
        startRow: selectionRange
          ? Math.min(selectionRange.start.row, selectionRange.end.row)
          : activeCell.row,
        endCol: selectionRange
          ? Math.max(selectionRange.start.col, selectionRange.end.col)
          : activeCell.col,
        endRow: selectionRange
          ? Math.max(selectionRange.start.row, selectionRange.end.row)
          : activeCell.row,
      },
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };
    addChart(chart);
    setEditingChartId(chart.id);
    setSidePanel('chart');
  }, [addChart, selectionRange, activeCell]);

  const handleEditChart = useCallback((id: string) => {
    setEditingChartId(id);
    setSidePanel('chart');
  }, []);

  const handleDeleteChart = useCallback(
    (id: string) => {
      deleteChart(id);
      if (editingChartId === id) {
        setEditingChartId(null);
        setSidePanel(null);
      }
    },
    [deleteChart, editingChartId],
  );

  const handleCloseChartEditor = useCallback(() => {
    setSidePanel(null);
    setEditingChartId(null);
  }, []);

  // --- ファイル > 新規作成: reset workbook + column/row sizes ---
  const handleNewWorkbook = useCallback(() => {
    newWorkbook();
    restoreAllSizes(new Map());
  }, [newWorkbook, restoreAllSizes]);

  // --- Pivot table creation handler ---
  const handleCreatePivot = useCallback(
    (
      config: import('../../types/pivot').PivotTableConfig,
      outputSheet: import('../../types/grid').SheetData,
      outputCells: Array<{ col: number; row: number; value: string }>,
    ) => {
      // First add a new sheet (this updates sheetsRef and activeSheetIdRef internally)
      addSheet();
      // After addSheet(), getActiveSheet returns the newly created sheet
      const newSheet = getActiveSheet();
      // Rename to the pivot sheet name
      renameSheet(newSheet.id, outputSheet.name);

      // Save the pivot config with the actual new sheet id
      const finalConfig = { ...config, targetSheetId: newSheet.id };
      addPivotTable(finalConfig);

      // Write pivot data to the new sheet (already active)
      batchSetCellValues(outputCells);
    },
    [addPivotTable, addSheet, getActiveSheet, renameSheet, batchSetCellValues],
  );

  // --- Refresh pivot table handler ---
  const handleRefreshPivotTable = useCallback(
    (pivotId: string) => {
      const pivotConfig = pivotTables.find((pt) => pt.id === pivotId);
      if (!pivotConfig) return;

      const sourceSheet = sheets.find((s) => s.id === pivotConfig.sourceSheetId);
      if (!sourceSheet) return;

      // Extract source data
      const rangeParts = pivotConfig.sourceRange.split(':');
      if (rangeParts.length !== 2) return;
      const startPos = parseCellKey(rangeParts[0]);
      const endPos = parseCellKey(rangeParts[1]);
      const minCol = Math.min(startPos.col, endPos.col);
      const maxCol = Math.max(startPos.col, endPos.col);
      const minRow = Math.min(startPos.row, endPos.row);
      const maxRow = Math.max(startPos.row, endPos.row);

      const sourceData: string[][] = [];
      for (let r = minRow; r <= maxRow; r++) {
        const row: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const key = cellKey(c, r);
          const cell = sourceSheet.cells.get(key);
          row.push(cell?.displayValue ?? '');
        }
        sourceData.push(row);
      }

      const pivotResult = buildPivotTableFn(sourceData, {
        rowFields: pivotConfig.rowFields,
        colFields: pivotConfig.colFields,
        valueFields: pivotConfig.valueFields,
        filterFields: pivotConfig.filterFields,
        filterValues: pivotConfig.filterValues,
        collapsedRows: pivotConfig.collapsedRows,
      });

      // Clear existing cells on target sheet before writing new data
      const targetSheet = sheets.find((s) => s.id === pivotConfig.targetSheetId);
      if (targetSheet) {
        const clearPositions: Array<{ col: number; row: number }> = [];
        for (const key of targetSheet.cells.keys()) {
          const pos = parseCellKey(key);
          clearPositions.push(pos);
        }
        if (clearPositions.length > 0) {
          clearCellsOnSheet(pivotConfig.targetSheetId, clearPositions);
        }
      }

      // Switch to target sheet and write data
      setActiveSheet(pivotConfig.targetSheetId);
      const outputCells: Array<{ col: number; row: number; value: string }> = [];
      for (let r = 0; r < pivotResult.length; r++) {
        for (let c = 0; c < pivotResult[r].length; c++) {
          const cell = pivotResult[r][c];
          const val = typeof cell.value === 'number' ? String(cell.value) : cell.value;
          outputCells.push({ col: c, row: r, value: val });
        }
      }
      batchSetCellValues(outputCells);
    },
    [pivotTables, sheets, setActiveSheet, batchSetCellValues, clearCellsOnSheet],
  );

  // --- Function wizard: insert formula into current cell ---
  const handleInsertFormula = useCallback(
    (formula: string) => {
      setCellValue(activeCell.col, activeCell.row, formula);
    },
    [setCellValue, activeCell],
  );

  // --- Paste option handlers (paste special: values / format / transpose) ---
  const handlePasteValuesOnly = useCallback(() => {
    void handlePasteMode('values');
  }, [handlePasteMode]);

  const handlePasteFormatOnly = useCallback(() => {
    void handlePasteMode('format');
  }, [handlePasteMode]);

  const handlePasteTranspose = useCallback(() => {
    void handlePasteMode('transpose');
  }, [handlePasteMode]);

  // --- Column/Row operations ---
  const handleInsertColumn = useCallback(
    (colIndex: number, position: 'before' | 'after') => {
      const insertAt = position === 'before' ? colIndex : colIndex + 1;
      const success = gridInsertColumn(colIndex, position, colCount, MAX_COL_COUNT);
      if (success) {
        shiftColWidths(insertAt, 'insert');
        setColCount(colCount + 1);
      }
    },
    [gridInsertColumn, colCount, shiftColWidths, setColCount],
  );

  const handleDeleteColumn = useCallback(
    (colIndex: number) => {
      if (colCount <= 1) return;
      const success = gridDeleteColumn(colIndex);
      if (success) {
        shiftColWidths(colIndex, 'delete');
        setColCount(colCount - 1);
      }
    },
    [gridDeleteColumn, colCount, shiftColWidths, setColCount],
  );

  const handleInsertRow = useCallback(
    (rowIndex: number, position: 'before' | 'after') => {
      const insertAt = position === 'before' ? rowIndex : rowIndex + 1;
      const success = gridInsertRow(rowIndex, position, rowCount, MAX_ROW_COUNT);
      if (success) {
        shiftRowHeights(insertAt, 'insert');
        setRowCount(rowCount + 1);
      }
    },
    [gridInsertRow, rowCount, shiftRowHeights, setRowCount],
  );

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (rowCount <= 1) return;
      const success = gridDeleteRow(rowIndex);
      if (success) {
        shiftRowHeights(rowIndex, 'delete');
        setRowCount(rowCount - 1);
      }
    },
    [gridDeleteRow, rowCount, shiftRowHeights, setRowCount],
  );

  // Multi-column/row versions (header context menu, when the right-clicked header falls within
  // a whole-column/whole-row selection spanning more than one column/row).
  const handleInsertColumns = useCallback(
    (colIndex: number, count: number, position: 'before' | 'after') => {
      const insertAt = position === 'before' ? colIndex : colIndex + 1;
      const success = gridInsertColumns(insertAt, count, colCount, MAX_COL_COUNT);
      if (success) {
        for (let i = 0; i < count; i++) shiftColWidths(insertAt, 'insert');
        setColCount(colCount + count);
      }
    },
    [gridInsertColumns, colCount, shiftColWidths, setColCount],
  );

  const handleDeleteColumns = useCallback(
    (start: number, end: number) => {
      const count = end - start + 1;
      if (colCount - count < 1) return;
      const success = gridDeleteColumns(start, end);
      if (success) {
        for (let i = 0; i < count; i++) shiftColWidths(start, 'delete');
        setColCount(colCount - count);
      }
    },
    [gridDeleteColumns, colCount, shiftColWidths, setColCount],
  );

  const handleInsertRows = useCallback(
    (rowIndex: number, count: number, position: 'before' | 'after') => {
      const insertAt = position === 'before' ? rowIndex : rowIndex + 1;
      const success = gridInsertRows(insertAt, count, rowCount, MAX_ROW_COUNT);
      if (success) {
        for (let i = 0; i < count; i++) shiftRowHeights(insertAt, 'insert');
        setRowCount(rowCount + count);
      }
    },
    [gridInsertRows, rowCount, shiftRowHeights, setRowCount],
  );

  const handleDeleteRows = useCallback(
    (start: number, end: number) => {
      const count = end - start + 1;
      if (rowCount - count < 1) return;
      const success = gridDeleteRows(start, end);
      if (success) {
        for (let i = 0; i < count; i++) shiftRowHeights(start, 'delete');
        setRowCount(rowCount - count);
      }
    },
    [gridDeleteRows, rowCount, shiftRowHeights, setRowCount],
  );

  // --- Context Menu handlers ---
  // Resolve the row/col range a header right-click's insert/delete/hide actions apply to: the
  // current whole-column/whole-row selection if it covers the clicked header, else just that
  // single header.
  const resolveColContextRange = useCallback(
    (colIndex: number): { rangeStart: number; rangeEnd: number } => {
      if (selectionRange) {
        const minCol = Math.min(selectionRange.start.col, selectionRange.end.col);
        const maxCol = Math.max(selectionRange.start.col, selectionRange.end.col);
        const minRow = Math.min(selectionRange.start.row, selectionRange.end.row);
        const maxRow = Math.max(selectionRange.start.row, selectionRange.end.row);
        const isWholeColumnSelection = minRow === 0 && maxRow === rowCount - 1;
        if (isWholeColumnSelection && colIndex >= minCol && colIndex <= maxCol) {
          return { rangeStart: minCol, rangeEnd: maxCol };
        }
      }
      return { rangeStart: colIndex, rangeEnd: colIndex };
    },
    [selectionRange, rowCount],
  );

  const resolveRowContextRange = useCallback(
    (rowIndex: number): { rangeStart: number; rangeEnd: number } => {
      if (selectionRange) {
        const minCol = Math.min(selectionRange.start.col, selectionRange.end.col);
        const maxCol = Math.max(selectionRange.start.col, selectionRange.end.col);
        const minRow = Math.min(selectionRange.start.row, selectionRange.end.row);
        const maxRow = Math.max(selectionRange.start.row, selectionRange.end.row);
        const isWholeRowSelection = minCol === 0 && maxCol === colCount - 1;
        if (isWholeRowSelection && rowIndex >= minRow && rowIndex <= maxRow) {
          return { rangeStart: minRow, rangeEnd: maxRow };
        }
      }
      return { rangeStart: rowIndex, rangeEnd: rowIndex };
    },
    [selectionRange, colCount],
  );

  const handleColContextMenu = useCallback(
    (colIndex: number, x: number, y: number) => {
      const { rangeStart, rangeEnd } = resolveColContextRange(colIndex);
      setContextMenu({ type: 'column', index: colIndex, x, y, rangeStart, rangeEnd });
    },
    [resolveColContextRange],
  );

  const handleRowContextMenu = useCallback(
    (rowIndex: number, x: number, y: number) => {
      const { rangeStart, rangeEnd } = resolveRowContextRange(rowIndex);
      setContextMenu({ type: 'row', index: rowIndex, x, y, rangeStart, rangeEnd });
    },
    [resolveRowContextRange],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Hidden-boundary "unhide" indicator handlers (◂▸/▴▾ buttons on ColumnHeader/RowHeader),
  // unhiding the whole contiguous explicitly-hidden run adjacent to the given visible column/row.
  const unhideColRunBefore = useCallback(
    (beforeCol: number) => {
      let start = beforeCol;
      while (start - 1 >= 0 && hiddenColSet.has(start - 1)) start--;
      unhideCols(start, beforeCol);
    },
    [hiddenColSet, unhideCols],
  );

  const unhideColRunAfter = useCallback(
    (afterCol: number) => {
      let end = afterCol;
      while (end + 1 < colCount && hiddenColSet.has(end + 1)) end++;
      unhideCols(afterCol, end);
    },
    [hiddenColSet, unhideCols, colCount],
  );

  const unhideRowRunBefore = useCallback(
    (beforeRow: number) => {
      let start = beforeRow;
      while (start - 1 >= 0 && hiddenRowSet.has(start - 1)) start--;
      unhideRows(start, beforeRow);
    },
    [hiddenRowSet, unhideRows],
  );

  const unhideRowRunAfter = useCallback(
    (afterRow: number) => {
      let end = afterRow;
      while (end + 1 < rowCount && hiddenRowSet.has(end + 1)) end++;
      unhideRows(afterRow, end);
    },
    [hiddenRowSet, unhideRows, rowCount],
  );

  // --- Search & replace ---
  const [searchInitialFocus, setSearchInitialFocus] = useState<'search' | 'replace'>('search');
  const openSearch = useCallback((options?: { replace?: boolean }) => {
    setSearchInitialFocus(options?.replace ? 'replace' : 'search');
    setShowSearch(true);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
  }, []);

  const handleSearchNavigate = useCallback(
    (sheetId: string, pos: CellPosition) => {
      if (sheetId !== activeSheetId) setActiveSheet(sheetId);
      setActiveCell(pos);
    },
    [activeSheetId, setActiveSheet, setActiveCell],
  );

  const handleSearchReplaceOne = useCallback(
    (sheetId: string, col: number, row: number, newValue: string) => {
      if (sheetId === activeSheetId) {
        setCellValue(col, row, newValue);
      } else {
        batchSetCellValuesOnSheet(sheetId, [{ col, row, value: newValue }]);
      }
    },
    [activeSheetId, setCellValue, batchSetCellValuesOnSheet],
  );

  const handleSearchReplaceAll = useCallback(
    (bySheet: Map<string, Array<{ col: number; row: number; value: string }>>) => {
      transact(() => {
        for (const [sheetId, entries] of bySheet) {
          if (sheetId === activeSheetId) {
            batchSetCellValues(entries);
          } else {
            batchSetCellValuesOnSheet(sheetId, entries);
          }
        }
      });
    },
    [activeSheetId, transact, batchSetCellValues, batchSetCellValuesOnSheet],
  );

  // --- Fill Auto handlers ---
  const handleFillHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFillDragging(true);
    setFillDragTarget(null);
  }, []);

  // Compute cell position from mouse coordinates relative to scroll container.
  // Uses binary search over cumulative offsets when there are no hidden rows/cols
  // (filtered/collapsed), falling back to the O(n) scan otherwise.
  const noHiddenCols = collapsedCols.size === 0 && !explicitHiddenCols?.length;
  const noHiddenRows =
    hiddenRows.size === 0 && collapsedRows.size === 0 && !explicitHiddenRows?.length;
  const getCellFromPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      /** While dragging: clamp the pointer into the viewport and map frozen panes per clampDragPoint */
      drag?: { anchorCol: number; anchorRow: number },
    ): { col: number; row: number } | null => {
      const el = scrollContainerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // Inside the CSS-zoom wrapper, getBoundingClientRect/clientX are screen pixels but scrollLeft/scrollTop
      // are already in the (unzoomed) logical space that getColWidth/getRowHeight use (verified in Chrome):
      // only the pointer offset is divided by the zoom factor.
      let localX = (clientX - rect.left) / zoomFactor;
      let localY = (clientY - rect.top) / zoomFactor;

      // Frozen panes don't scroll: a point inside them maps to their cells without the scroll offset
      let frozenW = 0;
      for (let c = 0; c < frozenCols; c++) if (!isColHidden(c)) frozenW += getColWidth(c);
      let frozenH = 0;
      for (let r = 0; r < frozenRows; r++) if (!isRowHidden(r)) frozenH += getRowHeight(r);

      if (drag) {
        ({ x: localX, y: localY } = clampDragPoint({
          x: localX,
          y: localY,
          viewWidth: el.clientWidth,
          viewHeight: el.clientHeight,
          frozenWidth: frozenW,
          frozenHeight: frozenH,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          anchorInFrozenCols: drag.anchorCol < frozenCols,
          anchorInFrozenRows: drag.anchorRow < frozenRows,
        }));
      }
      const scrollX = localX < frozenW ? localX : localX + el.scrollLeft;
      const scrollY = localY < frozenH ? localY : localY + el.scrollTop;

      let col: number;
      if (noHiddenCols) {
        col = findIndexByOffset(scrollX, colCount, getColOffset);
      } else {
        let accX = 0;
        col = -1;
        for (let c = 0; c < colCount; c++) {
          if (isColHidden(c)) continue;
          accX += getColWidth(c);
          if (scrollX < accX) {
            col = c;
            break;
          }
        }
        if (col === -1) col = colCount - 1;
      }

      let row: number;
      if (noHiddenRows) {
        row = findIndexByOffset(scrollY, rowCount, getRowOffset);
      } else {
        let accY = 0;
        row = -1;
        for (let r = 0; r < rowCount; r++) {
          if (isRowHidden(r)) continue;
          accY += getRowHeight(r);
          if (scrollY < accY) {
            row = r;
            break;
          }
        }
        if (row === -1) row = rowCount - 1;
      }

      return { col, row };
    },
    [
      colCount,
      rowCount,
      getColWidth,
      getRowHeight,
      getColOffset,
      getRowOffset,
      noHiddenCols,
      noHiddenRows,
      zoomFactor,
      frozenCols,
      frozenRows,
      isColHidden,
      isRowHidden,
    ],
  );

  // Edge auto-scroll for drags (selection, fill handle, formula references, header ranges)
  const frozenSizeRef = useRef({ width: 0, height: 0 });
  const getFrozenSize = useCallback(() => frozenSizeRef.current, []);
  const dragAutoScroll = useDragAutoScroll({ scrollContainerRef, zoomFactor, getFrozenSize });

  interface FillSourceRange {
    startCol: number;
    endCol: number;
    startRow: number;
    endRow: number;
  }

  // Fill values (+ formulas, + styles) from a source range outward in one of 4 directions.
  const applyFill = useCallback(
    (
      source: FillSourceRange,
      target: { col: number; row: number },
      direction: 'down' | 'up' | 'right' | 'left',
    ) => {
      const { startCol, endCol, startRow, endRow } = source;
      const entries: Array<{ col: number; row: number; value: string }> = [];
      const styleEntries: Array<{ col: number; row: number; style: CellStyle }> = [];

      if (direction === 'down' || direction === 'up') {
        const forward = direction === 'down';
        const fillCount = forward ? target.row - endRow : startRow - target.row;
        const sourceLen = endRow - startRow + 1;
        for (let c = startCol; c <= endCol; c++) {
          const sourceValues: string[] = [];
          const sourceStyles: Array<CellStyle | undefined> = [];
          for (let r = startRow; r <= endRow; r++) {
            const cd = getCellData(c, r);
            sourceValues.push(cd?.rawValue ?? '');
            sourceStyles.push(cd?.style);
          }
          const ordered = forward ? sourceValues : [...sourceValues].reverse();
          const orderedStyles = forward ? sourceStyles : [...sourceStyles].reverse();
          const hasFormula = sourceValues.some((v) => v.startsWith('='));
          const generated = hasFormula
            ? null
            : generateFillValues(detectFillPattern(ordered), fillCount);
          for (let i = 0; i < fillCount; i++) {
            const targetRow = forward ? endRow + 1 + i : startRow - 1 - i;
            const srcIdx = i % sourceLen;
            let value: string;
            if (hasFormula) {
              const srcValue = ordered[srcIdx];
              const srcRow = forward ? startRow + srcIdx : endRow - srcIdx;
              value = srcValue.startsWith('=')
                ? '=' + shiftFormula(srcValue.slice(1), 0, targetRow - srcRow)
                : srcValue;
            } else {
              value = generated![i];
            }
            entries.push({ col: c, row: targetRow, value });
            const style = orderedStyles[srcIdx];
            if (style) styleEntries.push({ col: c, row: targetRow, style });
          }
        }
      } else {
        const forward = direction === 'right';
        const fillCount = forward ? target.col - endCol : startCol - target.col;
        const sourceLen = endCol - startCol + 1;
        for (let r = startRow; r <= endRow; r++) {
          const sourceValues: string[] = [];
          const sourceStyles: Array<CellStyle | undefined> = [];
          for (let c = startCol; c <= endCol; c++) {
            const cd = getCellData(c, r);
            sourceValues.push(cd?.rawValue ?? '');
            sourceStyles.push(cd?.style);
          }
          const ordered = forward ? sourceValues : [...sourceValues].reverse();
          const orderedStyles = forward ? sourceStyles : [...sourceStyles].reverse();
          const hasFormula = sourceValues.some((v) => v.startsWith('='));
          const generated = hasFormula
            ? null
            : generateFillValues(detectFillPattern(ordered), fillCount);
          for (let i = 0; i < fillCount; i++) {
            const targetCol = forward ? endCol + 1 + i : startCol - 1 - i;
            const srcIdx = i % sourceLen;
            let value: string;
            if (hasFormula) {
              const srcValue = ordered[srcIdx];
              const srcCol = forward ? startCol + srcIdx : endCol - srcIdx;
              value = srcValue.startsWith('=')
                ? '=' + shiftFormula(srcValue.slice(1), targetCol - srcCol, 0)
                : srcValue;
            } else {
              value = generated![i];
            }
            entries.push({ col: targetCol, row: r, value });
            const style = orderedStyles[srcIdx];
            if (style) styleEntries.push({ col: targetCol, row: r, style });
          }
        }
      }

      transact(() => {
        if (entries.length > 0) {
          batchSetCellValues(entries);
        }

        if (styleEntries.length > 0) {
          // Group identical styles together to minimize setCellStyle calls (and undo entries)
          const groups = new Map<string, { style: CellStyle; positions: CellPosition[] }>();
          for (const { col, row, style } of styleEntries) {
            const styleGroupKey = JSON.stringify(style);
            const group = groups.get(styleGroupKey);
            if (group) {
              group.positions.push({ col, row });
            } else {
              groups.set(styleGroupKey, { style, positions: [{ col, row }] });
            }
          }
          for (const { style, positions } of groups.values()) {
            setCellStyle(positions, style);
          }
        }
      });
    },
    [getCellData, batchSetCellValues, setCellStyle, transact],
  );

  // useEffect required: global mouse listeners for fill-handle drag
  useEffect(() => {
    if (!isFillDragging) return;

    // Only re-render when the target cell actually changes (mousemove fires many times per cell)
    const setFillTargetIfChanged = (next: { col: number; row: number } | null) =>
      setFillDragTarget((prev) => {
        if (prev === next) return prev;
        if (prev && next && prev.col === next.col && prev.row === next.row) return prev;
        return next;
      });

    const srcStartCol = selectionRange
      ? Math.min(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const srcStartRow = selectionRange
      ? Math.min(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;

    const updateFillTarget = () => {
      const point = fillPointRef.current;
      if (!point) return;
      const pos = getCellFromPoint(point.x, point.y, {
        anchorCol: srcStartCol,
        anchorRow: srcStartRow,
      });
      if (!pos) return;

      const startCol = srcStartCol;
      const endCol = selectionRange
        ? Math.max(selectionRange.start.col, selectionRange.end.col)
        : activeCell.col;
      const startRow = srcStartRow;
      const endRow = selectionRange
        ? Math.max(selectionRange.start.row, selectionRange.end.row)
        : activeCell.row;

      // Allow fill down/up/right/left from the source range
      if (pos.row > endRow && pos.col >= startCol && pos.col <= endCol) {
        setFillTargetIfChanged({ col: endCol, row: pos.row }); // down
      } else if (pos.row < startRow && pos.col >= startCol && pos.col <= endCol) {
        setFillTargetIfChanged({ col: startCol, row: pos.row }); // up
      } else if (pos.col > endCol && pos.row >= startRow && pos.row <= endRow) {
        setFillTargetIfChanged({ col: pos.col, row: endRow }); // right
      } else if (pos.col < startCol && pos.row >= startRow && pos.row <= endRow) {
        setFillTargetIfChanged({ col: pos.col, row: startRow }); // left
      } else {
        setFillTargetIfChanged(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      fillPointRef.current = { x: e.clientX, y: e.clientY };
      dragAutoScroll.track(e.clientX, e.clientY, {
        axis: 'both',
        anchorInFrozenCols: srcStartCol < frozenCols,
        anchorInFrozenRows: srcStartRow < frozenRows,
        onScrolled: updateFillTarget,
      });
      updateFillTarget();
    };

    const handleMouseUp = () => {
      dragAutoScroll.stop();
      fillPointRef.current = null;
      if (fillDragTarget) {
        const startCol = selectionRange
          ? Math.min(selectionRange.start.col, selectionRange.end.col)
          : activeCell.col;
        const endCol = selectionRange
          ? Math.max(selectionRange.start.col, selectionRange.end.col)
          : activeCell.col;
        const startRow = selectionRange
          ? Math.min(selectionRange.start.row, selectionRange.end.row)
          : activeCell.row;
        const endRow = selectionRange
          ? Math.max(selectionRange.start.row, selectionRange.end.row)
          : activeCell.row;
        const source: FillSourceRange = { startCol, endCol, startRow, endRow };

        if (fillDragTarget.row > endRow) applyFill(source, fillDragTarget, 'down');
        else if (fillDragTarget.row < startRow) applyFill(source, fillDragTarget, 'up');
        else if (fillDragTarget.col > endCol) applyFill(source, fillDragTarget, 'right');
        else if (fillDragTarget.col < startCol) applyFill(source, fillDragTarget, 'left');
      }

      setIsFillDragging(false);
      setFillDragTarget(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isFillDragging,
    fillDragTarget,
    activeCell,
    selectionRange,
    getCellFromPoint,
    applyFill,
    dragAutoScroll,
    frozenCols,
    frozenRows,
  ]);

  // Fill-handle double-click: fill down to match the extent of the adjacent column's data
  const handleFillHandleDoubleClick = useCallback(() => {
    const startCol = selectionRange
      ? Math.min(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const endCol = selectionRange
      ? Math.max(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const startRow = selectionRange
      ? Math.min(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;
    const endRow = selectionRange
      ? Math.max(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;

    const adjacentCol = startCol > 0 ? startCol - 1 : endCol + 1;
    if (adjacentCol < 0 || adjacentCol >= colCount) return;

    const hasAdjacentValue = (r: number) => (getCellData(adjacentCol, r)?.rawValue ?? '') !== '';
    if (!hasAdjacentValue(endRow + 1)) return;

    let targetRow = endRow + 1;
    while (targetRow + 1 < rowCount && hasAdjacentValue(targetRow + 1)) {
      targetRow++;
    }

    applyFill({ startCol, endCol, startRow, endRow }, { col: endCol, row: targetRow }, 'down');
  }, [selectionRange, activeCell, colCount, rowCount, getCellData, applyFill]);

  // Compute fill handle position (bottom-right corner of the selection/active cell)
  const fillHandleInfo = useMemo(() => {
    const endCol = selectionRange
      ? Math.max(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const endRow = selectionRange
      ? Math.max(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;

    // Check if active cell (or any cell in selection) has value
    let hasValue = false;
    const sc = selectionRange
      ? Math.min(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const sr = selectionRange
      ? Math.min(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;
    for (let r = sr; r <= endRow && !hasValue; r++) {
      for (let c = sc; c <= endCol && !hasValue; c++) {
        const cell = getCellData(c, r);
        if (cell && cell.rawValue !== '') hasValue = true;
      }
    }

    if (!hasValue) return null;

    // Calculate pixel position
    let left = 0;
    for (let c = 0; c <= endCol; c++) left += visibleColWidth(c);
    let top = 0;
    for (let r = 0; r <= endRow; r++) top += visibleRowHeight(r);

    return { left: left - 3, top: top - 3, endCol, endRow };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell, selectionRange, getCellData, visibleColWidth, visibleRowHeight, version]);

  // Compute fill preview range for highlight (any of the 4 directions)
  const fillPreviewRange = useMemo(() => {
    if (!isFillDragging || !fillDragTarget) return null;
    const startCol = selectionRange
      ? Math.min(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const endCol = selectionRange
      ? Math.max(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const startRow = selectionRange
      ? Math.min(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;
    const endRow = selectionRange
      ? Math.max(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;

    if (fillDragTarget.row > endRow) {
      return { startCol, startRow: endRow + 1, endCol, endRow: fillDragTarget.row };
    } else if (fillDragTarget.row < startRow) {
      return { startCol, startRow: fillDragTarget.row, endCol, endRow: startRow - 1 };
    } else if (fillDragTarget.col > endCol) {
      return { startCol: endCol + 1, startRow, endCol: fillDragTarget.col, endRow };
    } else if (fillDragTarget.col < startCol) {
      return { startCol: fillDragTarget.col, startRow, endCol: startCol - 1, endRow };
    }
    return null;
  }, [isFillDragging, fillDragTarget, activeCell, selectionRange]);

  // Reset filter dropdown UI on sheet switch (render-time state adjustment)
  const [prevActiveSheetId, setPrevActiveSheetId] = useState(activeSheetId);
  if (prevActiveSheetId !== activeSheetId) {
    setPrevActiveSheetId(activeSheetId);
    setFilterDropdownCol(null);
  }

  // --- Sheet operations ---
  const handleSheetSelect = useCallback(
    (sheetId: string) => {
      if (isEditing) {
        setCellValue(activeCell.col, activeCell.row, editValue);
        setIsEditing(false);
        setEditValue('');
      }
      setActiveSheet(sheetId);
    },
    [isEditing, editValue, activeCell, setCellValue, setActiveSheet],
  );

  // --- Developer tools ---
  const closeDevTools = useCallback(() => {
    setShowDevTools(false);
    // Nothing keeps measuring once the tools are closed
    setRecalcHeatmap(false);
    recalcProfiler.setEnabled(false);
  }, []);
  const heatmapRectFor = useCallback(
    (col: number, row: number) =>
      getRangePixelRect(col, col, row, row, visibleColWidth, visibleRowHeight),
    [visibleColWidth, visibleRowHeight],
  );
  const devToolsHost = useMemo<DevToolsHost>(
    () => ({
      version,
      sheets,
      activeSheetId,
      activeCell,
      isEditing,
      editValue,
      getCell: (sheetId, key) => sheets.find((sh) => sh.id === sheetId)?.cells.get(key),
      selectRange: (r) => {
        selectRange({
          start: { col: r.startCol, row: r.startRow },
          end: { col: r.endCol, row: r.endRow },
        });
        focusGrid();
      },
      goToCell: (sheetId, col, row) => {
        if (sheetId !== activeSheetId) handleSheetSelect(sheetId);
        // After a sheet switch has rendered, select the cell there
        requestAnimationFrame(() => {
          setActiveCell({ col, row });
          focusGrid();
        });
      },
      getDependencyInfo,
      historyTimeline,
      jumpToHistory,
      getHistorySnapshot,
      heatmap: recalcHeatmap,
      setHeatmap: setRecalcHeatmap,
      autosave: { status: saveStatus, lastSavedAt, serialize: serializeForAutosave },
    }),
    [
      version,
      sheets,
      activeSheetId,
      activeCell,
      isEditing,
      editValue,
      selectRange,
      focusGrid,
      handleSheetSelect,
      setActiveCell,
      getDependencyInfo,
      historyTimeline,
      jumpToHistory,
      getHistorySnapshot,
      recalcHeatmap,
      saveStatus,
      lastSavedAt,
      serializeForAutosave,
    ],
  );

  const handleDeleteSheet = useCallback(
    (sheetId: string) => {
      deleteSheet(sheetId);
    },
    [deleteSheet],
  );

  const handleRenameSheet = useCallback(
    (sheetId: string, newName: string) => {
      renameSheet(sheetId, newName);
    },
    [renameSheet],
  );

  // Duplicating a sheet also needs to copy its column widths/row heights (per-sheet sizes
  // otherwise default to nothing for the new sheet id).
  const handleDuplicateSheet = useCallback(
    (sheetId: string) => {
      const newId = duplicateSheet(sheetId);
      if (newId) copySheetSizes(sheetId, newId);
    },
    [duplicateSheet, copySheetSizes],
  );

  // Ctrl/Cmd+\: clear all formatting from the selection (values/formulas are untouched).
  // Also exposed via SpreadsheetActions for the 書式 menu (MenuBar).
  const handleClearFormatting = useCallback(() => {
    const positions = getSelectedPositions();
    setCellStyle(positions, EMPTY_CELL_STYLE);
  }, [getSelectedPositions, setCellStyle]);

  // Also exposed via SpreadsheetActions for the 書式 menu (MenuBar).
  const handleToggleStrikethrough = useCallback(() => {
    const current = getCellData(activeCell.col, activeCell.row)?.style?.strikethrough ?? false;
    handleSetCellStyle({ strikethrough: !current });
  }, [activeCell, getCellData, handleSetCellStyle]);

  // 挿入 > チェックボックス: apply immediately to the current selection.
  const handleInsertCheckbox = useCallback(() => {
    setValidationRule(getSelectedPositions(), { type: 'checkbox' });
  }, [getSelectedPositions, setValidationRule]);

  // 挿入 > プルダウン: open the data validation panel straight into the プルダウン edit form.
  const handleInsertDropdown = useCallback(() => {
    setValidationPanelNewOnOpen(true);
    setSidePanel('validation');
  }, []);

  // --- SpreadsheetContext actions ---
  const spreadsheetActions: SpreadsheetActions = useMemo(
    () => ({
      importFile: handleImportFile,
      exportCSV: handleExportCSV,
      exportJSON: handleExportJSON,
      exportXLSX: handleExportXLSX,
      undo,
      redo,
      canUndo,
      canRedo,
      copy: handleCopy,
      cut: handleCut,
      paste: handlePaste,
      setCellStyle: handleSetCellStyle,
      activeCellStyle,
      toggleStrikethrough: handleToggleStrikethrough,
      clearFormatting: handleClearFormatting,
      insertColumn: handleInsertColumn,
      deleteColumn: handleDeleteColumn,
      insertRow: handleInsertRow,
      deleteRow: handleDeleteRow,
      hideRows,
      unhideRows,
      hideCols,
      unhideCols,
      colCount,
      rowCount,
      sheets,
      activeSheetId,
      addSheet,
      deleteSheet,
      renameSheet,
      setActiveSheet,
      duplicateSheet,
      openSearch,
      frozenRows,
      frozenCols,
      setFrozenRows,
      setFrozenCols,
      conditionalFormatRules,
      addConditionalFormatRule,
      updateConditionalFormatRule,
      deleteConditionalFormatRule,
      openConditionalFormatDialog: () => setSidePanel('conditionalFormat'),
      saveTabula: handleSaveTabula,
      openTabula: handleOpenTabula,
      // Cell merge
      mergeCells: handleMergeCells,
      unmergeCells: handleUnmergeCells,
      canMerge,
      isMerged,
      getMergeInfo,
      // Cell comments
      setCellComment,
      // Data validation
      setValidationRule,
      openValidationDialog: () => {
        setValidationPanelNewOnOpen(false);
        setSidePanel('validation');
      },
      insertCheckbox: handleInsertCheckbox,
      insertDropdown: handleInsertDropdown,
      // Charts
      charts: getCharts(),
      addChart,
      updateChart,
      deleteChart,
      openChartDialog: handleInsertChart,
      // Active cell
      activeCell,
      // Paste options
      pasteValuesOnly: handlePasteValuesOnly,
      pasteFormatOnly: handlePasteFormatOnly,
      pasteTranspose: handlePasteTranspose,
      // Named ranges
      namedRanges,
      addNamedRange,
      updateNamedRange,
      deleteNamedRange,
      openNamedRangeDialog: () => setShowNamedRangeDialog(true),
      // Sparklines
      sparklines: getSparklines(),
      addSparkline,
      updateSparkline,
      deleteSparkline,
      openSparklineDialog: () => setShowSparklineDialog(true),
      // Grouping
      rowGroups: getActiveSheet().rowGroups ?? [],
      colGroups: getActiveSheet().colGroups ?? [],
      addRowGroup,
      addColGroup,
      removeRowGroup,
      removeColGroup,
      toggleRowGroupCollapse,
      toggleColGroupCollapse,
      setRowExpandLevel,
      setColExpandLevel,
      // Pivot tables
      pivotTables,
      addPivotTable,
      updatePivotTable,
      deletePivotTable,
      openPivotTableDialog: () => setShowPivotTableDialog(true),
      refreshPivotTable: handleRefreshPivotTable,
      // Function wizard
      openFunctionWizard: () => setShowFunctionWizard(true),
      evaluateFormula: evaluateFormulaFn,
      // Print preview
      openPrintPreview: () => setShowPrintPreview(true),
      exportPDF: async (pdfSettings) => {
        const { generatePDF } = await import('../../print/pdfGenerator');
        await generatePDF({
          settings: pdfSettings,
          getCellData,
          colWidths: getColWidth,
          rowHeights: getRowHeight,
          dataRange: { startCol: 0, endCol: colCount - 1, startRow: 0, endRow: rowCount - 1 },
          sheetName: activeSheet.name,
          documentTitle: title,
        });
      },
      // データ: 並べ替え・フィルタ・データクリーンアップ
      openSortRangeDialog: () => setShowSortRangeDialog(true),
      sortActiveColumn: (ascending: boolean) => sortSheetByColumn(activeCell.col, ascending),
      filterRange,
      toggleFilter: handleToggleFilter,
      openRemoveDuplicatesDialog: () => setShowRemoveDuplicatesDialog(true),
      trimWhitespace: handleTrimWhitespace,
      splitTextToColumnsAction: handleSplitTextToColumnsAction,
      // ヘルプ
      openShortcutsDialog: () => setShowShortcutsDialog(true),
      openDevTools: () => setShowDevTools(true),
      // ファイル: 新規作成
      newWorkbook: handleNewWorkbook,
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `version` is needed: charts/sparklines/rowGroups are read from refs
    [
      version,
      handleImportFile,
      handleExportCSV,
      handleExportJSON,
      handleExportXLSX,
      undo,
      redo,
      canUndo,
      canRedo,
      handleCopy,
      handleCut,
      handlePaste,
      handleSetCellStyle,
      activeCellStyle,
      handleToggleStrikethrough,
      handleClearFormatting,
      handleInsertColumn,
      handleDeleteColumn,
      handleInsertRow,
      handleDeleteRow,
      hideRows,
      unhideRows,
      hideCols,
      unhideCols,
      colCount,
      rowCount,
      sheets,
      activeSheetId,
      addSheet,
      deleteSheet,
      renameSheet,
      setActiveSheet,
      duplicateSheet,
      openSearch,
      frozenRows,
      frozenCols,
      setFrozenRows,
      setFrozenCols,
      conditionalFormatRules,
      addConditionalFormatRule,
      updateConditionalFormatRule,
      deleteConditionalFormatRule,
      handleSaveTabula,
      handleOpenTabula,
      handleMergeCells,
      handleUnmergeCells,
      canMerge,
      isMerged,
      getMergeInfo,
      setCellComment,
      setValidationRule,
      handleInsertCheckbox,
      handleInsertDropdown,
      getCharts,
      addChart,
      updateChart,
      deleteChart,
      handleInsertChart,
      activeCell,
      handlePasteValuesOnly,
      handlePasteFormatOnly,
      handlePasteTranspose,
      namedRanges,
      addNamedRange,
      updateNamedRange,
      deleteNamedRange,
      getSparklines,
      addSparkline,
      updateSparkline,
      deleteSparkline,
      getActiveSheet,
      addRowGroup,
      addColGroup,
      removeRowGroup,
      removeColGroup,
      toggleRowGroupCollapse,
      toggleColGroupCollapse,
      setRowExpandLevel,
      setColExpandLevel,
      pivotTables,
      addPivotTable,
      updatePivotTable,
      deletePivotTable,
      handleRefreshPivotTable,
      evaluateFormulaFn,
      sortSheetByColumn,
      filterRange,
      handleToggleFilter,
      handleTrimWhitespace,
      handleSplitTextToColumnsAction,
      handleNewWorkbook,
      title,
      activeSheet.name,
      getCellData,
      getColWidth,
      getRowHeight,
    ],
  );

  // Virtual row virtualizer (dynamic sizes, using visible rows for filter)
  const rowVirtualizer = useVirtualizer({
    count: visibleRowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => getRowHeight(visibleRowIndices[index]),
    overscan: OVERSCAN_COUNT,
  });

  // Visible column indices (for virtualizer, considering grouping + sheet-level hidden columns)
  const visibleColIndices = useMemo((): number[] => {
    const indices: number[] = [];
    for (let c = 0; c < colCount; c++) {
      if (!collapsedCols.has(c) && !hiddenColSet.has(c)) {
        indices.push(c);
      }
    }
    return indices;
  }, [colCount, collapsedCols, hiddenColSet]);

  // Visible col index set, for O(1) "is this col visible" checks (keyboard navigation).
  const visibleColIndexSet = useMemo(() => new Set(visibleColIndices), [visibleColIndices]);

  // Virtual column virtualizer (dynamic sizes)
  const colVirtualizer = useVirtualizer({
    count: visibleColIndices.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => getColWidth(visibleColIndices[index]),
    overscan: OVERSCAN_COUNT,
    horizontal: true,
  });

  // useEffect required: re-measures virtualizer after column/row size changes
  const colVirtualizerRef = useRef(colVirtualizer);
  colVirtualizerRef.current = colVirtualizer;
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  useEffect(() => {
    colVirtualizerRef.current.measure();
    rowVirtualizerRef.current.measure();
  }, [sizeVersion]);

  // Sync scroll position for headers and frozen regions using refs (no setState, direct DOM update)
  // Also auto-expand grid when scrolling near edges (infinite scroll)
  const scrollRafRef = useRef<number>(0);
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      if (colHeaderRef.current) {
        colHeaderRef.current.style.transform = `translateX(-${el.scrollLeft}px)`;
      }
      if (rowHeaderRef.current) {
        rowHeaderRef.current.style.transform = `translateY(-${el.scrollTop}px)`;
      }
      // Frozen panes are position: sticky inside the scroll container, so they need no syncing here

      // Auto-expand grid when near scroll edges
      const edgeThreshold = 200;
      if (el.scrollTop + el.clientHeight > el.scrollHeight - edgeThreshold) {
        const currentRows = getRowCount();
        if (currentRows < MAX_ROW_COUNT) {
          setRowCount(Math.min(currentRows + AUTO_EXPAND_ROWS, MAX_ROW_COUNT));
        }
      }
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - edgeThreshold) {
        const currentCols = getColCount();
        if (currentCols < MAX_COL_COUNT) {
          setColCount(Math.min(currentCols + AUTO_EXPAND_COLS, MAX_COL_COUNT));
        }
      }
    });
  }, [getRowCount, getColCount, setRowCount, setColCount]);

  // useEffect required: keeps the persistent cell editor textarea focused (including on
  // mount) as the active cell changes in navigation mode — it, not the scroll container, is
  // the grid's keyboard focus target.
  useEffect(() => {
    if (!isEditing) focusGrid();
  }, [activeCell, isEditing, focusGrid]);

  // Measurement inputs for the auto-scroll effect, read through a ref so the effect only fires when the
  // active cell moves (or editing ends) — not on every data/size change, which would yank the viewport
  // back to the active cell while the user is scrolling (e.g. when rows auto-expand near the bottom).
  const autoScrollMeasureRef = useRef({
    getColWidth,
    getRowHeight,
    getColOffset,
    getRowOffset,
    visibleColWidth,
    visibleRowHeight,
    noHiddenCols,
    noHiddenRows,
  });
  autoScrollMeasureRef.current = {
    getColWidth,
    getRowHeight,
    getColOffset,
    getRowOffset,
    visibleColWidth,
    visibleRowHeight,
    noHiddenCols,
    noHiddenRows,
  };

  // useEffect required: auto-scrolls viewport to keep active cell visible
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || isEditing) return;
    const {
      getColWidth,
      getRowHeight,
      getColOffset,
      getRowOffset,
      visibleColWidth,
      visibleRowHeight,
      noHiddenCols,
      noHiddenRows,
    } = autoScrollMeasureRef.current;

    // Calculate cumulative position using dynamic sizes (binary search when nothing is hidden)
    let cellLeft: number;
    if (noHiddenCols) {
      cellLeft = getColOffset(activeCell.col);
    } else {
      cellLeft = 0;
      for (let c = 0; c < activeCell.col; c++) cellLeft += visibleColWidth(c);
    }
    let cellTop: number;
    if (noHiddenRows) {
      cellTop = getRowOffset(activeCell.row);
    } else {
      cellTop = 0;
      for (let r = 0; r < activeCell.row; r++) cellTop += visibleRowHeight(r);
    }
    const cellRight = cellLeft + getColWidth(activeCell.col);
    const cellBottom = cellTop + getRowHeight(activeCell.row);

    const viewLeft = el.scrollLeft;
    const viewTop = el.scrollTop;
    const viewRight = viewLeft + el.clientWidth;
    const viewBottom = viewTop + el.clientHeight;

    let newScrollLeft = el.scrollLeft;
    let newScrollTop = el.scrollTop;

    if (cellLeft < viewLeft) {
      newScrollLeft = cellLeft;
    } else if (cellRight > viewRight) {
      newScrollLeft = cellRight - el.clientWidth;
    }

    if (cellTop < viewTop) {
      newScrollTop = cellTop;
    } else if (cellBottom > viewBottom) {
      newScrollTop = cellBottom - el.clientHeight;
    }

    if (newScrollLeft !== el.scrollLeft || newScrollTop !== el.scrollTop) {
      el.scrollTo(newScrollLeft, newScrollTop);
    }
  }, [activeCell, isEditing]);

  // Commit the current edit (direction is where the active cell moves to afterward)
  const commitEdit = useCallback(
    (direction: ConfirmDirection) => {
      if (!isEditing) return;

      // Data validation: a "reject invalid input" rule blocks the commit and keeps editing.
      const rule = getCellData(activeCell.col, activeCell.row)?.validation;
      if (rule?.rejectInvalid) {
        const result = validateInput(rule, editValue, activeCell, validationCtx);
        if (!result.valid) {
          showToast(result.message ?? '入力値が無効です', 'error');
          return;
        }
      }

      const editedRow = activeCell.row;
      setCellValue(activeCell.col, activeCell.row, editValue);
      setIsEditing(false);
      setEditValue('');
      lastCellRefInsertRef.current = null;

      requestAnimationFrame(() => autoResizeRows(new Set([editedRow])));

      // Auto-expand the grid if moving forward past the current boundary
      let currentColCount = colCount;
      let currentRowCount = rowCount;
      if (direction === 'down' && activeCell.row >= rowCount - 1 && rowCount < MAX_ROW_COUNT) {
        currentRowCount = Math.min(rowCount + AUTO_EXPAND_ROWS, MAX_ROW_COUNT);
        setRowCount(currentRowCount);
      }
      if (direction === 'right' && activeCell.col >= colCount - 1 && colCount < MAX_COL_COUNT) {
        currentColCount = Math.min(colCount + AUTO_EXPAND_COLS, MAX_COL_COUNT);
        setColCount(currentColCount);
      }
      const delta: Record<ConfirmDirection, [number, number]> = {
        down: [0, 1],
        up: [0, -1],
        right: [1, 0],
        left: [-1, 0],
      };
      const [dCol, dRow] = delta[direction];
      // moveActiveCell clamps to >= 0, so 'up'/'left' naturally stop at row/col 0
      moveActiveCell(dCol, dRow, false, currentColCount, currentRowCount);
      focusGrid();
    },
    [
      isEditing,
      editValue,
      activeCell,
      setCellValue,
      moveActiveCell,
      colCount,
      rowCount,
      setColCount,
      setRowCount,
      autoResizeRows,
      focusGrid,
      getCellData,
      validationCtx,
      showToast,
    ],
  );

  // Apply the current edit value to every cell in the selection (Ctrl/Cmd+Enter).
  // Unlike commitEdit, the active cell never moves afterward (with or without a range).
  const commitEditFillSelection = useCallback(() => {
    if (!isEditing) return;
    const positions = getSelectedPositions();
    const entries = positions.map((pos) => {
      if (editValue.startsWith('=')) {
        const shifted = shiftFormula(
          editValue.slice(1),
          pos.col - activeCell.col,
          pos.row - activeCell.row,
        );
        return { col: pos.col, row: pos.row, value: '=' + shifted };
      }
      return { col: pos.col, row: pos.row, value: editValue };
    });

    // Data validation: abort the whole batch if any target cell has a "reject invalid input"
    // rule the value doesn't satisfy.
    for (const entry of entries) {
      const rule = getCellData(entry.col, entry.row)?.validation;
      if (!rule?.rejectInvalid) continue;
      const result = validateInput(
        rule,
        entry.value,
        { col: entry.col, row: entry.row },
        validationCtx,
      );
      if (!result.valid) {
        showToast(result.message ?? '入力値が無効です', 'error');
        return;
      }
    }

    batchSetCellValues(entries);
    setIsEditing(false);
    setEditValue('');
    lastCellRefInsertRef.current = null;
    requestAnimationFrame(() => autoResizeRows(new Set(positions.map((p) => p.row))));
    focusGrid();
  }, [
    isEditing,
    editValue,
    activeCell,
    getSelectedPositions,
    batchSetCellValues,
    autoResizeRows,
    focusGrid,
    getCellData,
    validationCtx,
    showToast,
  ]);

  // Insert a newline at the caret position in the cell editor (Alt+Enter)
  const insertNewlineInEdit = useCallback(() => {
    const input = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const start = input?.selectionStart ?? editValueRef.current.length;
    const end = input?.selectionEnd ?? start;
    const current = editValueRef.current;
    const newValue = current.slice(0, start) + '\n' + current.slice(end);
    setEditValue(newValue);
    const newCursorPos = start + 1;
    requestAnimationFrame(() => {
      if (input && 'setSelectionRange' in input) {
        input.focus();
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, []);

  // Cancel editing (does not touch clipboard marquee state — see handleEscape for that)
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
    lastCellRefInsertRef.current = null;
    focusGrid();
  }, [focusGrid]);

  // Escape in navigation mode: cancel the format painter, or the copy/cut clipboard marquee
  const handleEscape = useCallback(() => {
    if (formatPainter) {
      setFormatPainter(null);
      return;
    }
    cancelClipboard();
  }, [formatPainter, cancelClipboard]);

  // Start editing
  const startEditing = useCallback(() => {
    const data = getCellData(activeCellRef.current.col, activeCellRef.current.row);
    const val = data?.rawValue ?? '';
    setEditValue(val);
    setEditMode('edit');
    setIsEditing(true);
    // Like Excel, editing a cell dismisses the copy/cut marquee
    cancelClipboard();
  }, [getCellData, cancelClipboard]);

  // Start editing with a direct character input
  const startDirectInput = useCallback(
    (char: string) => {
      setEditValue(char);
      setEditMode('enter');
      setIsEditing(true);
      cancelClipboard();
    },
    [cancelClipboard],
  );

  // Checkbox validation: toggle a cell's rawValue between its checked/unchecked values.
  const handleCheckboxToggle = useCallback(
    (col: number, row: number) => {
      const rule = getCellData(col, row)?.validation;
      if (!rule || rule.type !== 'checkbox') return;
      const rawValue = getCellData(col, row)?.rawValue ?? '';
      setCellValue(col, row, toggleCheckboxValue(rule, rawValue));
    },
    [getCellData, setCellValue],
  );

  // Plain Space in navigation mode: toggle the active cell's checkbox, if it has one.
  const handleSpaceToggle = useCallback((): boolean => {
    const rule = getCellData(activeCell.col, activeCell.row)?.validation;
    if (!rule || rule.type !== 'checkbox') return false;
    handleCheckboxToggle(activeCell.col, activeCell.row);
    return true;
  }, [activeCell, getCellData, handleCheckboxToggle]);

  // List-type validation: open the ValidationDropdown positioned against a cell's rect.
  const handleDropdownOpen = useCallback((col: number, row: number, rect: DOMRect) => {
    setValidationDropdown({ col, row, rect });
  }, []);

  // Alt+ArrowDown in navigation mode: open the active cell's dropdown, if it has one.
  const handleAltArrowDownOpen = useCallback((): boolean => {
    const rule = getCellData(activeCell.col, activeCell.row)?.validation;
    if (!rule || rule.type !== 'list' || !(rule.showDropdown ?? true)) return false;
    const el = document.querySelector(
      `[data-col="${activeCell.col}"][data-row="${activeCell.row}"]`,
    );
    if (!el) return false;
    setValidationDropdown({
      col: activeCell.col,
      row: activeCell.row,
      rect: el.getBoundingClientRect(),
    });
    return true;
  }, [activeCell, getCellData]);

  // Selecting an option in the ValidationDropdown commits it to the target cell.
  const handleDropdownSelect = useCallback(
    (value: string) => {
      if (!validationDropdown) return;
      setCellValue(validationDropdown.col, validationDropdown.row, value);
      setValidationDropdown(null);
      focusGrid();
    },
    [validationDropdown, setCellValue, focusGrid],
  );

  const handleDropdownClose = useCallback(() => {
    setValidationDropdown(null);
  }, []);

  // Handle cell mouse down
  const handleCellMouseDown = useCallback(
    (col: number, row: number, shiftKey: boolean) => {
      const { col: targetCol, row: targetRow } = resolveMergeAnchor(col, row, getMergeInfo);

      // When editing a formula (starts with =), clicking another cell inserts a cell reference
      if (isEditingRef.current && editValueRef.current.startsWith('=')) {
        // Clicking the cell being edited — let browser handle cursor placement natively
        if (targetCol === activeCellRef.current.col && targetRow === activeCellRef.current.row) {
          return;
        }

        const activeInput = document.activeElement as HTMLInputElement | null;
        const currentValue = editValueRef.current;

        // If the last action was also a cell-click insertion, replace that reference
        const prev = lastCellRefInsertRef.current;
        let insertStart: number;
        let insertEnd: number;
        if (prev) {
          insertStart = prev.start;
          insertEnd = prev.end;
        } else {
          insertStart = activeInput?.selectionStart ?? currentValue.length;
          insertEnd = activeInput?.selectionEnd ?? insertStart;
        }

        const ref = cellKey(targetCol, targetRow);
        const newValue =
          currentValue.substring(0, insertStart) + ref + currentValue.substring(insertEnd);
        setEditValue(newValue);

        const newCursorPos = insertStart + ref.length;
        lastCellRefInsertRef.current = { start: insertStart, end: newCursorPos };

        // Start formula drag to allow range selection (e.g. A1:B5)
        isFormulaDragRef.current = true;
        formulaDragAnchorRef.current = { col: targetCol, row: targetRow };
        formulaDragInputRef.current = activeInput;

        requestAnimationFrame(() => {
          if (activeInput && 'setSelectionRange' in activeInput) {
            activeInput.focus();
            activeInput.setSelectionRange(newCursorPos, newCursorPos);
          }
        });
        return;
      }

      if (isEditingRef.current) {
        setCellValue(activeCellRef.current.col, activeCellRef.current.row, editValueRef.current);
        setIsEditing(false);
        setEditValue('');
      }

      if (shiftKey) {
        extendSelection({ col: targetCol, row: targetRow });
      } else {
        setActiveCell({ col: targetCol, row: targetRow });
        isDragSelecting.current = true;
      }

      focusGrid();
    },
    [setCellValue, extendSelection, setActiveCell, getMergeInfo, focusGrid],
  );

  // useEffect required: global mouse listeners for drag-to-select
  useEffect(() => {
    const updateFormulaDrag = () => {
      const point = formulaDragPointRef.current;
      const anchorPos = formulaDragAnchorRef.current;
      if (!point || !anchorPos || !isFormulaDragRef.current) return;
      {
        const pos = getCellFromPoint(point.x, point.y, {
          anchorCol: anchorPos.col,
          anchorRow: anchorPos.row,
        });
        if (!pos) return;
        const lastPos = lastFormulaDragPosRef.current;
        if (lastPos && lastPos.col === pos.col && lastPos.row === pos.row) return;
        lastFormulaDragPosRef.current = pos;
        const anchor = anchorPos;
        const prev = lastCellRefInsertRef.current;
        if (!prev) return;

        const currentValue = editValueRef.current;
        let ref: string;
        if (pos.col === anchor.col && pos.row === anchor.row) {
          ref = cellKey(anchor.col, anchor.row);
        } else {
          const startCol = Math.min(anchor.col, pos.col);
          const startRow = Math.min(anchor.row, pos.row);
          const endCol = Math.max(anchor.col, pos.col);
          const endRow = Math.max(anchor.row, pos.row);
          ref = `${cellKey(startCol, startRow)}:${cellKey(endCol, endRow)}`;
        }

        const newValue =
          currentValue.substring(0, prev.start) + ref + currentValue.substring(prev.end);
        setEditValue(newValue);
        const newCursorPos = prev.start + ref.length;
        lastCellRefInsertRef.current = { start: prev.start, end: newCursorPos };

        const activeInput = formulaDragInputRef.current;
        requestAnimationFrame(() => {
          if (activeInput && 'setSelectionRange' in activeInput) {
            activeInput.focus();
            activeInput.setSelectionRange(newCursorPos, newCursorPos);
          }
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Formula-drag: update range reference (e.g. A1 → A1:B5) as user drags
      if (isFormulaDragRef.current && formulaDragAnchorRef.current) {
        const anchorPos = formulaDragAnchorRef.current;
        formulaDragPointRef.current = { x: e.clientX, y: e.clientY };
        dragAutoScroll.track(e.clientX, e.clientY, {
          axis: 'both',
          anchorInFrozenCols: anchorPos.col < frozenCols,
          anchorInFrozenRows: anchorPos.row < frozenRows,
          onScrolled: updateFormulaDrag,
        });
        updateFormulaDrag();
        return;
      }

      if (!isDragSelecting.current) return;
      // Coalesce to one selection update per animation frame, and skip moves within the same cell
      dragPointRef.current = { x: e.clientX, y: e.clientY };
      const anchor = activeCellRef.current;
      dragAutoScroll.track(e.clientX, e.clientY, {
        axis: 'both',
        anchorInFrozenCols: anchor.col < frozenCols,
        anchorInFrozenRows: anchor.row < frozenRows,
        onScrolled: flushDragSelect,
      });
      if (dragRafRef.current === 0) dragRafRef.current = requestAnimationFrame(flushDragSelect);
    };

    const flushDragSelect = () => {
      dragRafRef.current = 0;
      const point = dragPointRef.current;
      if (!point || !isDragSelecting.current) return;
      const anchor = activeCellRef.current;
      const pos = getCellFromPoint(point.x, point.y, {
        anchorCol: anchor.col,
        anchorRow: anchor.row,
      });
      if (!pos) return;
      const last = lastDragCellRef.current;
      if (last && last.col === pos.col && last.row === pos.row) return;
      lastDragCellRef.current = pos;
      extendSelection(pos);
    };

    const handleMouseUp = () => {
      if (dragRafRef.current !== 0) {
        // Apply the final pointer position before ending the drag
        cancelAnimationFrame(dragRafRef.current);
        flushDragSelect();
      }
      dragAutoScroll.stop();
      dragPointRef.current = null;
      formulaDragPointRef.current = null;
      lastDragCellRef.current = null;
      isFormulaDragRef.current = false;
      formulaDragAnchorRef.current = null;
      formulaDragInputRef.current = null;
      lastFormulaDragPosRef.current = null;
      isDragSelecting.current = false;

      // Format painter: apply the captured style to whatever range was just clicked/dragged over
      if (formatPainter) {
        setCellStyle(getSelectedPositions(), fullCellStyle(formatPainter.style));
        setFormatPainter(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (dragRafRef.current !== 0) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = 0;
      }
    };
  }, [
    getCellFromPoint,
    extendSelection,
    formatPainter,
    getSelectedPositions,
    setCellStyle,
    dragAutoScroll,
    frozenCols,
    frozenRows,
  ]);

  // Handle cell double click
  const handleCellDoubleClick = useCallback(() => {
    startEditing();
  }, [startEditing]);

  // Handle delete
  const handleDeleteCells = useCallback(() => {
    const positions = getSelectedPositions();
    deleteCells(positions);
  }, [getSelectedPositions, deleteCells]);

  // Step `from` by `delta` (nonzero) along one axis, repeatedly, until landing on a visible
  // index; returns null (don't move) if no visible index is found before running out of bounds.
  const nextVisibleIndex = useCallback(
    (
      from: number,
      delta: number,
      count: number,
      isVisible: (i: number) => boolean,
    ): number | null => {
      let idx = clamp(from + delta, 0, count - 1);
      if (idx === from) return isVisible(idx) ? idx : null;
      while (!isVisible(idx)) {
        const next = idx + delta;
        if (next < 0 || next > count - 1) return null;
        idx = next;
      }
      return idx;
    },
    [],
  );

  // Handle move — auto-expand grid when navigating past current bounds, skip over hidden
  // rows/cols (filtered, group-collapsed, or explicitly hidden) to the next visible one.
  const handleMove = useCallback(
    (deltaCol: number, deltaRow: number, extend: boolean) => {
      let currentColCount = colCount;
      let currentRowCount = rowCount;
      if (deltaRow > 0 && activeCell.row >= rowCount - 1 && rowCount < MAX_ROW_COUNT) {
        currentRowCount = Math.min(rowCount + AUTO_EXPAND_ROWS, MAX_ROW_COUNT);
        setRowCount(currentRowCount);
      }
      if (deltaCol > 0 && activeCell.col >= colCount - 1 && colCount < MAX_COL_COUNT) {
        currentColCount = Math.min(colCount + AUTO_EXPAND_COLS, MAX_COL_COUNT);
        setColCount(currentColCount);
      }

      // Reference point moveActiveCell would move from: the active cell (normal move) or the
      // current selection's end (extend) — matches useSelection's moveActiveCell semantics.
      const from = extend ? (selectionRange ? selectionRange.end : activeCell) : activeCell;

      let targetCol = clamp(from.col, 0, currentColCount - 1);
      if (deltaCol !== 0) {
        const next = nextVisibleIndex(from.col, deltaCol, currentColCount, (c) =>
          visibleColIndexSet.has(c),
        );
        if (next === null) return;
        targetCol = next;
      }
      let targetRow = clamp(from.row, 0, currentRowCount - 1);
      if (deltaRow !== 0) {
        const next = nextVisibleIndex(from.row, deltaRow, currentRowCount, (r) =>
          visibleRowIndexSet.has(r),
        );
        if (next === null) return;
        targetRow = next;
      }

      if (!extend) {
        // Merged cells: step past the merge the move started in (Excel/Sheets move to the cell beyond
        // the merged block), and land on the anchor of any merge the target falls into, so the active
        // cell is never a hidden non-anchor cell.
        const fromAnchor = resolveMergeAnchor(from.col, from.row, getMergeInfo);
        const fromInfo = getMergeInfo(fromAnchor.col, fromAnchor.row);
        if (fromInfo && (fromInfo.colSpan > 1 || fromInfo.rowSpan > 1)) {
          const inFromMerge = (c: number, r: number) =>
            c >= fromAnchor.col &&
            c < fromAnchor.col + fromInfo.colSpan &&
            r >= fromAnchor.row &&
            r < fromAnchor.row + fromInfo.rowSpan;
          if (deltaCol > 0 && inFromMerge(targetCol, targetRow))
            targetCol = Math.min(fromAnchor.col + fromInfo.colSpan, currentColCount - 1);
          if (deltaRow > 0 && inFromMerge(targetCol, targetRow))
            targetRow = Math.min(fromAnchor.row + fromInfo.rowSpan, currentRowCount - 1);
          if (deltaCol < 0 && inFromMerge(targetCol, targetRow))
            targetCol = Math.max(fromAnchor.col - 1, 0);
          if (deltaRow < 0 && inFromMerge(targetCol, targetRow))
            targetRow = Math.max(fromAnchor.row - 1, 0);
        }
        const landed = resolveMergeAnchor(targetCol, targetRow, getMergeInfo);
        targetCol = landed.col;
        targetRow = landed.row;
      }

      if (extend) {
        extendSelectionTo({ col: targetCol, row: targetRow });
      } else {
        setActiveCell({ col: targetCol, row: targetRow });
      }
    },
    [
      colCount,
      rowCount,
      activeCell,
      selectionRange,
      setColCount,
      setRowCount,
      visibleColIndexSet,
      visibleRowIndexSet,
      nextVisibleIndex,
      extendSelectionTo,
      setActiveCell,
      getMergeInfo,
    ],
  );

  // Ctrl/Cmd+Arrow: jump to the next data edge, optionally extending the selection. Hidden
  // rows/cols are treated as having no value (so a jump skips past them), and if the jump
  // would land on a hidden cell (e.g. the grid edge itself being hidden) it snaps back to the
  // nearest visible cell along the way.
  const handleJump = useCallback(
    (dCol: number, dRow: number, extend: boolean) => {
      const isVisible = (c: number, r: number) =>
        visibleColIndexSet.has(c) && visibleRowIndexSet.has(r);
      // Spilled cells have an empty rawValue but a displayed value, so they count as data too
      const hasValue = (c: number, r: number) => {
        if (!isVisible(c, r)) return false;
        const cd = getCellData(c, r);
        return !!cd && (cd.rawValue !== '' || cd.displayValue !== '');
      };
      const maxCol = colCount - 1;
      const maxRow = rowCount - 1;
      if (extend) {
        const from = selectionRange ? selectionRange.end : activeCell;
        const target = findDataEdge(from, dCol, dRow, hasValue, maxCol, maxRow, isVisible);
        extendSelectionTo(target);
      } else {
        const target = findDataEdge(activeCell, dCol, dRow, hasValue, maxCol, maxRow, isVisible);
        setActiveCell(resolveMergeAnchor(target.col, target.row, getMergeInfo));
      }
    },
    [
      getCellData,
      colCount,
      rowCount,
      selectionRange,
      activeCell,
      extendSelectionTo,
      setActiveCell,
      visibleColIndexSet,
      visibleRowIndexSet,
      getMergeInfo,
    ],
  );

  // Home: move to column 0 of the current row
  const handleHome = useCallback(
    (extend: boolean) => {
      const target = { col: 0, row: activeCell.row };
      if (extend) extendSelectionTo(target);
      else setActiveCell(target);
    },
    [activeCell, extendSelectionTo, setActiveCell],
  );

  // Ctrl/Cmd+Home: move to A1
  const handleCtrlHome = useCallback(() => {
    setActiveCell({ col: 0, row: 0 });
  }, [setActiveCell]);

  // Ctrl/Cmd+End: move to the last used cell (max row/col with a non-empty raw value)
  const handleCtrlEnd = useCallback(() => {
    const sheet = getActiveSheet();
    let maxCol = 0;
    let maxRow = 0;
    for (const [key, cell] of sheet.cells) {
      if (!cell.rawValue) continue;
      const pos = parseCellKey(key);
      if (pos.col > maxCol) maxCol = pos.col;
      if (pos.row > maxRow) maxRow = pos.row;
    }
    setActiveCell({ col: maxCol, row: maxRow });
  }, [getActiveSheet, setActiveCell]);

  // PageUp/PageDown: move by one screenful of rows
  const handlePage = useCallback(
    (dir: 1 | -1, extend: boolean) => {
      const el = scrollContainerRef.current;
      const page = el ? Math.max(1, Math.floor(el.clientHeight / defaultRowHeight) - 1) : 1;
      handleMove(0, dir * page, extend);
    },
    [handleMove, defaultRowHeight],
  );

  // Ctrl/Cmd+A: select the whole sheet, keeping the active cell in place
  const handleSelectAll = useCallback(() => {
    selectRange(
      { start: { col: 0, row: 0 }, end: { col: colCount - 1, row: rowCount - 1 } },
      activeCell,
    );
  }, [selectRange, colCount, rowCount, activeCell]);

  // Shift+Space: select the current row(s) in full
  const handleSelectRow = useCallback(() => {
    const startRow = selectionRange
      ? Math.min(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;
    const endRow = selectionRange
      ? Math.max(selectionRange.start.row, selectionRange.end.row)
      : activeCell.row;
    selectRange(
      { start: { col: 0, row: startRow }, end: { col: colCount - 1, row: endRow } },
      activeCell,
    );
  }, [selectionRange, activeCell, colCount, selectRange]);

  // Ctrl/Cmd+Space: select the current column(s) in full
  const handleSelectColumn = useCallback(() => {
    const startCol = selectionRange
      ? Math.min(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    const endCol = selectionRange
      ? Math.max(selectionRange.start.col, selectionRange.end.col)
      : activeCell.col;
    selectRange(
      { start: { col: startCol, row: 0 }, end: { col: endCol, row: rowCount - 1 } },
      activeCell,
    );
  }, [selectionRange, activeCell, rowCount, selectRange]);

  // Ctrl/Cmd+D: copy the top row of the selection down to every row below it
  const handleFillDown = useCallback(() => {
    if (!selectionRange) return;
    const startCol = Math.min(selectionRange.start.col, selectionRange.end.col);
    const endCol = Math.max(selectionRange.start.col, selectionRange.end.col);
    const startRow = Math.min(selectionRange.start.row, selectionRange.end.row);
    const endRow = Math.max(selectionRange.start.row, selectionRange.end.row);
    if (endRow <= startRow) return;
    applyFill(
      { startCol, endCol, startRow, endRow: startRow },
      { col: endCol, row: endRow },
      'down',
    );
  }, [selectionRange, applyFill]);

  // Ctrl/Cmd+R: copy the leftmost column of the selection right to every column after it
  const handleFillRight = useCallback(() => {
    if (!selectionRange) return;
    const startCol = Math.min(selectionRange.start.col, selectionRange.end.col);
    const endCol = Math.max(selectionRange.start.col, selectionRange.end.col);
    const startRow = Math.min(selectionRange.start.row, selectionRange.end.row);
    const endRow = Math.max(selectionRange.start.row, selectionRange.end.row);
    if (endCol <= startCol) return;
    applyFill(
      { startCol, endCol: startCol, startRow, endRow },
      { col: endCol, row: endRow },
      'right',
    );
  }, [selectionRange, applyFill]);

  // Ctrl/Cmd+;: insert today's date into the active cell
  const handleInsertDate = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setCellValue(activeCell.col, activeCell.row, `${y}/${m}/${d}`);
  }, [activeCell, setCellValue]);

  // Ctrl/Cmd+Shift+;: insert the current time (24h) into the active cell
  const handleInsertTime = useCallback(() => {
    const now = new Date();
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    setCellValue(activeCell.col, activeCell.row, `${now.getHours()}:${mi}:${s}`);
  }, [activeCell, setCellValue]);

  const handleAlign = useCallback(
    (align: 'left' | 'center' | 'right') => {
      handleSetCellStyle({ textAlign: align });
    },
    [handleSetCellStyle],
  );

  // Toolbar "123 ▾" dropdown and presets (currency/percent buttons, custom pattern popover)
  const handleSetNumberFormat = useCallback(
    (format: NumberFormat, pattern?: string) => {
      handleSetCellStyle({ numberFormat: format, numberFormatPattern: pattern });
    },
    [handleSetCellStyle],
  );

  // Decrease/increase decimal places, based on the active cell's current pattern
  const handleAdjustDecimals = useCallback(
    (delta: 1 | -1) => {
      const refData = getCellData(activeCell.col, activeCell.row);
      const currentPattern = patternForStyle(refData?.style);
      const refValue = typeof refData?.computed === 'number' ? refData.computed : undefined;
      const newPattern = adjustDecimals(currentPattern, delta, refValue);
      handleSetCellStyle({ numberFormat: 'custom', numberFormatPattern: newPattern });
    },
    [activeCell, getCellData, handleSetCellStyle],
  );
  const handleIncreaseDecimals = useCallback(() => handleAdjustDecimals(1), [handleAdjustDecimals]);
  const handleDecreaseDecimals = useCallback(
    () => handleAdjustDecimals(-1),
    [handleAdjustDecimals],
  );

  // Format painter: capture the active cell's style, or clear if already active
  const handleToggleFormatPainter = useCallback(() => {
    setFormatPainter((prev) => {
      if (prev) return null;
      return { style: getCellData(activeCell.col, activeCell.row)?.style };
    });
  }, [activeCell, getCellData]);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsDialog(true);
  }, []);

  // Resize handlers
  const handleColResize = useCallback(
    (colIndex: number, newWidth: number) => {
      setColWidth(colIndex, newWidth);
    },
    [setColWidth],
  );

  const handleRowResize = useCallback(
    (rowIndex: number, newHeight: number) => {
      setRowHeight(rowIndex, newHeight);
    },
    [setRowHeight],
  );

  // Column header click/Shift+click: select the whole column
  const handleColHeaderSelect = useCallback(
    (colIndex: number, e: { shiftKey: boolean }) => {
      const anchor = e.shiftKey ? activeCell.col : colIndex;
      selectRange(
        { start: { col: anchor, row: 0 }, end: { col: colIndex, row: rowCount - 1 } },
        { col: anchor, row: 0 },
      );
      headerDragAnchorRef.current = anchor;
      setHeaderDragType('col');
    },
    [activeCell, rowCount, selectRange],
  );

  // Row header click/Shift+click: select the whole row
  const handleRowHeaderSelect = useCallback(
    (rowIndex: number, e: { shiftKey: boolean }) => {
      const anchor = e.shiftKey ? activeCell.row : rowIndex;
      selectRange(
        { start: { col: 0, row: anchor }, end: { col: colCount - 1, row: rowIndex } },
        { col: 0, row: anchor },
      );
      headerDragAnchorRef.current = anchor;
      setHeaderDragType('row');
    },
    [activeCell, colCount, selectRange],
  );

  // useEffect required: global mouse listeners to extend the col/row range while dragging over headers
  // (auto-scrolls horizontally for column headers / vertically for row headers at the viewport edge)
  useEffect(() => {
    if (!headerDragType) return;
    const anchor = headerDragAnchorRef.current;
    let point: { x: number; y: number } | null = null;
    let last = -1;

    const update = () => {
      if (!point) return;
      const pos = getCellFromPoint(point.x, point.y, {
        anchorCol: headerDragType === 'col' ? anchor : 0,
        anchorRow: headerDragType === 'row' ? anchor : 0,
      });
      if (!pos) return;
      const index = headerDragType === 'col' ? pos.col : pos.row;
      if (index === last) return;
      last = index;
      if (headerDragType === 'col') {
        selectRange(
          { start: { col: anchor, row: 0 }, end: { col: index, row: rowCount - 1 } },
          { col: anchor, row: 0 },
        );
      } else {
        selectRange(
          { start: { col: 0, row: anchor }, end: { col: colCount - 1, row: index } },
          { col: 0, row: anchor },
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      point = { x: e.clientX, y: e.clientY };
      dragAutoScroll.track(e.clientX, e.clientY, {
        axis: headerDragType === 'col' ? 'x' : 'y',
        anchorInFrozenCols: headerDragType === 'col' ? anchor < frozenCols : true,
        anchorInFrozenRows: headerDragType === 'row' ? anchor < frozenRows : true,
        onScrolled: update,
      });
      update();
    };

    const handleMouseUp = () => {
      dragAutoScroll.stop();
      setHeaderDragType(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    headerDragType,
    colCount,
    rowCount,
    selectRange,
    getCellFromPoint,
    dragAutoScroll,
    frozenCols,
    frozenRows,
  ]);

  // Column header resize-handle double-click: auto-fit the column width to its content
  const handleColumnAutoFit = useCallback(
    (colIndex: number) => {
      let canvas = measureCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        measureCanvasRef.current = canvas;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const sheet = getActiveSheet();
      let maxWidth = 0;
      for (const [key, cell] of sheet.cells) {
        const pos = parseCellKey(key);
        if (pos.col !== colIndex) continue;
        const display = formatDisplayValue(
          cell.displayValue ?? '',
          cell.style?.numberFormat ?? 'auto',
        );
        if (!display) continue;
        // Match Cell.tsx's rendering: custom fontSize is in `pt`, the default text size is 13px
        const fontSizeStyle = cell.style?.fontSize ? `${cell.style.fontSize}pt` : '13px';
        const fontFamily = cell.style?.fontFamily ?? DEFAULT_CELL_FONT_FAMILY;
        const bold = cell.style?.bold ? 'bold ' : '';
        ctx.font = `${bold}${fontSizeStyle} ${fontFamily}`;
        const width = ctx.measureText(display).width;
        if (width > maxWidth) maxWidth = width;
      }

      setColWidth(colIndex, maxWidth > 0 ? Math.ceil(maxWidth) + 12 : defaultColWidth);
    },
    [getActiveSheet, setColWidth, defaultColWidth],
  );

  // Row header resize-handle double-click: auto-fit the row height to its content
  const handleRowAutoFit = useCallback(
    (rowIndex: number) => {
      autoResizeRows(new Set([rowIndex]), { force: true });
    },
    [autoResizeRows],
  );

  // Keyboard hook
  const { handleKeyDown } = useKeyboard({
    isEditing,
    editMode,
    editValue,
    onMove: handleMove,
    onStartEditing: startEditing,
    onConfirmEdit: commitEdit,
    onConfirmEditFillSelection: commitEditFillSelection,
    onInsertNewline: insertNewlineInEdit,
    onCancelEdit: cancelEdit,
    onEscape: handleEscape,
    onDeleteCells: handleDeleteCells,
    onUndo: undo,
    onRedo: redo,
    // Plain mod+C/X/V are handled by the native copy/cut/paste document listeners below.
    onPasteValues: handlePasteValuesOnly,
    onToggleBold: handleToggleBold,
    onToggleItalic: handleToggleItalic,
    onToggleUnderline: handleToggleUnderline,
    onToggleStrikethrough: handleToggleStrikethrough,
    onToggleDevTools: () => (showDevTools ? closeDevTools() : setShowDevTools(true)),
    onAlign: handleAlign,
    onClearFormatting: handleClearFormatting,
    onSearch: openSearch,
    onSearchReplace: useCallback(() => openSearch({ replace: true }), [openSearch]),
    onShowShortcuts: handleShowShortcuts,
    onJump: handleJump,
    onHome: handleHome,
    onCtrlHome: handleCtrlHome,
    onCtrlEnd: handleCtrlEnd,
    onPage: handlePage,
    onSelectAll: handleSelectAll,
    onSelectRow: handleSelectRow,
    onSelectColumn: handleSelectColumn,
    onFillDown: handleFillDown,
    onFillRight: handleFillRight,
    onInsertDate: handleInsertDate,
    onInsertTime: handleInsertTime,
    onSpace: handleSpaceToggle,
    onAltArrowDown: handleAltArrowDownOpen,
    onToggleAbsoluteRef: useCallback(
      (e: React.KeyboardEvent) => {
        const input = e.target as HTMLInputElement;
        const cursor = input.selectionStart ?? 0;
        const result = toggleAbsoluteRef(editValue, cursor);
        if (result) {
          setEditValue(result.text);
          requestAnimationFrame(() => {
            input.setSelectionRange(result.cursorPos, result.cursorPos);
          });
        }
      },
      [editValue],
    ),
  });

  // Native copy/cut/paste: reading/writing e.clipboardData directly (no permission prompt,
  // and text/html round-trips) requires handling the browser's own copy/cut/paste events
  // instead of intercepting Ctrl/Cmd+C/X/V in onKeyDown.
  const handleCopyRef = useRef(handleCopy);
  handleCopyRef.current = handleCopy;
  const handleCutRef = useRef(handleCut);
  handleCutRef.current = handleCut;
  const handlePasteRef = useRef(handlePaste);
  handlePasteRef.current = handlePaste;

  // useEffect required: native clipboard events must be subscribed on document (the events
  // aren't dispatched to a specific React-managed element in all browsers/contexts)
  useEffect(() => {
    const isEditableElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
    };

    const shouldHandle = (e: ClipboardEvent): boolean => {
      if (isEditingRef.current) return false;
      // The nav-mode cell editor textarea is the grid's persistent focus target (it has
      // data-cell-editor); treat it as "the grid has focus", not as some other editable
      // element that should make us skip and let the browser handle copy/cut/paste.
      if (document.activeElement === cellEditorRef.current) return true;
      if (isEditableElement(e.target as Element | null)) return false;
      if (isEditableElement(document.activeElement)) return false;
      const container = scrollContainerRef.current;
      if (!container) return false;
      const active = document.activeElement;
      if (active !== container && !container.contains(active)) return false;
      return true;
    };

    const onNativeCopy = (e: ClipboardEvent) => {
      if (!shouldHandle(e)) return;
      handleCopyRef.current(e);
    };
    const onNativeCut = (e: ClipboardEvent) => {
      if (!shouldHandle(e)) return;
      handleCutRef.current(e);
    };
    const onNativePaste = (e: ClipboardEvent) => {
      if (!shouldHandle(e)) return;
      e.preventDefault();
      handlePasteRef.current(e);
    };

    document.addEventListener('copy', onNativeCopy);
    document.addEventListener('cut', onNativeCut);
    document.addEventListener('paste', onNativePaste);
    return () => {
      document.removeEventListener('copy', onNativeCopy);
      document.removeEventListener('cut', onNativeCut);
      document.removeEventListener('paste', onNativePaste);
    };
  }, []);

  // Handle edit value change
  const handleEditChange = useCallback((value: string) => {
    setEditValue(value);
    lastCellRefInsertRef.current = null;
  }, []);

  // Cell-editor autocomplete: its own useFormulaBar instance (separate from the formula bar's),
  // so suggestions only ever populate from whichever surface the user is actually typing into.
  const {
    suggestions: cellSuggestions,
    selectedIndex: cellSuggestionIndex,
    updateSuggestions: updateCellSuggestions,
    clearSuggestions: clearCellSuggestions,
    moveSelection: moveCellSuggestion,
    getSelectedSuggestion: getSelectedCellSuggestion,
    selectSuggestion: selectCellSuggestion,
  } = useFormulaBar();

  // useEffect required: clears the cell-editor's autocomplete suggestions once editing ends
  useEffect(() => {
    if (!isEditing) clearCellSuggestions();
  }, [isEditing, clearCellSuggestions]);

  const handleCellEditorChange = useCallback(
    (value: string) => {
      handleEditChange(value);
      updateCellSuggestions(value);
    },
    [handleEditChange, updateCellSuggestions],
  );

  // IME composition start in navigation mode: begin editing with an empty value (mirrors
  // startDirectInput(''), named separately for clarity at the CellEditor call site).
  const handleCompositionStart = useCallback(() => {
    startDirectInput('');
  }, [startDirectInput]);

  const handleCellSuggestionSelect = useCallback(
    (fn: FunctionMeta) => {
      const newValue = selectCellSuggestion(fn, editValueRef.current);
      handleEditChange(newValue);
      updateCellSuggestions(newValue);
      focusGrid();
    },
    [selectCellSuggestion, handleEditChange, updateCellSuggestions, focusGrid],
  );

  // Cell editor's keydown: IME guard first, then autocomplete navigation/selection (mirroring
  // FormulaBar's own precedence), then the normal grid keyboard handling.
  const handleCellEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      if (isEditing && cellSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveCellSuggestion(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveCellSuggestion(-1);
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          const selected = getSelectedCellSuggestion();
          if (selected) {
            e.preventDefault();
            const newValue = selectCellSuggestion(selected, editValue);
            handleEditChange(newValue);
            updateCellSuggestions(newValue);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          clearCellSuggestions();
          return;
        }
      }

      handleKeyDown(e);
    },
    [
      isEditing,
      cellSuggestions,
      editValue,
      moveCellSuggestion,
      getSelectedCellSuggestion,
      selectCellSuggestion,
      handleEditChange,
      updateCellSuggestions,
      clearCellSuggestions,
      handleKeyDown,
    ],
  );

  // Formula bar: commit from formula bar (always move down)
  const commitFromFormulaBar = useCallback(() => {
    commitEdit('down');
  }, [commitEdit]);

  // Active cell display value for formula bar
  const activeCellData = getCellData(activeCell.col, activeCell.row);
  const formulaBarValue = activeCellData?.rawValue ?? '';

  // Overflow display: long left-aligned text strings spill visually into empty cells to the right,
  // up to MAX_OVERFLOW_COLS columns, stopping at the first non-empty/merged/hidden-boundary cell.
  const MAX_OVERFLOW_COLS = 20;
  const computeOverflowWidth = useCallback(
    (col: number, row: number, cellWidth: number): number | undefined => {
      const cellData = getCellData(col, row);
      if (!cellData || cellData.rawValue === '') return undefined;
      if (cellData.style?.wrapText) return undefined;
      if (getMergeInfo(col, row)) return undefined;

      // Numeric formula results (and any non-string computed value) never overflow
      let isStringResult: boolean;
      if (cellData.formula === undefined) {
        isStringResult = true;
      } else if (typeof cellData.computed === 'string') {
        isStringResult = true;
      } else if (cellData.computed === undefined) {
        const trimmed = cellData.displayValue.trim();
        isStringResult = trimmed === '' || isNaN(Number(trimmed));
      } else {
        isStringResult = false;
      }
      if (!isStringResult) return undefined;

      if (getCellDisplay(cellData, cellData.style).align !== 'left') return undefined;

      let sum = 0;
      for (let i = 1; i <= MAX_OVERFLOW_COLS; i++) {
        const c = col + i;
        if (c >= colCount) break;
        if (isColHidden(c)) continue; // hidden column: contributes no width, doesn't block the scan
        if (getMergeInfo(c, row)) break;
        const neighbor = getCellData(c, row);
        const neighborEmpty =
          (neighbor === undefined || neighbor.rawValue === '') && !neighbor?.spillSource;
        if (!neighborEmpty) break;
        sum += getColWidth(c);
      }

      return sum > 0 ? cellWidth + sum : undefined;
    },
    [getCellData, getMergeInfo, colCount, isColHidden, getColWidth],
  );

  // Virtual items
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();

  const totalWidth = colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  // --- Frozen pane dimensions ---
  let frozenRowHeight = 0;
  for (let r = 0; r < frozenRows; r++) {
    frozenRowHeight += visibleRowHeight(r);
  }
  let frozenColWidth = 0;
  for (let c = 0; c < frozenCols; c++) {
    frozenColWidth += visibleColWidth(c);
  }
  frozenSizeRef.current = { width: frozenColWidth, height: frozenRowHeight };

  return (
    <SpreadsheetContext.Provider value={spreadsheetActions}>
      <div
        ref={measureDivRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          height: 'auto',
          overflow: 'hidden',
          padding: 0,
          top: -9999,
          left: -9999,
        }}
      />
      <div
        className="flex flex-col h-full w-full"
        data-version={version}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* App header: icon · title + save status over the menus · search / theme, then the toolbar capsule */}
        <header className="app-header shrink-0" data-app-header>
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-1.5" data-header-row>
            <AppIcon size={36} />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <DocumentTitle title={title ?? ''} onChange={setTitle} />
                <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
              </div>
              <MenuBar />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="header-icon-button"
                title="検索 (Ctrl+F)"
                aria-label="検索"
                onClick={() => openSearch()}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.4 10.4L14 14" />
                </svg>
              </button>
              <ThemeToggle theme={theme} onThemeChange={setTheme} />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center px-3 pb-2.5 shrink-0" data-header-row>
            <Toolbar
              activeCellStyle={activeCellStyle}
              onSetStyle={handleSetCellStyle}
              canMerge={canMerge}
              isMerged={isMerged}
              onMerge={handleMergeCells}
              onUnmerge={handleUnmergeCells}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onFormatPainter={handleToggleFormatPainter}
              formatPainterActive={formatPainter !== null}
              zoom={zoom}
              onZoomChange={handleZoomChange}
              onIncreaseDecimals={handleIncreaseDecimals}
              onDecreaseDecimals={handleDecreaseDecimals}
              onSetNumberFormat={handleSetNumberFormat}
              onClearFormatting={handleClearFormatting}
              activeCellValue={
                typeof activeCellData?.computed === 'number' ? activeCellData.computed : undefined
              }
            />
          </div>
        </header>

        {/* Formula Bar */}
        <FormulaBar
          activeCell={activeCell}
          cellDisplayValue={formulaBarValue}
          isEditing={isEditing}
          editValue={editValue}
          onEditChange={handleEditChange}
          onStartEditing={startEditing}
          onConfirmEdit={commitFromFormulaBar}
          onCancelEdit={cancelEdit}
          namedRanges={namedRanges}
          onNameBoxSelect={(name) => {
            const nr = namedRanges.find((r) => r.name === name);
            if (!nr) return;
            const rangeStr = nr.range;
            if (rangeStr.includes(':')) {
              const [startStr] = rangeStr.split(':');
              const pos = parseCellKey(startStr);
              setActiveCell({ col: pos.col, row: pos.row });
            } else {
              const pos = parseCellKey(rangeStr);
              setActiveCell({ col: pos.col, row: pos.row });
            }
          }}
          onNameBoxCreate={(name) => {
            const range = selectionRange
              ? `${cellKey(Math.min(selectionRange.start.col, selectionRange.end.col), Math.min(selectionRange.start.row, selectionRange.end.row))}:${cellKey(Math.max(selectionRange.start.col, selectionRange.end.col), Math.max(selectionRange.start.row, selectionRange.end.row))}`
              : cellKey(activeCell.col, activeCell.row);
            addNamedRange(name, range);
          }}
          onOpenFunctionWizard={() => setShowFunctionWizard(true)}
          formulaRefs={formulaRefs}
          refColors={REF_COLORS}
          parseError={activeCellData?.parseError}
        />

        {/* Grid container + docked side panel (conditional format / data validation) */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 relative overflow-hidden min-w-0">
            {/* Search Panel */}
            <SearchPanel
              visible={showSearch}
              initialFocus={searchInitialFocus}
              onClose={closeSearch}
              sheets={sheets}
              activeSheetId={activeSheetId}
              onNavigateToCell={handleSearchNavigate}
              onReplaceOne={handleSearchReplaceOne}
              onReplaceAll={handleSearchReplaceAll}
              hiddenRows={hiddenRows}
              dataVersion={version}
            />

            {/* Zoom wrapper: scales the cell area + header area as a whole (CSS zoom, Chrome/Safari/Firefox 126+) */}
            <div style={{ zoom: zoomFactor, cursor: formatPainter ? 'copy' : undefined }}>
              {/* Corner cell (top-left fixed): click to select the whole sheet */}
              <div
                className="absolute top-0 left-0 bg-header-bg border-r border-b border-grid-line z-30 cursor-pointer"
                style={{ width: dynamicRowHeaderWidth, height: dynamicColHeaderHeight }}
                onMouseDown={handleSelectAll}
              />

              {/* Column headers (fixed top, scrolls horizontally with grid) */}
              <div
                className="absolute top-0 overflow-hidden z-20"
                style={{
                  left: dynamicRowHeaderWidth,
                  right: 0,
                  height: dynamicColHeaderHeight,
                }}
              >
                <div
                  ref={colHeaderRef}
                  style={{
                    width: totalWidth,
                    height: dynamicColHeaderHeight,
                    position: 'relative',
                  }}
                >
                  <div
                    aria-hidden
                    className="header-band header-band-col"
                    style={{
                      transform: `translateX(${cursorRects.selection.left}px)`,
                      width: cursorRects.selection.width,
                      height: COL_HEADER_HEIGHT,
                    }}
                  />
                  {virtualCols.map((virtualCol) => {
                    const realCol = visibleColIndices[virtualCol.index];
                    const hiddenBefore = realCol > 0 && hiddenColSet.has(realCol - 1);
                    const hiddenAfter = realCol < colCount - 1 && hiddenColSet.has(realCol + 1);
                    return (
                      <ColumnHeader
                        key={virtualCol.key}
                        colIndex={realCol}
                        left={virtualCol.start}
                        width={virtualCol.size}
                        onResize={handleColResize}
                        onContextMenu={handleColContextMenu}
                        onSelect={handleColHeaderSelect}
                        onAutoFit={handleColumnAutoFit}
                        zoom={zoom}
                        hiddenBefore={hiddenBefore}
                        hiddenAfter={hiddenAfter}
                        onUnhideBefore={
                          hiddenBefore ? () => unhideColRunBefore(realCol - 1) : undefined
                        }
                        onUnhideAfter={
                          hiddenAfter ? () => unhideColRunAfter(realCol + 1) : undefined
                        }
                      />
                    );
                  })}
                  {/* Column group bar */}
                  {maxColGroupLevel > 0 && (
                    <ColGroupBar
                      groups={colGroups}
                      maxLevel={maxColGroupLevel}
                      colVirtualItems={virtualCols.map((c) => ({
                        index: visibleColIndices[c.index],
                        start: c.start,
                        size: c.size,
                      }))}
                      onToggleCollapse={toggleColGroupCollapse}
                      onSetExpandLevel={setColExpandLevel}
                      totalWidth={totalWidth}
                    />
                  )}
                </div>
              </div>

              {/* Row headers (fixed left, scrolls vertically with grid) */}
              <div
                className="absolute left-0 overflow-hidden z-20"
                style={{
                  top: dynamicColHeaderHeight,
                  bottom: 0,
                  width: dynamicRowHeaderWidth,
                }}
              >
                <div
                  ref={rowHeaderRef}
                  style={{
                    width: dynamicRowHeaderWidth,
                    height: totalHeight,
                    position: 'relative',
                  }}
                >
                  <div
                    aria-hidden
                    className="header-band header-band-row"
                    style={{
                      transform: `translateY(${cursorRects.selection.top}px)`,
                      width: ROW_HEADER_WIDTH,
                      height: cursorRects.selection.height,
                    }}
                  />
                  {/* Row group bar */}
                  {maxRowGroupLevel > 0 && (
                    <RowGroupBar
                      groups={rowGroups}
                      maxLevel={maxRowGroupLevel}
                      visibleRowIndices={visibleRowIndices}
                      getRowHeight={getRowHeight}
                      rowVirtualItems={virtualRows.map((r) => ({
                        index: r.index,
                        start: r.start,
                        size: r.size,
                      }))}
                      onToggleCollapse={toggleRowGroupCollapse}
                      onSetExpandLevel={setRowExpandLevel}
                      totalHeight={totalHeight}
                    />
                  )}
                  {virtualRows.map((virtualRow) => {
                    const actualRow = visibleRowIndices[virtualRow.index];
                    const hiddenBefore = actualRow > 0 && hiddenRowSet.has(actualRow - 1);
                    const hiddenAfter = actualRow < rowCount - 1 && hiddenRowSet.has(actualRow + 1);
                    return (
                      <RowHeader
                        key={virtualRow.key}
                        rowIndex={actualRow}
                        top={virtualRow.start}
                        height={virtualRow.size}
                        onResize={handleRowResize}
                        onContextMenu={handleRowContextMenu}
                        onSelect={handleRowHeaderSelect}
                        onAutoFit={handleRowAutoFit}
                        zoom={zoom}
                        hiddenBefore={hiddenBefore}
                        hiddenAfter={hiddenAfter}
                        onUnhideBefore={
                          hiddenBefore ? () => unhideRowRunBefore(actualRow - 1) : undefined
                        }
                        onUnhideAfter={
                          hiddenAfter ? () => unhideRowRunAfter(actualRow + 1) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>

              {/* Frozen pane boundary indicators */}
              {frozenRows > 0 && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    zIndex: 25,
                    top: dynamicColHeaderHeight + frozenRowHeight,
                    left: dynamicRowHeaderWidth,
                    right: 0,
                    height: 2,
                    backgroundColor: 'var(--color-accent-selection)',
                    opacity: 0.5,
                  }}
                />
              )}
              {frozenCols > 0 && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    zIndex: 25,
                    top: dynamicColHeaderHeight,
                    left: dynamicRowHeaderWidth + frozenColWidth,
                    bottom: 0,
                    width: 2,
                    backgroundColor: 'var(--color-accent-selection)',
                    opacity: 0.5,
                  }}
                />
              )}

              {/* Scrollable grid area */}
              <div
                ref={scrollContainerRef}
                role="grid"
                aria-rowcount={rowCount}
                aria-colcount={colCount}
                className="absolute overflow-auto outline-none"
                style={{
                  top: dynamicColHeaderHeight,
                  left: dynamicRowHeaderWidth,
                  right: 0,
                  bottom: 0,
                }}
                onScroll={handleScroll}
              >
                <div
                  style={{
                    width: totalWidth,
                    height: totalHeight,
                    position: 'relative',
                    // Origin of the value-change ripple (Cell's .cell-flash delays by distance from here)
                    ['--flash-oc' as string]: activeCell.col,
                    ['--flash-or' as string]: activeCell.row,
                  }}
                >
                  {/* Frozen rows (sticky top: the browser keeps them in place while they scroll horizontally
                  with the grid — no JS scroll syncing, so they never lag behind the scrolled content) */}
                  {frozenRows > 0 && (
                    <div
                      data-frozen-rows
                      style={{ position: 'sticky', top: 0, height: 0, zIndex: 15 }}
                    >
                      <div
                        style={{
                          width: totalWidth,
                          height: frozenRowHeight,
                          position: 'relative',
                        }}
                      >
                        {Array.from({ length: frozenRows }, (_, r) => {
                          let rowTop = 0;
                          for (let rr = 0; rr < r; rr++) rowTop += visibleRowHeight(rr);
                          const rowH = visibleRowHeight(r);
                          return virtualCols.map((virtualCol) => {
                            const col = visibleColIndices[virtualCol.index];
                            const active = isCellActive(col, r);
                            const selected = isCellSelected(col, r);
                            const cellIsEditing = active && isEditing;
                            return (
                              <Cell
                                key={`frozen-row-${col}-${r}`}
                                col={col}
                                row={r}
                                data={getCellData(col, r)}
                                isActive={active}
                                isSelected={selected}
                                isEditing={cellIsEditing}
                                flashScope={activeSheetId}
                                sortMotion={getSortMotionProps(col, r)}
                                conditionalStyle={getCfStyle(col, r)}
                                left={virtualCol.start}
                                top={rowTop}
                                width={virtualCol.size}
                                height={rowH}
                                onMouseDown={handleCellMouseDown}
                                onDoubleClick={handleCellDoubleClick}
                                {...getValidationUi(col, r)}
                                onCheckboxToggle={handleCheckboxToggle}
                                onDropdownOpen={handleDropdownOpen}
                              />
                            );
                          });
                        })}
                      </div>
                    </div>
                  )}

                  {/* Frozen columns (sticky left: scroll vertically with the grid, stay put horizontally) */}
                  {frozenCols > 0 && (
                    <div
                      data-frozen-cols
                      style={{
                        position: 'sticky',
                        left: 0,
                        width: frozenColWidth,
                        height: 0,
                        zIndex: 15,
                      }}
                    >
                      <div
                        style={{
                          width: frozenColWidth,
                          height: totalHeight,
                          position: 'relative',
                        }}
                      >
                        {virtualRows.map((virtualRow) => {
                          const actualRow = visibleRowIndices[virtualRow.index];
                          if (actualRow < frozenRows) return null; // Already rendered in frozen rows
                          return Array.from({ length: frozenCols }, (_, c) => {
                            let colLeft = 0;
                            for (let cc = 0; cc < c; cc++) colLeft += visibleColWidth(cc);
                            const colW = visibleColWidth(c);
                            const active = isCellActive(c, actualRow);
                            const selected = isCellSelected(c, actualRow);
                            const cellIsEditing = active && isEditing;
                            return (
                              <Cell
                                key={`frozen-col-${c}-${actualRow}`}
                                col={c}
                                row={actualRow}
                                data={getCellData(c, actualRow)}
                                isActive={active}
                                isSelected={selected}
                                isEditing={cellIsEditing}
                                flashScope={activeSheetId}
                                sortMotion={getSortMotionProps(c, actualRow)}
                                conditionalStyle={getCfStyle(c, actualRow)}
                                left={colLeft}
                                top={virtualRow.start}
                                width={colW}
                                height={virtualRow.size}
                                onMouseDown={handleCellMouseDown}
                                onDoubleClick={handleCellDoubleClick}
                                {...getValidationUi(c, actualRow)}
                                onCheckboxToggle={handleCheckboxToggle}
                                onDropdownOpen={handleDropdownOpen}
                              />
                            );
                          });
                        })}
                      </div>
                    </div>
                  )}

                  {/* Frozen corner (sticky both ways) */}
                  {frozenRows > 0 && frozenCols > 0 && (
                    <div
                      data-frozen-corner
                      style={{
                        position: 'sticky',
                        top: 0,
                        left: 0,
                        width: frozenColWidth,
                        height: 0,
                        zIndex: 16,
                      }}
                    >
                      <div
                        className="bg-grid-bg"
                        style={{
                          position: 'relative',
                          width: frozenColWidth,
                          height: frozenRowHeight,
                        }}
                      >
                        {Array.from({ length: frozenRows }, (_, r) => {
                          let rowTop = 0;
                          for (let rr = 0; rr < r; rr++) rowTop += visibleRowHeight(rr);
                          const rowH = visibleRowHeight(r);
                          return Array.from({ length: frozenCols }, (_, c) => {
                            let colLeft = 0;
                            for (let cc = 0; cc < c; cc++) colLeft += visibleColWidth(cc);
                            const colW = visibleColWidth(c);
                            const active = isCellActive(c, r);
                            const selected = isCellSelected(c, r);
                            const cellIsEditing = active && isEditing;
                            return (
                              <Cell
                                key={`frozen-corner-${c}-${r}`}
                                col={c}
                                row={r}
                                data={getCellData(c, r)}
                                isActive={active}
                                isSelected={selected}
                                isEditing={cellIsEditing}
                                flashScope={activeSheetId}
                                sortMotion={getSortMotionProps(c, r)}
                                conditionalStyle={getCfStyle(c, r)}
                                left={colLeft}
                                top={rowTop}
                                width={colW}
                                height={rowH}
                                onMouseDown={handleCellMouseDown}
                                onDoubleClick={handleCellDoubleClick}
                                {...getValidationUi(c, r)}
                                onCheckboxToggle={handleCheckboxToggle}
                                onDropdownOpen={handleDropdownOpen}
                              />
                            );
                          });
                        })}
                      </div>
                    </div>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const actualRow = visibleRowIndices[virtualRow.index];
                    return virtualCols.map((virtualCol) => {
                      const col = visibleColIndices[virtualCol.index];
                      const row = actualRow;

                      const mergeInfo: MergeInfo | undefined = getMergeInfo(col, row);

                      // Skip non-anchor merge cells (they are covered by the anchor)
                      if (mergeInfo && mergeInfo.colSpan === 0 && mergeInfo.rowSpan === 0) {
                        return null;
                      }

                      const active = isCellActive(col, row);
                      const selected = isCellSelected(col, row);

                      const cellIsEditing = active && isEditing;

                      // For anchor merge cells, compute expanded width/height
                      let cellWidth = virtualCol.size;
                      let cellHeight = virtualRow.size;
                      if (mergeInfo && mergeInfo.colSpan > 1) {
                        cellWidth = 0;
                        for (let c = col; c < col + mergeInfo.colSpan; c++) {
                          cellWidth += visibleColWidth(c);
                        }
                      }
                      if (mergeInfo && mergeInfo.rowSpan > 1) {
                        cellHeight = 0;
                        for (let r = row; r < row + mergeInfo.rowSpan; r++) {
                          cellHeight += visibleRowHeight(r);
                        }
                      }

                      const cellData = getCellData(col, row);
                      const ck = cellKey(col, row);
                      const slConfig = sparklineMap.get(ck);
                      const slValues = slConfig
                        ? getSparklineValues(slConfig.dataRange)
                        : undefined;
                      const slGroupScale = slConfig?.groupId
                        ? sparklineGroupScales.get(slConfig.groupId)
                        : undefined;
                      const overflowWidth = computeOverflowWidth(col, row, cellWidth);

                      return (
                        <Cell
                          key={`${virtualCol.key}-${virtualRow.key}`}
                          col={col}
                          row={row}
                          data={cellData}
                          isActive={active}
                          isSelected={selected}
                          isEditing={cellIsEditing}
                          flashScope={activeSheetId}
                          sortMotion={getSortMotionProps(col, row)}
                          conditionalStyle={getCfStyle(col, row)}
                          left={virtualCol.start}
                          top={virtualRow.start}
                          width={cellWidth}
                          height={cellHeight}
                          onMouseDown={handleCellMouseDown}
                          onDoubleClick={handleCellDoubleClick}
                          onContextMenu={handleCellContextMenu}
                          mergeInfo={mergeInfo}
                          hasComment={!!cellData?.comment}
                          onMouseEnter={handleCellMouseEnter}
                          onMouseLeave={handleCellMouseLeave}
                          sparklineConfig={slConfig}
                          sparklineValues={slValues}
                          sparklineGroupScale={slGroupScale}
                          overflowWidth={overflowWidth}
                          {...getValidationUi(col, row)}
                          onCheckboxToggle={handleCheckboxToggle}
                          onDropdownOpen={handleDropdownOpen}
                          activeOutline={false}
                        />
                      );
                    });
                  })}
                  {/* Gliding selection cursor (keyed by sheet so switching sheets doesn't animate across) */}
                  {cursorRects.range && (
                    <SelectionCursor
                      key={`range-${activeSheetId}`}
                      rect={cursorRects.range}
                      variant="range"
                    />
                  )}
                  {cursorRects.active && (
                    <SelectionCursor
                      key={`active-${activeSheetId}`}
                      rect={cursorRects.active}
                      variant="active"
                    />
                  )}
                  {precedentArrows && (
                    <PrecedentArrows
                      key={precedentArrows.key}
                      sources={precedentArrows.sources}
                      target={precedentArrows.target}
                    />
                  )}
                  {recalcHeatmap && (
                    <RecalcHeatmap sheetId={activeSheetId} rectFor={heatmapRectFor} />
                  )}
                </div>
              </div>

              {/* Persistent cell editor: always mounted (nav mode = invisible but focused, so it
              can catch direct typing/IME), positioned at the active cell using the same
              content-space-rect-minus-scroll math the other cell-position overlays below use.
              A merged/frozen cell is handled the same way its <Cell> above is: expand for the
              merge span, and only subtract the scroll offset the cell's own pane still scrolls with. */}
              {(() => {
                const { col: editCol, row: editRow } = resolveMergeAnchor(
                  activeCell.col,
                  activeCell.row,
                  getMergeInfo,
                );
                const editMergeInfo = getMergeInfo(editCol, editRow);
                let cellW = visibleColWidth(editCol);
                let cellH = visibleRowHeight(editRow);
                if (editMergeInfo && editMergeInfo.colSpan > 1) {
                  cellW = 0;
                  for (let c = editCol; c < editCol + editMergeInfo.colSpan; c++)
                    cellW += visibleColWidth(c);
                }
                if (editMergeInfo && editMergeInfo.rowSpan > 1) {
                  cellH = 0;
                  for (let r = editRow; r < editRow + editMergeInfo.rowSpan; r++)
                    cellH += visibleRowHeight(r);
                }

                let contentLeft = 0;
                for (let c = 0; c < editCol; c++) contentLeft += visibleColWidth(c);
                let contentTop = 0;
                for (let r = 0; r < editRow; r++) contentTop += visibleRowHeight(r);

                const inFrozenCol = editCol < frozenCols;
                const inFrozenRow = editRow < frozenRows;
                const scrollLeft = inFrozenCol ? 0 : (scrollContainerRef.current?.scrollLeft ?? 0);
                const scrollTop = inFrozenRow ? 0 : (scrollContainerRef.current?.scrollTop ?? 0);

                const screenLeft = contentLeft - scrollLeft + dynamicRowHeaderWidth;
                const screenTop = contentTop - scrollTop + dynamicColHeaderHeight;

                const editCellStyle = activeCellData?.style;
                const editorWrapText = !!editCellStyle?.wrapText;

                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: screenLeft,
                      top: screenTop,
                      width: cellW,
                      height: cellH,
                      zIndex: isEditing ? 35 : -1,
                      pointerEvents: isEditing ? 'auto' : 'none',
                    }}
                  >
                    <CellEditor
                      readOnly={!autosaveRestored}
                      ref={cellEditorRef}
                      isEditing={isEditing}
                      value={isEditing ? editValue : ''}
                      onChange={handleCellEditorChange}
                      onDirectInput={startDirectInput}
                      onCompositionStart={handleCompositionStart}
                      onKeyDown={handleCellEditorKeyDown}
                      rect={{ left: 0, top: 0, width: cellW, height: cellH }}
                      wrapText={editorWrapText}
                      style={{
                        fontFamily: editCellStyle?.fontFamily ?? DEFAULT_CELL_FONT_FAMILY,
                        fontSize: editCellStyle?.fontSize ? `${editCellStyle.fontSize}pt` : '13px',
                        fontWeight: editCellStyle?.bold ? 'bold' : undefined,
                        fontStyle: editCellStyle?.italic ? 'italic' : undefined,
                        color: editCellStyle?.textColor ?? undefined,
                        textAlign: editCellStyle?.textAlign ?? 'left',
                      }}
                    />
                    {isEditing && cellSuggestions.length > 0 && cellEditorHasFocus && (
                      <Autocomplete
                        suggestions={cellSuggestions}
                        selectedIndex={cellSuggestionIndex}
                        onSelect={handleCellSuggestionSelect}
                      />
                    )}
                    {isEditing &&
                      cellSuggestions.length === 0 &&
                      cellEditorHasFocus &&
                      cellEditorCaret !== null && (
                        <FunctionHint value={editValue} caret={cellEditorCaret} />
                      )}
                  </div>
                );
              })()}

              {/* Fill Handle */}
              {fillHandleInfo && !isEditing && (
                <div
                  data-testid="fill-handle"
                  style={{
                    position: 'absolute',
                    left:
                      fillHandleInfo.left -
                      (scrollContainerRef.current?.scrollLeft ?? 0) +
                      dynamicRowHeaderWidth,
                    top:
                      fillHandleInfo.top -
                      (scrollContainerRef.current?.scrollTop ?? 0) +
                      dynamicColHeaderHeight,
                    width: 7,
                    height: 7,
                    backgroundColor: 'var(--color-accent-selection)',
                    border: '1px solid white',
                    cursor: 'crosshair',
                    zIndex: 30,
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={handleFillHandleMouseDown}
                  onDoubleClick={handleFillHandleDoubleClick}
                />
              )}

              {/* Fill Preview Highlight */}
              {fillPreviewRange &&
                scrollContainerRef.current &&
                (() => {
                  const el = scrollContainerRef.current;
                  const rect = getRangePixelRect(
                    fillPreviewRange.startCol,
                    fillPreviewRange.endCol,
                    fillPreviewRange.startRow,
                    fillPreviewRange.endRow,
                    visibleColWidth,
                    visibleRowHeight,
                  );
                  return (
                    <div
                      data-testid="fill-preview"
                      style={{
                        position: 'absolute',
                        left: rect.left - el.scrollLeft + dynamicRowHeaderWidth,
                        top: rect.top - el.scrollTop + dynamicColHeaderHeight,
                        width: rect.width,
                        height: rect.height,
                        backgroundColor: 'var(--color-accent-selection)',
                        opacity: 0.1,
                        pointerEvents: 'none',
                        zIndex: 29,
                      }}
                    />
                  );
                })()}

              {/* Copy/cut marching-ants overlay (hidden if the clipboard was copied from a different sheet) */}
              {hasClipboard &&
                clipboardRange &&
                scrollContainerRef.current &&
                clipboardSourceSheetIdRef.current === activeSheetId &&
                (() => {
                  const el = scrollContainerRef.current;
                  const rect = getRangePixelRect(
                    clipboardRange.start.col,
                    clipboardRange.end.col,
                    clipboardRange.start.row,
                    clipboardRange.end.row,
                    visibleColWidth,
                    visibleRowHeight,
                  );
                  const x = rect.left - el.scrollLeft + dynamicRowHeaderWidth;
                  const y = rect.top - el.scrollTop + dynamicColHeaderHeight;
                  return (
                    <svg
                      key={`${clipboardRange.start.col},${clipboardRange.start.row}:${clipboardRange.end.col},${clipboardRange.end.row}`}
                      style={{
                        position: 'absolute',
                        left: x,
                        top: y,
                        width: rect.width,
                        height: rect.height,
                        pointerEvents: 'none',
                        zIndex: 29,
                        overflow: 'visible',
                      }}
                    >
                      <rect
                        className="copy-flash"
                        x={0}
                        y={0}
                        width={rect.width}
                        height={rect.height}
                        fill="var(--color-accent-selection)"
                      />
                      <rect
                        className="marching-ants"
                        x={1}
                        y={1}
                        width={Math.max(0, rect.width - 2)}
                        height={Math.max(0, rect.height - 2)}
                        fill="none"
                        stroke="var(--color-accent-selection)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    </svg>
                  );
                })()}

              {/* Formula Reference Highlights (colored per reference) */}
              {formulaRefRects.length > 0 &&
                scrollContainerRef.current &&
                formulaRefRects.map((rect, i) => {
                  const el = scrollContainerRef.current!;
                  const color = REF_COLORS[i % REF_COLORS.length];
                  const x = rect.left - el.scrollLeft + dynamicRowHeaderWidth;
                  const y = rect.top - el.scrollTop + dynamicColHeaderHeight;
                  return (
                    <div key={`fref-${i}`}>
                      <div
                        style={{
                          position: 'absolute',
                          left: x,
                          top: y,
                          width: rect.width,
                          height: rect.height,
                          backgroundColor: color,
                          opacity: 0.1,
                          pointerEvents: 'none',
                          zIndex: 29,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          left: x,
                          top: y,
                          width: rect.width,
                          height: rect.height,
                          border: `2px solid ${color}`,
                          pointerEvents: 'none',
                          zIndex: 29,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  );
                })}

              {/* Chart Overlay */}
              {(() => {
                const charts = getCharts();
                if (charts.length === 0) return null;
                return (
                  <Suspense fallback={null}>
                    <ChartOverlay
                      charts={charts}
                      getCellData={getCellData}
                      version={version}
                      onMove={(id, x, y) => updateChart(id, { x, y })}
                      onResize={(id, w, h) => updateChart(id, { width: w, height: h })}
                      onDelete={handleDeleteChart}
                      onEdit={handleEditChart}
                    />
                  </Suspense>
                );
              })()}
            </div>
            {/* end zoom wrapper */}

            {/* Filter buttons: one per column of the active filter's header row, positioned over
              that (currently on-screen) header cell via the same data-col/data-row lookup
              CommentTooltip uses, so Cell.tsx doesn't need its own filter-button rendering. */}
            {filterRange &&
              Array.from(
                { length: filterRange.endCol - filterRange.startCol + 1 },
                (_, i) => filterRange.startCol + i,
              ).map((col) => {
                if (typeof document === 'undefined') return null;
                const el = document.querySelector(
                  `[data-col="${col}"][data-row="${filterRange.startRow}"]`,
                );
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const isFiltered = filterState.has(col) || filterConditions[col] !== undefined;
                return (
                  <button
                    key={`filter-btn-${col}`}
                    type="button"
                    data-testid={`filter-button-${col}`}
                    className={`fixed z-30 text-[9px] leading-none rounded px-0.5 ${isFiltered ? 'text-accent-selection' : 'text-text-primary/40 hover:text-text-primary/70'}`}
                    style={{ left: rect.right - 14, top: rect.top + rect.height / 2 - 5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterDropdownCol((prev) => (prev === col ? null : col));
                    }}
                    title="フィルター"
                  >
                    {isFiltered ? '▼' : '▽'}
                  </button>
                );
              })}

            {/* Filter Menu */}
            {filterRange &&
              filterDropdownCol !== null &&
              (() => {
                const el =
                  typeof document !== 'undefined'
                    ? document.querySelector(
                        `[data-col="${filterDropdownCol}"][data-row="${filterRange.startRow}"]`,
                      )
                    : null;
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return (
                  <FilterMenu
                    colIndex={filterDropdownCol}
                    values={getUniqueValuesForColumn(filterDropdownCol)}
                    selectedValues={filterState.get(filterDropdownCol)}
                    condition={filterConditions[filterDropdownCol]}
                    onClose={() => setFilterDropdownCol(null)}
                    onApply={(values, condition) =>
                      handleFilterMenuApply(filterDropdownCol, values, condition)
                    }
                    onSortAsc={() => {
                      sortFilterRangeByColumn(filterDropdownCol, true);
                      setFilterDropdownCol(null);
                    }}
                    onSortDesc={() => {
                      sortFilterRangeByColumn(filterDropdownCol, false);
                      setFilterDropdownCol(null);
                    }}
                    style={{ position: 'fixed', left: rect.left, top: rect.bottom + 2 }}
                  />
                );
              })()}

            {/* Drop overlay */}
            <DropOverlay visible={isDragging} />
          </div>

          {/* Conditional format / data validation side panel (docked, shrinks the grid area) */}
          {sidePanel === 'conditionalFormat' && (
            <SidePanel title="条件付き書式" onClose={() => setSidePanel(null)}>
              <Suspense fallback={null}>
                <ConditionalFormatPanel
                  rules={conditionalFormatRules}
                  onAddRule={addConditionalFormatRule}
                  onUpdateRule={updateConditionalFormatRule}
                  onDeleteRule={deleteConditionalFormatRule}
                  defaultRange={{
                    startCol: selectionRange
                      ? Math.min(selectionRange.start.col, selectionRange.end.col)
                      : activeCell.col,
                    startRow: selectionRange
                      ? Math.min(selectionRange.start.row, selectionRange.end.row)
                      : activeCell.row,
                    endCol: selectionRange
                      ? Math.max(selectionRange.start.col, selectionRange.end.col)
                      : activeCell.col,
                    endRow: selectionRange
                      ? Math.max(selectionRange.start.row, selectionRange.end.row)
                      : activeCell.row,
                  }}
                />
              </Suspense>
            </SidePanel>
          )}
          {sidePanel === 'validation' && (
            <SidePanel title="データの入力規則" onClose={() => setSidePanel(null)}>
              <Suspense fallback={null}>
                <DataValidationPanel
                  cells={getDataMap()}
                  version={version}
                  onSetRule={setValidationRule}
                  initialView={validationPanelNewOnOpen ? 'new' : 'list'}
                  defaultRange={{
                    startCol: selectionRange
                      ? Math.min(selectionRange.start.col, selectionRange.end.col)
                      : activeCell.col,
                    startRow: selectionRange
                      ? Math.min(selectionRange.start.row, selectionRange.end.row)
                      : activeCell.row,
                    endCol: selectionRange
                      ? Math.max(selectionRange.start.col, selectionRange.end.col)
                      : activeCell.col,
                    endRow: selectionRange
                      ? Math.max(selectionRange.start.row, selectionRange.end.row)
                      : activeCell.row,
                  }}
                />
              </Suspense>
            </SidePanel>
          )}
          {sidePanel === 'chart' &&
            editingChartId &&
            (() => {
              const editingChart = getCharts().find((c) => c.id === editingChartId);
              if (!editingChart) return null;
              return (
                <SidePanel title="グラフエディタ" onClose={handleCloseChartEditor}>
                  <Suspense fallback={null}>
                    <ChartEditorPanel
                      key={editingChart.id}
                      chart={editingChart}
                      onUpdate={(updates) => updateChart(editingChart.id, updates)}
                      getCellData={getCellData}
                      version={version}
                    />
                  </Suspense>
                </SidePanel>
              );
            })()}
        </div>

        {/* Sheet Tabs */}
        <SheetTabs
          sheets={sheets}
          activeSheetId={activeSheetId}
          onSelectSheet={handleSheetSelect}
          onAddSheet={addSheet}
          onDeleteSheet={handleDeleteSheet}
          onRenameSheet={handleRenameSheet}
          onDuplicateSheet={handleDuplicateSheet}
          onMoveSheet={moveSheet}
          onSetTabColor={setSheetTabColor}
          onSetSheetHidden={setSheetHidden}
        />

        {/* Status Bar */}
        <StatusBar
          activeCell={activeCell}
          selectionRange={selectionRange}
          getCellData={getCellData}
          getCells={getDataMap}
          version={version}
        />

        {/* Named Range Dialog */}
        {showNamedRangeDialog && (
          <Suspense fallback={null}>
            <NamedRangeDialog
              visible={showNamedRangeDialog}
              onClose={() => setShowNamedRangeDialog(false)}
              namedRanges={namedRanges}
              onAdd={addNamedRange}
              onUpdate={updateNamedRange}
              onDelete={deleteNamedRange}
              currentSheetId={activeSheetId}
              sheets={sheets.map((s) => ({ id: s.id, name: s.name }))}
            />
          </Suspense>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            menu={contextMenu}
            onClose={closeContextMenu}
            onInsertBefore={() => {
              const count = contextMenu.rangeEnd - contextMenu.rangeStart + 1;
              if (contextMenu.type === 'column') {
                handleInsertColumns(contextMenu.rangeStart, count, 'before');
              } else {
                handleInsertRows(contextMenu.rangeStart, count, 'before');
              }
            }}
            onInsertAfter={() => {
              const count = contextMenu.rangeEnd - contextMenu.rangeStart + 1;
              if (contextMenu.type === 'column') {
                handleInsertColumns(contextMenu.rangeEnd, count, 'after');
              } else {
                handleInsertRows(contextMenu.rangeEnd, count, 'after');
              }
            }}
            onDelete={() => {
              if (contextMenu.type === 'column') {
                handleDeleteColumns(contextMenu.rangeStart, contextMenu.rangeEnd);
              } else {
                handleDeleteRows(contextMenu.rangeStart, contextMenu.rangeEnd);
              }
            }}
            canInsert={
              contextMenu.type === 'column' ? colCount < MAX_COL_COUNT : rowCount < MAX_ROW_COUNT
            }
            onHide={() => {
              if (contextMenu.type === 'column') {
                hideCols(contextMenu.rangeStart, contextMenu.rangeEnd);
              } else {
                hideRows(contextMenu.rangeStart, contextMenu.rangeEnd);
              }
            }}
            onUnhide={() => {
              if (contextMenu.type === 'column') {
                unhideCols(contextMenu.rangeStart, contextMenu.rangeEnd);
              } else {
                unhideRows(contextMenu.rangeStart, contextMenu.rangeEnd);
              }
            }}
            canUnhide={(() => {
              const hidden = contextMenu.type === 'column' ? hiddenColSet : hiddenRowSet;
              for (let i = contextMenu.rangeStart; i <= contextMenu.rangeEnd; i++) {
                if (hidden.has(i)) return true;
              }
              return false;
            })()}
            onGroup={() => {
              if (contextMenu.type === 'column') {
                addColGroup(contextMenu.index, contextMenu.index);
              } else {
                addRowGroup(contextMenu.index, contextMenu.index);
              }
            }}
            onUngroup={() => {
              const groups = contextMenu.type === 'column' ? colGroups : rowGroups;
              const idx = contextMenu.index;
              const group = groups.find((g) => g.start <= idx && idx <= g.end);
              if (group) {
                if (contextMenu.type === 'column') {
                  removeColGroup(group.id);
                } else {
                  removeRowGroup(group.id);
                }
              }
            }}
            canUngroup={(() => {
              const groups = contextMenu.type === 'column' ? colGroups : rowGroups;
              const idx = contextMenu.index;
              return groups.some((g) => g.start <= idx && idx <= g.end);
            })()}
            onSortAsc={
              contextMenu.type === 'column'
                ? () => sortSheetByColumn(contextMenu.index, true)
                : undefined
            }
            onSortDesc={
              contextMenu.type === 'column'
                ? () => sortSheetByColumn(contextMenu.index, false)
                : undefined
            }
          />
        )}

        {/* Cell Context Menu */}
        {cellContextMenu && (
          <CellContextMenu
            menu={cellContextMenu}
            onClose={() => setCellContextMenu(null)}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onInsertRowAbove={() => handleInsertRow(cellContextMenu.row, 'before')}
            onInsertRowBelow={() => handleInsertRow(cellContextMenu.row, 'after')}
            onInsertColLeft={() => handleInsertColumn(cellContextMenu.col, 'before')}
            onInsertColRight={() => handleInsertColumn(cellContextMenu.col, 'after')}
            onDeleteRow={() => handleDeleteRow(cellContextMenu.row)}
            onDeleteCol={() => handleDeleteColumn(cellContextMenu.col)}
            onInsertDropdown={handleInsertDropdown}
            onOpenConditionalFormat={() => setSidePanel('conditionalFormat')}
            onOpenDataValidation={() => {
              setValidationPanelNewOnOpen(false);
              setSidePanel('validation');
            }}
            onAddComment={() => {
              const comment = window.prompt('コメントを入力してください:');
              if (comment !== null) {
                setCellComment(cellContextMenu.col, cellContextMenu.row, comment || undefined);
              }
            }}
            hasComment={!!getCellData(cellContextMenu.col, cellContextMenu.row)?.comment}
            onDeleteComment={() =>
              setCellComment(cellContextMenu.col, cellContextMenu.row, undefined)
            }
            hyperlink={getCellData(cellContextMenu.col, cellContextMenu.row)?.hyperlink}
            onOpenLink={() => {
              const link = getCellData(cellContextMenu.col, cellContextMenu.row)?.hyperlink;
              if (link) window.open(link.url, '_blank', 'noopener,noreferrer');
            }}
            onEditLink={() => {
              // Focus formula bar for editing
              startEditing();
            }}
            onRemoveLink={() => {
              const cd = getCellData(cellContextMenu.col, cellContextMenu.row);
              if (cd?.hyperlink) {
                setCellValue(cellContextMenu.col, cellContextMenu.row, cd.hyperlink.label);
              }
            }}
          />
        )}

        {/* Comment Tooltip */}
        {hoveredCell &&
          (() => {
            const cd = getCellData(hoveredCell.col, hoveredCell.row);
            if (!cd?.comment) return null;
            const el = document.querySelector(
              `[data-col="${hoveredCell.col}"][data-row="${hoveredCell.row}"]`,
            );
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return <CommentTooltip comment={cd.comment} x={rect.right} y={rect.top} />;
          })()}

        {/* Data validation: list dropdown (portal, viewport-clamped) */}
        {validationDropdown &&
          (() => {
            const rule = getCellData(validationDropdown.col, validationDropdown.row)?.validation;
            if (!rule || rule.type !== 'list') return null;
            const currentValue =
              getCellData(validationDropdown.col, validationDropdown.row)?.rawValue ?? '';
            return (
              <ValidationDropdown
                options={getListOptions(rule, validationCtx)}
                currentValue={currentValue}
                x={validationDropdown.rect.left}
                y={validationDropdown.rect.bottom}
                onSelect={handleDropdownSelect}
                onClose={handleDropdownClose}
              />
            );
          })()}

        {/* Data validation: help text tooltip for the active cell */}
        {!isEditing &&
          (() => {
            const rule = getCellData(activeCell.col, activeCell.row)?.validation;
            if (!rule?.helpText) return null;
            const el = document.querySelector(
              `[data-col="${activeCell.col}"][data-row="${activeCell.row}"]`,
            );
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return (
              <div
                className="fixed z-50 max-w-xs px-2 py-1.5 text-xs bg-yellow-100 text-text-primary border border-grid-line rounded shadow-lg pointer-events-none"
                style={{ left: rect.left, top: rect.bottom + 4 }}
              >
                {rule.helpText}
              </div>
            );
          })()}

        {/* Sparkline Dialog */}
        {showSparklineDialog && (
          <Suspense fallback={null}>
            <SparklineDialog
              visible={showSparklineDialog}
              onClose={() => setShowSparklineDialog(false)}
              onConfirm={(config) => addSparkline(config)}
              defaultLocationCell={cellKey(activeCell.col, activeCell.row)}
            />
          </Suspense>
        )}

        {/* Pivot Table Dialog */}
        {showPivotTableDialog && (
          <Suspense fallback={null}>
            <PivotTableDialog
              visible={showPivotTableDialog}
              onClose={() => setShowPivotTableDialog(false)}
              sheets={sheets}
              activeSheetId={activeSheetId}
              getCellData={getCellData}
              onCreatePivot={handleCreatePivot}
            />
          </Suspense>
        )}

        {/* Function Wizard Dialog */}
        {showFunctionWizard && (
          <Suspense fallback={null}>
            <FunctionWizardDialog
              visible={showFunctionWizard}
              onClose={() => setShowFunctionWizard(false)}
              onInsertFormula={handleInsertFormula}
              evaluateFormula={evaluateFormulaFn}
            />
          </Suspense>
        )}

        {/* Print Preview Dialog */}
        {showPrintPreview && (
          <Suspense fallback={null}>
            <PrintPreviewDialog
              visible={showPrintPreview}
              onClose={() => setShowPrintPreview(false)}
              getCellData={getCellData}
              colWidths={getColWidth}
              rowHeights={getRowHeight}
              dataRange={{
                startCol: selectionRange
                  ? Math.min(selectionRange.start.col, selectionRange.end.col)
                  : 0,
                endCol: selectionRange
                  ? Math.max(selectionRange.start.col, selectionRange.end.col)
                  : colCount - 1,
                startRow: selectionRange
                  ? Math.min(selectionRange.start.row, selectionRange.end.row)
                  : 0,
                endRow: selectionRange
                  ? Math.max(selectionRange.start.row, selectionRange.end.row)
                  : rowCount - 1,
              }}
              sheetName={activeSheet.name}
              documentTitle={title}
            />
          </Suspense>
        )}

        {/* Developer tools (⌘/Ctrl+Shift+K or 表示 menu) */}
        {showDevTools && (
          <Suspense fallback={null}>
            <DevTools host={devToolsHost} onClose={closeDevTools} />
          </Suspense>
        )}

        {/* Keyboard Shortcuts Dialog */}
        {showShortcutsDialog && (
          <Suspense fallback={null}>
            <ShortcutsDialog
              visible={showShortcutsDialog}
              onClose={() => setShowShortcutsDialog(false)}
            />
          </Suspense>
        )}

        {/* Sort Range Dialog */}
        {showSortRangeDialog && (
          <Suspense fallback={null}>
            <SortRangeDialog
              visible={showSortRangeDialog}
              onClose={() => setShowSortRangeDialog(false)}
              defaultRangeText={(() => {
                const sel = getNormalizedSelection();
                return `${cellKey(sel.start.col, sel.start.row)}:${cellKey(sel.end.col, sel.end.row)}`;
              })()}
              getCellText={(col, row) => getCellData(col, row)?.displayValue ?? ''}
              onConfirm={handleConfirmSortRange}
            />
          </Suspense>
        )}

        {/* Remove Duplicates Dialog */}
        {showRemoveDuplicatesDialog && (
          <Suspense fallback={null}>
            <RemoveDuplicatesDialog
              visible={showRemoveDuplicatesDialog}
              onClose={() => setShowRemoveDuplicatesDialog(false)}
              defaultRangeText={(() => {
                const sel = getNormalizedSelection();
                return `${cellKey(sel.start.col, sel.start.row)}:${cellKey(sel.end.col, sel.end.row)}`;
              })()}
              getCellText={(col, row) => getCellData(col, row)?.displayValue ?? ''}
              onConfirm={handleConfirmRemoveDuplicates}
            />
          </Suspense>
        )}

        {/* Split-to-columns delimiter popover */}
        {splitPopover &&
          (() => {
            const el =
              typeof document !== 'undefined'
                ? document.querySelector(
                    `[data-col="${splitPopover.col}"][data-row="${splitPopover.startRow}"]`,
                  )
                : null;
            const rect = el?.getBoundingClientRect();
            return (
              <div
                className="fixed z-40 glass-surface rounded-xl p-2 text-xs text-text-primary animate-fade-in-scale"
                style={{ left: rect ? rect.left : 100, top: rect ? rect.bottom + 4 : 100 }}
                data-testid="split-delimiter-popover"
              >
                <label className="flex items-center gap-2">
                  区切り文字:
                  <select
                    value={splitPopover.mode}
                    onChange={(e) =>
                      handleChangeSplitDelimiter(
                        e.target.value as typeof splitPopover.mode,
                        splitPopover.custom,
                      )
                    }
                    className="h-6 px-1 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                  >
                    <option value="auto">自動検出</option>
                    <option value=",">カンマ</option>
                    <option value=";">セミコロン</option>
                    <option value=".">ピリオド</option>
                    <option value=" ">スペース</option>
                    <option value="custom">カスタム</option>
                  </select>
                  {splitPopover.mode === 'custom' && (
                    <input
                      type="text"
                      value={splitPopover.custom}
                      onChange={(e) => handleChangeSplitDelimiter('custom', e.target.value)}
                      className="w-12 h-6 px-1 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                      placeholder="区切り"
                    />
                  )}
                  <button
                    type="button"
                    className="text-text-primary/50 hover:text-text-primary"
                    onClick={() => setSplitPopover(null)}
                  >
                    &times;
                  </button>
                </label>
              </div>
            );
          })()}

        {/* Toast notifications (sort errors, duplicate removal results, rejected validation input) */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </SpreadsheetContext.Provider>
  );
}
