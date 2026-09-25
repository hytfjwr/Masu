import { createContext, useContext } from 'react';
import type {
  CellPosition,
  CellStyle,
  ConditionalFormatRule,
  FilterRange,
  GroupRange,
  MergeInfo,
  NamedRange,
  PivotTableConfig,
  SheetData,
  ValidationRule,
} from '../types/grid';
import type { SparklineConfig } from '../types/sparkline';
import type { ChartData } from '../types/chart';
import type { PrintSettings } from '../types/print';

export interface SpreadsheetActions {
  importFile: (file: File) => void;
  exportCSV: () => void;
  exportJSON: () => void;
  exportXLSX: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  setCellStyle: (style: Partial<CellStyle>) => void;
  activeCellStyle: CellStyle | undefined;
  toggleStrikethrough: () => void;
  clearFormatting: () => void;
  insertColumn: (colIndex: number, position: 'before' | 'after') => void;
  deleteColumn: (colIndex: number) => void;
  insertRow: (rowIndex: number, position: 'before' | 'after') => void;
  deleteRow: (rowIndex: number) => void;
  hideRows: (start: number, end: number) => void;
  unhideRows: (start: number, end: number) => void;
  hideCols: (start: number, end: number) => void;
  unhideCols: (start: number, end: number) => void;
  colCount: number;
  rowCount: number;
  // Multi-sheet
  sheets: SheetData[];
  activeSheetId: string;
  addSheet: () => void;
  deleteSheet: (sheetId: string) => boolean;
  renameSheet: (sheetId: string, newName: string) => boolean;
  setActiveSheet: (sheetId: string) => void;
  duplicateSheet: (sheetId: string) => string | null;
  // Search & replace
  openSearch: (options?: { replace?: boolean }) => void;
  // Freeze pane
  frozenRows: number;
  frozenCols: number;
  setFrozenRows: (count: number) => void;
  setFrozenCols: (count: number) => void;
  // Conditional format
  conditionalFormatRules: ConditionalFormatRule[];
  addConditionalFormatRule: (rule: Omit<ConditionalFormatRule, 'id'>) => void;
  updateConditionalFormatRule: (ruleId: string, updates: Partial<ConditionalFormatRule>) => void;
  deleteConditionalFormatRule: (ruleId: string) => void;
  openConditionalFormatDialog: () => void;
  // Native (.tabula.json) save/open
  saveTabula: () => void;
  openTabula: () => void;
  // Cell merge
  mergeCells: () => void;
  unmergeCells: () => void;
  canMerge: boolean;
  isMerged: boolean;
  getMergeInfo: (col: number, row: number) => MergeInfo | undefined;
  // Cell comments
  setCellComment: (col: number, row: number, comment: string | undefined) => void;
  // Data validation
  setValidationRule: (positions: CellPosition[], rule: ValidationRule | undefined) => void;
  openValidationDialog: () => void;
  /** 挿入 > チェックボックス: set a checkbox validation rule on the current selection immediately. */
  insertCheckbox: () => void;
  /** 挿入 > プルダウン: open the data validation panel pre-set to the プルダウン condition. */
  insertDropdown: () => void;
  // Charts
  charts: ChartData[];
  addChart: (chart: ChartData) => void;
  updateChart: (chartId: string, updates: Partial<ChartData>) => void;
  deleteChart: (chartId: string) => void;
  openChartDialog: () => void;
  // Active cell (for insert menu)
  activeCell: CellPosition;
  // Paste options
  pasteValuesOnly: () => void;
  pasteFormatOnly: () => void;
  pasteTranspose: () => void;
  // Named ranges
  namedRanges: NamedRange[];
  addNamedRange: (name: string, range: string, refSheetId?: string) => boolean;
  updateNamedRange: (
    oldName: string,
    newName: string,
    range: string,
    refSheetId?: string,
  ) => boolean;
  deleteNamedRange: (name: string) => boolean;
  openNamedRangeDialog: () => void;
  // スパークライン
  sparklines: SparklineConfig[];
  addSparkline: (config: SparklineConfig) => void;
  updateSparkline: (id: string, updates: Partial<SparklineConfig>) => void;
  deleteSparkline: (id: string) => void;
  openSparklineDialog: () => void;
  // グルーピング
  rowGroups: GroupRange[];
  colGroups: GroupRange[];
  addRowGroup: (start: number, end: number) => boolean;
  addColGroup: (start: number, end: number) => boolean;
  removeRowGroup: (groupId: string) => void;
  removeColGroup: (groupId: string) => void;
  toggleRowGroupCollapse: (groupId: string) => void;
  toggleColGroupCollapse: (groupId: string) => void;
  setRowExpandLevel: (level: number) => void;
  setColExpandLevel: (level: number) => void;
  // 印刷プレビュー
  openPrintPreview: () => void;
  exportPDF: (settings: PrintSettings) => Promise<void>;
  // ピボットテーブル
  pivotTables: PivotTableConfig[];
  addPivotTable: (config: PivotTableConfig) => void;
  updatePivotTable: (id: string, updates: Partial<PivotTableConfig>) => void;
  deletePivotTable: (id: string) => void;
  openPivotTableDialog: () => void;
  refreshPivotTable: (id: string) => void;
  // 関数ウィザード
  openFunctionWizard: () => void;
  evaluateFormula: (formula: string) => string;
  // データ: 並べ替え
  openSortRangeDialog: () => void;
  /** データ menu "シートを並べ替え" (active cell's column, below any frozen rows). */
  sortActiveColumn: (ascending: boolean) => void;
  // データ: フィルタ
  filterRange: FilterRange | undefined;
  toggleFilter: () => void;
  // データ: データクリーンアップ
  openRemoveDuplicatesDialog: () => void;
  trimWhitespace: () => void;
  splitTextToColumnsAction: () => void;
  // ヘルプ
  openShortcutsDialog: () => void;
  // 表示: 開発者ツール
  openDevTools: () => void;
  // ファイル: 新規作成
  newWorkbook: () => void;
}

const defaultActions: SpreadsheetActions = {
  importFile: () => {},
  exportCSV: () => {},
  exportJSON: () => {},
  exportXLSX: () => {},
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
  copy: () => {},
  cut: () => {},
  paste: () => {},
  setCellStyle: () => {},
  activeCellStyle: undefined,
  toggleStrikethrough: () => {},
  clearFormatting: () => {},
  insertColumn: () => {},
  deleteColumn: () => {},
  insertRow: () => {},
  deleteRow: () => {},
  hideRows: () => {},
  unhideRows: () => {},
  hideCols: () => {},
  unhideCols: () => {},
  colCount: 26,
  rowCount: 100,
  // Multi-sheet
  sheets: [],
  activeSheetId: '',
  addSheet: () => {},
  deleteSheet: () => false,
  renameSheet: () => false,
  setActiveSheet: () => {},
  duplicateSheet: () => null,
  // Search
  openSearch: () => {},
  // Freeze pane
  frozenRows: 0,
  frozenCols: 0,
  setFrozenRows: () => {},
  setFrozenCols: () => {},
  // Conditional format
  conditionalFormatRules: [],
  addConditionalFormatRule: () => {},
  updateConditionalFormatRule: () => {},
  deleteConditionalFormatRule: () => {},
  openConditionalFormatDialog: () => {},
  // Native (.tabula.json) save/open
  saveTabula: () => {},
  openTabula: () => {},
  // Cell merge
  mergeCells: () => {},
  unmergeCells: () => {},
  canMerge: false,
  isMerged: false,
  getMergeInfo: () => undefined,
  // Cell comments
  setCellComment: () => {},
  // Data validation
  setValidationRule: () => {},
  openValidationDialog: () => {},
  insertCheckbox: () => {},
  insertDropdown: () => {},
  // Charts
  charts: [],
  addChart: () => {},
  updateChart: () => {},
  deleteChart: () => {},
  openChartDialog: () => {},
  // Active cell
  activeCell: { col: 0, row: 0 },
  // Paste options
  pasteValuesOnly: () => {},
  pasteFormatOnly: () => {},
  pasteTranspose: () => {},
  // Named ranges
  namedRanges: [],
  addNamedRange: () => false,
  updateNamedRange: () => false,
  deleteNamedRange: () => false,
  openNamedRangeDialog: () => {},
  // スパークライン
  sparklines: [],
  addSparkline: () => {},
  updateSparkline: () => {},
  deleteSparkline: () => {},
  openSparklineDialog: () => {},
  // グルーピング
  rowGroups: [],
  colGroups: [],
  addRowGroup: () => false,
  addColGroup: () => false,
  removeRowGroup: () => {},
  removeColGroup: () => {},
  toggleRowGroupCollapse: () => {},
  toggleColGroupCollapse: () => {},
  setRowExpandLevel: () => {},
  setColExpandLevel: () => {},
  // 印刷プレビュー
  openPrintPreview: () => {},
  exportPDF: async () => {},
  // ピボットテーブル
  pivotTables: [],
  addPivotTable: () => {},
  updatePivotTable: () => {},
  deletePivotTable: () => {},
  openPivotTableDialog: () => {},
  refreshPivotTable: () => {},
  // 関数ウィザード
  openFunctionWizard: () => {},
  evaluateFormula: () => '',
  // データ: 並べ替え・フィルタ・データクリーンアップ
  openSortRangeDialog: () => {},
  sortActiveColumn: () => {},
  filterRange: undefined,
  toggleFilter: () => {},
  openRemoveDuplicatesDialog: () => {},
  trimWhitespace: () => {},
  splitTextToColumnsAction: () => {},
  // ヘルプ
  openShortcutsDialog: () => {},
  openDevTools: () => {},
  // ファイル: 新規作成
  newWorkbook: () => {},
};

export const SpreadsheetContext = createContext<SpreadsheetActions>(defaultActions);

export function useSpreadsheetActions(): SpreadsheetActions {
  return useContext(SpreadsheetContext);
}
