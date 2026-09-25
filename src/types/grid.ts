import type { ChartData } from './chart';
import type { SparklineConfig } from './sparkline';
import type { PivotTableConfig } from './pivot';

export type { ChartData, ChartType, ChartDataRange } from './chart';
export type { SparklineConfig, SparklineType, SparklineColors } from './sparkline';
export type { PivotTableConfig, PivotValueField, AggregationType } from './pivot';

/** Column-row position in the grid (0-indexed) */
export interface CellPosition {
  col: number;
  row: number;
}

/** A rectangular selection range defined by start and end corners */
export interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

/** Text alignment options */
export type TextAlign = 'left' | 'center' | 'right';

/** Vertical alignment options */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Number format options */
export type NumberFormat =
  | 'auto'
  | 'plainText'
  | 'number'
  | 'currency'
  | 'percent'
  | 'scientific'
  | 'date'
  | 'time'
  | 'datetime'
  | 'custom';

/** Border line style */
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'thick';

/** A single border edge */
export interface BorderEdge {
  style: BorderStyle;
  color: string;
}

/** Borders for all four edges of a cell */
export interface CellBorders {
  top?: BorderEdge;
  right?: BorderEdge;
  bottom?: BorderEdge;
  left?: BorderEdge;
}

/** Visual style for a single cell */
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: TextAlign;
  verticalAlign?: VerticalAlign;
  backgroundColor?: string;
  textColor?: string;
  numberFormat?: NumberFormat;
  /** Custom number format pattern (e.g. "#,##0.00", "yyyy/mm/dd"). Takes precedence over numberFormat presets. */
  numberFormatPattern?: string;
  fontSize?: number;
  fontFamily?: string;
  wrapText?: boolean;
  borders?: CellBorders;
}

/** Merge metadata for a cell participating in a merge */
export interface MergeInfo {
  /** The anchor cell key (top-left of the merge) */
  anchorKey: string;
  /** Number of columns spanned (only meaningful on anchor, 0 for non-anchor) */
  colSpan: number;
  /** Number of rows spanned (only meaningful on anchor, 0 for non-anchor) */
  rowSpan: number;
}

/** Validation rule type */
export type ValidationType =
  | 'list'
  | 'number'
  | 'textLength'
  | 'checkbox'
  | 'date'
  | 'customFormula';

/** Comparison operator for number/date/textLength validation rules */
export type ValidationOperator =
  | 'between'
  | 'notBetween'
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual';

/** Data validation rule for a cell */
export interface ValidationRule {
  type: ValidationType;
  /** Comma-separated list values or range string for list type */
  listValues?: string[];
  /** Minimum value for number/textLength type */
  min?: number;
  /** Maximum value for number/textLength type */
  max?: number;
  /** Error message to display when validation fails */
  errorMessage?: string;
  /** Whether to show dropdown for list type */
  showDropdown?: boolean;
  /** list: dropdown display style ('chip' = rounded value chip, 'arrow' = plain text + arrow). Default 'chip'. */
  dropdownStyle?: 'chip' | 'arrow';
  /** list: source range for the dropdown's options ('A1:A10' / 'Sheet2!A1:A10'). Takes precedence over listValues. */
  listSource?: string;
  /** Comparison operator for number/date/textLength (default 'between', using min/max) */
  operator?: ValidationOperator;
  /** date: comparison value (serial number). 'between' uses dateMin/dateMax, others use dateMin. */
  dateMin?: number;
  dateMax?: number;
  /** customFormula: formula anchored to the top-left of the validated range (leading '=' optional). TRUE = valid. */
  formula?: string;
  /** checkbox: value stored when checked/unchecked (default 'TRUE'/'FALSE') */
  checkedValue?: string;
  uncheckedValue?: string;
  /** true: reject invalid input / false or unset: warn only (Google Sheets default) */
  rejectInvalid?: boolean;
  /** Help text shown while entering a value */
  helpText?: string;
  /** customFormula: top-left of the range the rule is applied to (0-indexed), the anchor for relative references */
  anchor?: { col: number; row: number };
}

/** Data stored for a single cell */
export interface CellData {
  /** Raw value entered by the user */
  rawValue: string;
  /** Display value (computed result for formulas, rawValue otherwise) */
  displayValue: string;
  /** Typed computed value (formula result or parsed plain value). Not serialized; rebuilt on evaluation. */
  computed?: number | string | boolean;
  /** Formula string without the leading '=' (only set for formula cells) */
  formula?: string;
  /** Cell keys this cell depends on (only set for formula cells) */
  dependencies?: string[];
  /** Error code if the formula evaluation failed */
  error?: string;
  /**
   * Why the formula failed to parse (with `error: '#ERROR!'`): message + character range in `formula`
   * (the text without '='). Derived on evaluation, not persisted.
   */
  parseError?: { message: string; start: number; end: number };
  /** Visual style for this cell */
  style?: CellStyle;
  /** Cell comment/note */
  comment?: string;
  /** Data validation rule */
  validation?: ValidationRule;
  /** Spill source cell key (set on spill target cells) */
  spillSource?: string;
  /** Spill extent (set only on the spill origin cell) */
  spillExtent?: { rows: number; cols: number };
  /** Hyperlink metadata (set by HYPERLINK function) */
  hyperlink?: { url: string; label: string };
}

/** Named range definition */
export interface NamedRange {
  name: string;
  /** Optional sheet scope (omit for workbook scope) */
  sheetId?: string;
  /** Range string (e.g. "A1:B10") */
  range: string;
  /** Reference sheet ID for cross-sheet named ranges */
  refSheetId?: string;
}

/** Map of cell key ("A1") to CellData */
export type CellDataMap = Map<string, CellData>;

/** Comparison operator for conditional formatting */
export type ConditionalOperator =
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'equal'
  | 'notEqual'
  | 'between'
  | 'notBetween'
  | 'textContains'
  | 'textNotContains'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'textStartsWith'
  | 'textEndsWith'
  | 'textEquals';

/** The kind of check a conditional format rule performs */
export type ConditionalRuleKind =
  | 'value'
  | 'formula'
  | 'colorScale'
  | 'duplicate'
  | 'unique'
  | 'top'
  | 'bottom'
  | 'aboveAverage'
  | 'belowAverage';

/** A single stop in a color scale gradient */
export interface ColorScalePoint {
  type: 'min' | 'max' | 'number' | 'percent' | 'percentile';
  /** Used when type is 'number' / 'percent' / 'percentile' */
  value?: number;
  /** '#RRGGBB' */
  color: string;
}

/** A single conditional format rule */
export interface ConditionalFormatRule {
  id: string;
  range: {
    startCol: number;
    startRow: number;
    endCol: number;
    endRow: number;
  };
  operator: ConditionalOperator;
  value1: string;
  value2?: string;
  style: Partial<CellStyle>;
  priority: number;
  enabled: boolean;
  /** The kind of rule (omitted = 'value', the existing operator-based check) */
  kind?: ConditionalRuleKind;
  /** kind 'formula': custom formula anchored to the top-left of the range (leading '=' optional) */
  formula?: string;
  /** kind 'colorScale' */
  colorScale?: { min: ColorScalePoint; mid?: ColorScalePoint; max: ColorScalePoint };
  /** kind 'top' / 'bottom': number of items to highlight (percent = true means a percentage) */
  rank?: number;
  percent?: boolean;
}

/** 行/列のグループ範囲 */
export interface GroupRange {
  /** グループID */
  id: string;
  /** 開始インデックス（0-indexed） */
  start: number;
  /** 終了インデックス（0-indexed、inclusive） */
  end: number;
  /** ネストレベル（1, 2, 3） */
  level: number;
  /** 折りたたみ状態 */
  collapsed: boolean;
}

/** Sort direction for a column */
export type SortDirection = 'asc' | 'desc' | 'none';

/** Sort state for a sheet */
export interface SortState {
  col: number;
  direction: SortDirection;
}

/** A single sort key used by range/sheet sort (src/utils/sortRange.ts, useGridData.sortRange) */
export interface SortKey {
  col: number;
  ascending: boolean;
}

/** The rectangular area a "Create filter" defines the header row over. endRow: null = to the used range's end. */
export interface FilterRange {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number | null;
}

/** A single column's condition-based filter (in addition to the existing value-checkbox filterState) */
export interface FilterCondition {
  operator: ConditionalOperator;
  value1?: string;
  value2?: string;
}

/** Data for a single sheet within a workbook */
export interface SheetData {
  id: string;
  name: string;
  cells: CellDataMap;
  colCount: number;
  rowCount: number;
  frozenRows: number;
  frozenCols: number;
  /** @deprecated unused since range/sheet sort replaced the old column-header sort toggle; kept for on-disk compat */
  sortState: SortState;
  filterState: Map<number, Set<string>>;
  /** Snapshot of cell data before sort was applied (for restoring original order) */
  /** @deprecated unused since range/sheet sort no longer needs to restore pre-sort order; kept for on-disk compat */
  preSortData?: CellDataMap;
  /** Header-row area a "Create filter" defines (undefined = no active filter) */
  filterRange?: FilterRange;
  /** Per-column condition-based filters, keyed by column index */
  filterConditions?: Record<number, FilterCondition>;
  /** Conditional format rules for this sheet */
  conditionalFormatRules: ConditionalFormatRule[];
  /** Cell merge metadata: cellKey -> MergeInfo for every cell participating in a merge */
  merges: Map<string, MergeInfo>;
  /** Charts embedded in this sheet */
  charts: ChartData[];
  /** スパークライン設定 */
  sparklines: SparklineConfig[];
  /** 行グループ */
  rowGroups: GroupRange[];
  /** 列グループ */
  colGroups: GroupRange[];
  /** タブの色（'#RRGGBB'） */
  tabColor?: string;
  /** シートを非表示にしているか */
  hidden?: boolean;
  /** 非表示の行（0-indexed、昇順・重複なし） */
  hiddenRows?: number[];
  /** 非表示の列（0-indexed、昇順・重複なし） */
  hiddenCols?: number[];
}

/** Workbook data containing multiple sheets */
export interface WorkbookData {
  sheets: SheetData[];
  activeSheetId: string;
  namedRanges?: NamedRange[];
  pivotTables?: PivotTableConfig[];
  /** ドキュメントタイトル（未設定 = 「無題のスプレッドシート」） */
  title?: string;
}

/** Grid constants */
export const GRID_CONSTANTS = {
  DEFAULT_COL_COUNT: 26,
  DEFAULT_ROW_COUNT: 100,
  MAX_COL_COUNT: 16384, // Excel limit: XFD
  MAX_ROW_COUNT: 1048576, // Excel limit
  DEFAULT_COL_WIDTH: 100,
  DEFAULT_ROW_HEIGHT: 24,
  ROW_HEADER_WIDTH: 50,
  COL_HEADER_HEIGHT: 24,
  OVERSCAN_COUNT: 5,
  /** How many extra rows/cols to add when auto-expanding on scroll edge */
  AUTO_EXPAND_ROWS: 100,
  AUTO_EXPAND_COLS: 26,
} as const;

/** Available font sizes (in pt) */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72] as const;

/** Available font families */
export const FONT_FAMILIES = [
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
] as const;
