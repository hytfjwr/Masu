/**
 * Serializer/Deserializer for the native .masu.json format (also used by autosave; files saved
 * as .tabula.json / .sheetcraft.json before the renames are the same format).
 */

import type {
  CellData,
  CellDataMap,
  CellStyle,
  ConditionalFormatRule,
  FilterCondition,
  FilterRange,
  GroupRange,
  MergeInfo,
  NamedRange,
  PivotTableConfig,
  SheetData,
  ValidationRule,
  WorkbookData,
} from '../types/grid';
import type { SparklineConfig } from '../types/sparkline';
import type { ChartData } from '../types/chart';
import { GRID_CONSTANTS } from '../types/grid';

// --- Serialized types (JSON-safe) ---

interface SerializedCell {
  rawValue: string;
  style?: CellStyle;
  comment?: string;
  validation?: ValidationRule;
  spillSource?: string;
  spillExtent?: { rows: number; cols: number };
  hyperlink?: { url: string; label: string };
}

interface SerializedSheet {
  id: string;
  name: string;
  cells: Record<string, SerializedCell>;
  colCount: number;
  rowCount: number;
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  /** Width/height (px) of columns/rows without an entry above; omitted = app default. */
  defaultColWidth?: number;
  defaultRowHeight?: number;
  frozenRows: number;
  frozenCols: number;
  conditionalFormatRules: ConditionalFormatRule[];
  merges?: Record<string, MergeInfo>;
  charts?: ChartData[];
  sparklines?: SparklineConfig[];
  rowGroups?: GroupRange[];
  colGroups?: GroupRange[];
  tabColor?: string;
  hidden?: boolean;
  hiddenRows?: number[];
  hiddenCols?: number[];
  filterRange?: FilterRange;
  /** Value-checkbox filter (filterState), keyed by column index (as a string), Set -> array. */
  filterState?: Record<string, string[]>;
  filterConditions?: Record<string, FilterCondition>;
}

interface SerializedWorkbook {
  sheets: SerializedSheet[];
  activeSheetId: string;
  namedRanges?: NamedRange[];
  pivotTables?: PivotTableConfig[];
  /** ドキュメントタイトル（未設定 = 「無題のスプレッドシート」） */
  title?: string;
}

export interface NativeFile {
  version: 1;
  createdAt: string;
  updatedAt: string;
  workbook: SerializedWorkbook;
}

/** One sheet's own column widths / row heights (see `sizesBySheet` on SerializeOptions/DeserializeResult). */
export interface SheetSizes {
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  /** Size of columns/rows without an entry above (e.g. an imported xlsx's defaults); omitted = app default. */
  defaultColWidth?: number;
  defaultRowHeight?: number;
}

// --- Serialization ---

function serializeCellDataMap(cells: CellDataMap): Record<string, SerializedCell> {
  const result: Record<string, SerializedCell> = {};
  for (const [key, cell] of cells) {
    // Skip spill target cells (they will be reconstructed during evaluation)
    if (cell.spillSource) continue;
    if (cell.rawValue === '' && !cell.style && !cell.comment && !cell.validation) continue;
    const serialized: SerializedCell = { rawValue: cell.rawValue };
    if (cell.style) {
      serialized.style = { ...cell.style };
    }
    if (cell.comment) {
      serialized.comment = cell.comment;
    }
    if (cell.validation) {
      serialized.validation = { ...cell.validation };
    }
    if (cell.spillExtent) {
      serialized.spillExtent = { ...cell.spillExtent };
    }
    if (cell.hyperlink) {
      serialized.hyperlink = { ...cell.hyperlink };
    }
    result[key] = serialized;
  }
  return result;
}

function serializeSheet(
  sheet: SheetData,
  colWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  defaults?: { defaultColWidth?: number; defaultRowHeight?: number },
): SerializedSheet {
  const colWidthsObj: Record<string, number> = {};
  for (const [k, v] of colWidths) {
    colWidthsObj[String(k)] = v;
  }
  const rowHeightsObj: Record<string, number> = {};
  for (const [k, v] of rowHeights) {
    rowHeightsObj[String(k)] = v;
  }

  // Serialize merges
  const mergesObj: Record<string, MergeInfo> = {};
  if (sheet.merges) {
    for (const [k, v] of sheet.merges) {
      mergesObj[k] = { ...v };
    }
  }

  return {
    id: sheet.id,
    name: sheet.name,
    cells: serializeCellDataMap(sheet.cells),
    colCount: sheet.colCount,
    rowCount: sheet.rowCount,
    colWidths: colWidthsObj,
    rowHeights: rowHeightsObj,
    ...(defaults?.defaultColWidth !== undefined
      ? { defaultColWidth: defaults.defaultColWidth }
      : {}),
    ...(defaults?.defaultRowHeight !== undefined
      ? { defaultRowHeight: defaults.defaultRowHeight }
      : {}),
    frozenRows: sheet.frozenRows ?? 0,
    frozenCols: sheet.frozenCols ?? 0,
    conditionalFormatRules: (sheet.conditionalFormatRules ?? []).map((r) => ({
      ...r,
      range: { ...r.range },
      style: { ...r.style },
    })),
    merges: Object.keys(mergesObj).length > 0 ? mergesObj : undefined,
    charts:
      (sheet.charts ?? []).length > 0
        ? sheet.charts.map((c) => ({ ...c, sourceRange: { ...c.sourceRange } }))
        : undefined,
    sparklines:
      (sheet.sparklines ?? []).length > 0
        ? sheet.sparklines.map((s) => ({ ...s, colors: { ...s.colors } }))
        : undefined,
    rowGroups:
      (sheet.rowGroups ?? []).length > 0 ? sheet.rowGroups.map((g) => ({ ...g })) : undefined,
    colGroups:
      (sheet.colGroups ?? []).length > 0 ? sheet.colGroups.map((g) => ({ ...g })) : undefined,
    tabColor: sheet.tabColor,
    hidden: sheet.hidden,
    hiddenRows: sheet.hiddenRows ? [...sheet.hiddenRows] : undefined,
    hiddenCols: sheet.hiddenCols ? [...sheet.hiddenCols] : undefined,
    filterRange: sheet.filterRange ? { ...sheet.filterRange } : undefined,
    filterState:
      sheet.filterState && sheet.filterState.size > 0
        ? Object.fromEntries(
            Array.from(sheet.filterState.entries(), ([col, values]) => [
              String(col),
              Array.from(values),
            ]),
          )
        : undefined,
    filterConditions:
      sheet.filterConditions && Object.keys(sheet.filterConditions).length > 0
        ? Object.fromEntries(
            Object.entries(sheet.filterConditions).map(([col, cond]) => [col, { ...cond }]),
          )
        : undefined,
  };
}

export interface SerializeOptions {
  sheets: SheetData[];
  activeSheetId: string;
  /** Fallback column widths, used for a sheet only when `sizesBySheet` has no entry for it. */
  colWidths: Map<number, number>;
  /** Fallback row heights, used for a sheet only when `sizesBySheet` has no entry for it. */
  rowHeights: Map<number, number>;
  /** Per-sheet column widths/row heights (preferred over the flat `colWidths`/`rowHeights` above). */
  sizesBySheet?: Map<string, SheetSizes>;
  namedRanges?: NamedRange[];
  pivotTables?: PivotTableConfig[];
  title?: string;
  /** Skip pretty-printing (smaller and faster; used for autosave) */
  compact?: boolean;
}

/**
 * Serialize the workbook to a NativeFile JSON string.
 */
export function serialize(options: SerializeOptions): string {
  const now = new Date().toISOString();
  const file: NativeFile = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    workbook: {
      sheets: options.sheets.map((sheet) => {
        const sizes = options.sizesBySheet?.get(sheet.id);
        return serializeSheet(
          sheet,
          sizes?.colWidths ?? options.colWidths,
          sizes?.rowHeights ?? options.rowHeights,
          sizes,
        );
      }),
      activeSheetId: options.activeSheetId,
      namedRanges:
        options.namedRanges && options.namedRanges.length > 0
          ? options.namedRanges.map((r) => ({ ...r }))
          : undefined,
      pivotTables:
        options.pivotTables && options.pivotTables.length > 0
          ? options.pivotTables.map((pt) => ({
              ...pt,
              valueFields: pt.valueFields.map((vf) => ({ ...vf })),
            }))
          : undefined,
      title: options.title || undefined,
    },
  };
  return options.compact ? JSON.stringify(file) : JSON.stringify(file, null, 2);
}

// --- Deserialization ---

function deserializeCellDataMap(cells: Record<string, SerializedCell>): CellDataMap {
  const map: CellDataMap = new Map();
  for (const [key, cell] of Object.entries(cells)) {
    const cellData: CellData = {
      rawValue: cell.rawValue,
      displayValue: cell.rawValue, // Will be recalculated for formulas
    };
    if (cell.style) {
      cellData.style = { ...cell.style };
    }
    if (cell.comment) {
      cellData.comment = cell.comment;
    }
    if (cell.validation) {
      cellData.validation = { ...cell.validation };
    }
    if (cell.spillExtent) {
      cellData.spillExtent = { ...cell.spillExtent };
    }
    if (cell.hyperlink) {
      cellData.hyperlink = { ...cell.hyperlink };
    }
    map.set(key, cellData);
  }
  return map;
}

function deserializeSheet(serialized: SerializedSheet): {
  sheet: SheetData;
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  defaultColWidth?: number;
  defaultRowHeight?: number;
} {
  const colWidths = new Map<number, number>();
  if (serialized.colWidths) {
    for (const [k, v] of Object.entries(serialized.colWidths)) {
      colWidths.set(Number(k), v);
    }
  }

  const rowHeights = new Map<number, number>();
  if (serialized.rowHeights) {
    for (const [k, v] of Object.entries(serialized.rowHeights)) {
      rowHeights.set(Number(k), v);
    }
  }

  // Deserialize merges
  const merges = new Map<string, MergeInfo>();
  if (serialized.merges) {
    for (const [k, v] of Object.entries(serialized.merges)) {
      merges.set(k, { ...v });
    }
  }

  const sheet: SheetData = {
    id: serialized.id,
    name: serialized.name,
    cells: deserializeCellDataMap(serialized.cells ?? {}),
    colCount: serialized.colCount ?? GRID_CONSTANTS.DEFAULT_COL_COUNT,
    rowCount: serialized.rowCount ?? GRID_CONSTANTS.DEFAULT_ROW_COUNT,
    frozenRows: serialized.frozenRows ?? 0,
    frozenCols: serialized.frozenCols ?? 0,
    sortState: { col: -1, direction: 'none' },
    filterState: new Map(
      Object.entries(serialized.filterState ?? {}).map(([col, values]) => [
        Number(col),
        new Set(values),
      ]),
    ),
    conditionalFormatRules: (serialized.conditionalFormatRules ?? []).map((r) => ({
      ...r,
      range: { ...r.range },
      style: { ...r.style },
    })),
    merges,
    charts: (serialized.charts ?? []).map((c) => ({ ...c, sourceRange: { ...c.sourceRange } })),
    sparklines: (serialized.sparklines ?? []).map((s) => ({ ...s, colors: { ...s.colors } })),
    rowGroups: (serialized.rowGroups ?? []).map((g) => ({ ...g })),
    colGroups: (serialized.colGroups ?? []).map((g) => ({ ...g })),
    ...(serialized.tabColor !== undefined ? { tabColor: serialized.tabColor } : {}),
    ...(serialized.hidden !== undefined ? { hidden: serialized.hidden } : {}),
    ...(serialized.hiddenRows !== undefined ? { hiddenRows: [...serialized.hiddenRows] } : {}),
    ...(serialized.hiddenCols !== undefined ? { hiddenCols: [...serialized.hiddenCols] } : {}),
    ...(serialized.filterRange !== undefined ? { filterRange: { ...serialized.filterRange } } : {}),
    ...(serialized.filterConditions !== undefined
      ? {
          filterConditions: Object.fromEntries(
            Object.entries(serialized.filterConditions).map(([col, cond]) => [
              Number(col),
              { ...cond },
            ]),
          ),
        }
      : {}),
  };

  const positive = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined);
  return {
    sheet,
    colWidths,
    rowHeights,
    defaultColWidth: positive(serialized.defaultColWidth),
    defaultRowHeight: positive(serialized.defaultRowHeight),
  };
}

export interface DeserializeResult {
  workbook: WorkbookData;
  /** Column widths merged from all sheets (later sheets win on overlapping indices); kept for compat. */
  colWidths: Map<number, number>;
  /** Row heights merged from all sheets; kept for compat. */
  rowHeights: Map<number, number>;
  /** Each sheet's own column widths/row heights, keyed by sheet id. */
  sizesBySheet: Map<string, SheetSizes>;
}

/**
 * Deserialize a NativeFile JSON string into workbook data.
 * Throws on invalid input.
 */
export function deserialize(jsonString: string): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid Masu file: not an object');
  }

  const file = parsed as Record<string, unknown>;

  if (file.version !== 1) {
    throw new Error(`Unsupported Masu file version: ${String(file.version ?? 'unknown')}`);
  }

  const workbookData = file.workbook;
  if (!workbookData || typeof workbookData !== 'object') {
    throw new Error('Invalid Masu file: missing workbook data');
  }

  const wb = workbookData as Record<string, unknown>;
  const sheetsData = wb.sheets;
  if (!Array.isArray(sheetsData) || sheetsData.length === 0) {
    throw new Error('Invalid Masu file: no sheets found');
  }

  // Merge column/row widths from all sheets (using the first sheet's as base)
  const allColWidths = new Map<number, number>();
  const allRowHeights = new Map<number, number>();
  const sizesBySheet = new Map<string, SheetSizes>();

  const sheets: SheetData[] = sheetsData.map((s: unknown) => {
    const { sheet, colWidths, rowHeights, defaultColWidth, defaultRowHeight } = deserializeSheet(
      s as SerializedSheet,
    );
    for (const [k, v] of colWidths) allColWidths.set(k, v);
    for (const [k, v] of rowHeights) allRowHeights.set(k, v);
    sizesBySheet.set(sheet.id, {
      colWidths,
      rowHeights,
      ...(defaultColWidth !== undefined ? { defaultColWidth } : {}),
      ...(defaultRowHeight !== undefined ? { defaultRowHeight } : {}),
    });
    return sheet;
  });

  const activeSheetId = typeof wb.activeSheetId === 'string' ? wb.activeSheetId : sheets[0].id;

  // Restore named ranges (backward compatible - may not exist in older files)
  const namedRanges: NamedRange[] = Array.isArray(wb.namedRanges)
    ? (wb.namedRanges as NamedRange[]).map((r) => ({ ...r }))
    : [];

  // Restore pivot tables (backward compatible)
  const pivotTables: PivotTableConfig[] = Array.isArray(wb.pivotTables)
    ? (wb.pivotTables as PivotTableConfig[]).map((pt) => ({
        ...pt,
        valueFields: pt.valueFields.map((vf) => ({ ...vf })),
      }))
    : [];

  return {
    workbook: {
      sheets,
      activeSheetId,
      namedRanges: namedRanges.length > 0 ? namedRanges : undefined,
      pivotTables: pivotTables.length > 0 ? pivotTables : undefined,
      title: typeof wb.title === 'string' ? wb.title : undefined,
    },
    colWidths: allColWidths,
    rowHeights: allRowHeights,
    sizesBySheet,
  };
}
