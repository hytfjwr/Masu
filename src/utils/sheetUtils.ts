import type {
  SheetData,
  CellDataMap,
  ConditionalFormatRule,
  GroupRange,
  MergeInfo,
} from '../types/grid';
import { GRID_CONSTANTS } from '../types/grid';

/**
 * Generate a unique sheet ID.
 */
export function generateSheetId(): string {
  return `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new empty sheet with the given name.
 */
export function createEmptySheet(name: string): SheetData {
  return {
    id: generateSheetId(),
    name,
    cells: new Map(),
    colCount: GRID_CONSTANTS.DEFAULT_COL_COUNT,
    rowCount: GRID_CONSTANTS.DEFAULT_ROW_COUNT,
    frozenRows: 0,
    frozenCols: 0,
    sortState: { col: -1, direction: 'none' },
    filterState: new Map(),
    conditionalFormatRules: [],
    merges: new Map(),
    charts: [],
    sparklines: [],
    rowGroups: [],
    colGroups: [],
  };
}

/**
 * Generate a unique default sheet name (Sheet1, Sheet2, ...) that doesn't
 * conflict with existing sheet names.
 */
export function generateSheetName(existingNames: string[]): string {
  let num = 1;
  while (existingNames.includes(`Sheet${num}`)) {
    num++;
  }
  return `Sheet${num}`;
}

/**
 * Generate a name for a duplicated sheet ("Sheet1 のコピー", "Sheet1 のコピー (2)", ...)
 * that doesn't conflict with existing sheet names.
 */
export function generateCopyName(baseName: string, existingNames: string[]): string {
  const base = `${baseName} のコピー`;
  if (!existingNames.includes(base)) return base;
  let num = 2;
  while (existingNames.includes(`${base} (${num})`)) {
    num++;
  }
  return `${base} (${num})`;
}

/**
 * Deep clone a CellDataMap, ensuring no shared references.
 */
/** Deep clone a CellBorders object. */
function deepCloneBorders(
  borders: import('../types/grid').CellBorders,
): import('../types/grid').CellBorders {
  return {
    ...(borders.top ? { top: { ...borders.top } } : {}),
    ...(borders.right ? { right: { ...borders.right } } : {}),
    ...(borders.bottom ? { bottom: { ...borders.bottom } } : {}),
    ...(borders.left ? { left: { ...borders.left } } : {}),
  };
}

export function deepCloneCellDataMap(data: CellDataMap): CellDataMap {
  const clone: CellDataMap = new Map();
  for (const [key, cell] of data) {
    clone.set(key, {
      rawValue: cell.rawValue,
      displayValue: cell.displayValue,
      ...(cell.computed !== undefined ? { computed: cell.computed } : {}),
      ...(cell.formula !== undefined ? { formula: cell.formula } : {}),
      ...(cell.dependencies !== undefined ? { dependencies: [...cell.dependencies] } : {}),
      ...(cell.error !== undefined ? { error: cell.error } : {}),
      ...(cell.style !== undefined
        ? {
            style: {
              ...cell.style,
              ...(cell.style.borders ? { borders: deepCloneBorders(cell.style.borders) } : {}),
            },
          }
        : {}),
      ...(cell.comment !== undefined ? { comment: cell.comment } : {}),
      ...(cell.validation !== undefined
        ? {
            validation: {
              ...cell.validation,
              ...(cell.validation.listValues
                ? { listValues: [...cell.validation.listValues] }
                : {}),
            },
          }
        : {}),
    });
  }
  return clone;
}

/**
 * Deep clone a SheetData.
 */
export function deepCloneSheet(sheet: SheetData): SheetData {
  const clonedFilterState = new Map<number, Set<string>>();
  if (sheet.filterState) {
    for (const [k, v] of sheet.filterState) {
      clonedFilterState.set(k, new Set(v));
    }
  }
  const clonedMerges = new Map<string, MergeInfo>();
  if (sheet.merges) {
    for (const [k, v] of sheet.merges) {
      clonedMerges.set(k, { ...v });
    }
  }

  return {
    id: sheet.id,
    name: sheet.name,
    cells: deepCloneCellDataMap(sheet.cells),
    colCount: sheet.colCount,
    rowCount: sheet.rowCount,
    frozenRows: sheet.frozenRows ?? 0,
    frozenCols: sheet.frozenCols ?? 0,
    sortState: sheet.sortState ? { ...sheet.sortState } : { col: -1, direction: 'none' },
    filterState: clonedFilterState,
    ...(sheet.preSortData ? { preSortData: deepCloneCellDataMap(sheet.preSortData) } : {}),
    conditionalFormatRules: deepCloneConditionalFormatRules(sheet.conditionalFormatRules ?? []),
    merges: clonedMerges,
    charts: (sheet.charts ?? []).map((c) => ({ ...c, sourceRange: { ...c.sourceRange } })),
    sparklines: (sheet.sparklines ?? []).map((s) => ({ ...s, colors: { ...s.colors } })),
    rowGroups: (sheet.rowGroups ?? []).map((g: GroupRange) => ({ ...g })),
    colGroups: (sheet.colGroups ?? []).map((g: GroupRange) => ({ ...g })),
    ...(sheet.tabColor !== undefined ? { tabColor: sheet.tabColor } : {}),
    ...(sheet.hidden !== undefined ? { hidden: sheet.hidden } : {}),
    ...(sheet.hiddenRows !== undefined ? { hiddenRows: sheet.hiddenRows.slice() } : {}),
    ...(sheet.hiddenCols !== undefined ? { hiddenCols: sheet.hiddenCols.slice() } : {}),
    ...(sheet.filterRange !== undefined ? { filterRange: { ...sheet.filterRange } } : {}),
    ...(sheet.filterConditions !== undefined
      ? {
          filterConditions: Object.fromEntries(
            Object.entries(sheet.filterConditions).map(([col, cond]) => [col, { ...cond }]),
          ),
        }
      : {}),
  };
}

/**
 * Deep clone conditional format rules.
 */
export function deepCloneConditionalFormatRules(
  rules: ConditionalFormatRule[],
): ConditionalFormatRule[] {
  return rules.map((rule) => ({
    ...rule,
    range: { ...rule.range },
    style: { ...rule.style },
  }));
}

/**
 * Deep clone an array of sheets (for undo/redo snapshots).
 */
export function deepCloneSheets(sheets: SheetData[]): SheetData[] {
  return sheets.map(deepCloneSheet);
}
