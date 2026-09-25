/**
 * Excel (.xlsx) import/export via the exceljs library.
 * exceljs is loaded with a dynamic import so it does not bloat the initial bundle.
 */

import type ExcelJSNamespace from 'exceljs';
import type {
  BorderStyle,
  CellBorders,
  CellStyle,
  NamedRange,
  NumberFormat,
  SheetData,
  ValidationRule,
  WorkbookData,
} from '../types/grid';
import { GRID_CONSTANTS } from '../types/grid';
import type { DeserializeResult, SheetSizes } from './nativeSerializer';
import { cellKey, parseCellKey } from '../utils/coordinates';
import { createEmptySheet } from '../utils/sheetUtils';

export interface XlsxExportOptions {
  sheets: SheetData[];
  activeSheetId: string;
  /** Fallback column widths in px, used for a sheet only when `sizesBySheet` has no entry for it. */
  colWidths: Map<number, number>;
  /** Fallback row heights in px, used for a sheet only when `sizesBySheet` has no entry for it. */
  rowHeights: Map<number, number>;
  /** Per-sheet column widths/row heights (preferred over the flat `colWidths`/`rowHeights` above). */
  sizesBySheet?: Map<string, SheetSizes>;
  namedRanges?: NamedRange[];
  /** ドキュメントタイトル。設定されている場合は xlsx のコアプロパティ (workbook.title) に書き込む。 */
  title?: string;
}

/**
 * Load the exceljs module. Handles both ESM default export and CJS namespace shapes.
 */
async function loadExcelJS() {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  return ExcelJS;
}

// --- Color helpers ---

/** Convert '#RGB' / '#RRGGBB' to an exceljs ARGB hex string ('FFRRGGBB'). Other formats (rgb(), named colors) are ignored. */
function hexToArgb(color: string): string | undefined {
  const short = color.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `FF${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const long = color.match(/^#([0-9a-fA-F]{6})$/);
  if (long) {
    return `FF${long[1]}`.toUpperCase();
  }
  return undefined;
}

/** Convert an exceljs ARGB hex string to '#RRGGBB' (the lower 6 digits). */
function argbToHex(argb: string): string {
  return `#${argb.slice(-6).toUpperCase()}`;
}

// --- Border style mapping ---

const EXPORT_BORDER_STYLE: Record<BorderStyle, ExcelJSNamespace.BorderStyle> = {
  solid: 'thin',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
  thick: 'thick',
};

function importBorderStyle(style: ExcelJSNamespace.BorderStyle): BorderStyle {
  switch (style) {
    case 'thin':
    case 'medium':
    case 'hair':
      return 'solid';
    case 'thick':
      return 'thick';
    case 'dotted':
      return 'dotted';
    case 'double':
      return 'double';
    default:
      // dashed, dashDot, dashDotDot, slantDashDot, mediumDashed, mediumDashDotDot, mediumDashDot
      return 'dashed';
  }
}

// --- Font family mapping (export) ---

const GENERIC_FONT_MAP: Record<string, string> = {
  'sans-serif': 'Arial',
  serif: 'Times New Roman',
  monospace: 'Courier New',
};

function excelFontName(fontFamily: string): string {
  const first = fontFamily
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  return GENERIC_FONT_MAP[first] ?? first;
}

// --- Number format presets (export) ---

const NUMBER_FORMAT_PRESETS: Partial<Record<NumberFormat, string>> = {
  number: '#,##0.00',
  currency: '"¥"#,##0.00',
  percent: '0.00%',
  scientific: '0.00E+00',
  date: 'yyyy/mm/dd',
  time: 'h:mm:ss',
  datetime: 'yyyy/mm/dd h:mm:ss',
  plainText: '@',
};

function resolveExportNumFmt(style: CellStyle): string | undefined {
  if (style.numberFormatPattern) return style.numberFormatPattern;
  if (style.numberFormat) return NUMBER_FORMAT_PRESETS[style.numberFormat];
  return undefined;
}

// --- Style conversion: Masu -> exceljs ---

function buildExcelStyle(style: CellStyle | undefined): Partial<ExcelJSNamespace.Style> {
  const result: Partial<ExcelJSNamespace.Style> = {};
  if (!style) return result;

  const font: Partial<ExcelJSNamespace.Font> = {};
  let hasFont = false;
  if (style.bold !== undefined) {
    font.bold = style.bold;
    hasFont = true;
  }
  if (style.italic !== undefined) {
    font.italic = style.italic;
    hasFont = true;
  }
  if (style.underline !== undefined) {
    font.underline = style.underline;
    hasFont = true;
  }
  if (style.strikethrough !== undefined) {
    font.strike = style.strikethrough;
    hasFont = true;
  }
  if (style.fontSize !== undefined) {
    font.size = style.fontSize;
    hasFont = true;
  }
  if (style.fontFamily) {
    font.name = excelFontName(style.fontFamily);
    hasFont = true;
  }
  if (style.textColor) {
    const argb = hexToArgb(style.textColor);
    if (argb) {
      font.color = { argb };
      hasFont = true;
    }
  }
  if (hasFont) result.font = font;

  if (style.backgroundColor) {
    const argb = hexToArgb(style.backgroundColor);
    if (argb) {
      result.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    }
  }

  const alignment: Partial<ExcelJSNamespace.Alignment> = {};
  let hasAlignment = false;
  if (style.textAlign) {
    alignment.horizontal = style.textAlign;
    hasAlignment = true;
  }
  if (style.verticalAlign) {
    alignment.vertical = style.verticalAlign;
    hasAlignment = true;
  }
  if (style.wrapText !== undefined) {
    alignment.wrapText = style.wrapText;
    hasAlignment = true;
  }
  if (hasAlignment) result.alignment = alignment;

  if (style.borders) {
    const border: Partial<ExcelJSNamespace.Borders> = {};
    let hasBorder = false;
    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      const edge = style.borders?.[side];
      if (edge) {
        const argb = hexToArgb(edge.color);
        border[side] = {
          style: EXPORT_BORDER_STYLE[edge.style],
          ...(argb ? { color: { argb } } : {}),
        };
        hasBorder = true;
      }
    });
    if (hasBorder) result.border = border;
  }

  const numFmt = resolveExportNumFmt(style);
  if (numFmt) result.numFmt = numFmt;

  return result;
}

// --- Style conversion: exceljs -> Masu ---

function cellStyleFromExcel(excelStyle: Partial<ExcelJSNamespace.Style>): CellStyle | undefined {
  const style: CellStyle = {};

  const font = excelStyle.font;
  if (font) {
    if (font.name) style.fontFamily = font.name;
    if (font.size !== undefined) style.fontSize = font.size;
    if (font.bold) style.bold = true;
    if (font.italic) style.italic = true;
    if (font.underline && font.underline !== 'none') style.underline = true;
    if (font.strike) style.strikethrough = true;
    if (font.color?.argb) style.textColor = argbToHex(font.color.argb);
  }

  const fill = excelStyle.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid' && fill.fgColor?.argb) {
    style.backgroundColor = argbToHex(fill.fgColor.argb);
  }

  const alignment = excelStyle.alignment;
  if (alignment) {
    const h = alignment.horizontal;
    if (h === 'left' || h === 'center' || h === 'right') style.textAlign = h;
    const v: string | undefined = alignment.vertical;
    if (v === 'center') style.verticalAlign = 'middle';
    else if (v === 'top' || v === 'middle' || v === 'bottom') style.verticalAlign = v;
    if (alignment.wrapText) style.wrapText = true;
  }

  const border = excelStyle.border;
  if (border) {
    const borders: CellBorders = {};
    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      const edge = border[side];
      if (edge?.style) {
        borders[side] = {
          style: importBorderStyle(edge.style),
          color: edge.color?.argb ? argbToHex(edge.color.argb) : '#000000',
        };
      }
    });
    if (Object.keys(borders).length > 0) style.borders = borders;
  }

  if (excelStyle.numFmt && excelStyle.numFmt !== 'General') {
    style.numberFormat = 'custom';
    style.numberFormatPattern = excelStyle.numFmt;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

// --- Data validation conversion ---

function buildExcelValidation(rule: ValidationRule): ExcelJSNamespace.DataValidation | undefined {
  if (rule.type === 'list' && rule.listValues && rule.listValues.length > 0) {
    return { type: 'list', allowBlank: true, formulae: [`"${rule.listValues.join(',')}"`] };
  }
  if (rule.type === 'number') {
    if (rule.min !== undefined && rule.max !== undefined) {
      return { type: 'decimal', operator: 'between', formulae: [rule.min, rule.max] };
    }
    if (rule.min !== undefined) {
      return { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [rule.min] };
    }
    if (rule.max !== undefined) {
      return { type: 'decimal', operator: 'lessThanOrEqual', formulae: [rule.max] };
    }
  }
  return undefined;
}

// --- Named range helpers ---

/** Convert a range string ('A1:B3') to its absolute form ('$A$1:$B$3'). */
function toAbsoluteRange(range: string): string {
  return range
    .split(':')
    .map((part) => {
      const m = part.match(/^([A-Z]+)(\d+)$/);
      if (!m) return part;
      return `$${m[1]}$${m[2]}`;
    })
    .join(':');
}

/** Parse a defined-name range string (e.g. "'Sheet1'!$A$1:$B$3") into a sheet name and plain range. */
function parseDefinedNameRange(rangeStr: string): { sheetName: string; range: string } | undefined {
  const match = rangeStr.match(/^(?:'([^']+)'|([^'!]+))!(.+)$/);
  if (!match) return undefined;
  const sheetName = match[1] ?? match[2];
  const range = match[3].replace(/\$/g, '');
  if (!/^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(range)) return undefined;
  return { sheetName, range };
}

// --- Export ---

// --- Column width / row height units ---
// xlsx column widths are in characters of the default font's maximum digit width (MDW), *including*
// the cell padding (Excel's default "8.43" column is stored as 9.140625 and draws 64px). With the
// default Calibri 11 (MDW 7px): px ≈ width × 7. Row heights are in points (px = pt / 0.75).
const MAX_DIGIT_WIDTH_PX = 7;
/** Excel's standard column width (8.43 chars) when a sheet doesn't declare `defaultColWidth`. */
const EXCEL_DEFAULT_COL_WIDTH_PX = 64;
/** Excel's standard row height (15pt) when a sheet doesn't declare a usable `defaultRowHeight`. */
const EXCEL_DEFAULT_ROW_HEIGHT_PT = 15;

const colWidthToPx = (width: number) => Math.max(1, Math.round(width * MAX_DIGIT_WIDTH_PX));
const pxToColWidth = (px: number) => Math.max(0.1, px / MAX_DIGIT_WIDTH_PX);
const ptToPx = (pt: number) => Math.max(1, Math.round(pt / 0.75));
const pxToPt = (px: number) => px * 0.75;

export async function exportXlsx(options: XlsxExportOptions): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Masu';
  if (options.title) {
    workbook.title = options.title;
  }

  for (const sheet of options.sheets) {
    const ws = workbook.addWorksheet(sheet.name);

    if (sheet.tabColor) {
      const argb = hexToArgb(sheet.tabColor);
      if (argb) ws.properties.tabColor = { argb };
    }
    if (sheet.hidden) {
      ws.state = 'hidden';
    }

    for (const [key, cell] of sheet.cells) {
      if (cell.spillSource) continue;
      const wsCell = ws.getCell(key);

      if (cell.formula !== undefined) {
        let result: ExcelJSNamespace.CellFormulaValue['result'];
        if (cell.computed !== undefined) {
          result = cell.computed;
        } else if (cell.error !== undefined) {
          result = { error: cell.error as ExcelJSNamespace.CellErrorValue['error'] };
        } else {
          result = cell.displayValue;
        }
        wsCell.value = { formula: cell.formula, result };
      } else if (cell.rawValue !== '') {
        if (cell.computed !== undefined) {
          wsCell.value = cell.computed;
        } else {
          const num = Number(cell.rawValue);
          if (!Number.isNaN(num) && Number.isFinite(num)) {
            wsCell.value = num;
          } else if (cell.rawValue === 'TRUE') {
            wsCell.value = true;
          } else if (cell.rawValue === 'FALSE') {
            wsCell.value = false;
          } else {
            wsCell.value = cell.rawValue;
          }
        }
      }

      const excelStyle = buildExcelStyle(cell.style);
      if (Object.keys(excelStyle).length > 0) {
        wsCell.style = excelStyle;
      }

      if (cell.comment) {
        // exceljs drops notes on value-less cells; an empty string value keeps the note
        if (wsCell.value === null || wsCell.value === undefined) wsCell.value = '';
        wsCell.note = cell.comment;
      }

      if (cell.validation) {
        const dv = buildExcelValidation(cell.validation);
        if (dv) wsCell.dataValidation = dv;
      }
    }

    for (const info of sheet.merges.values()) {
      if (info.colSpan > 0 || info.rowSpan > 0) {
        const { col: anchorCol, row: anchorRow } = parseCellKey(info.anchorKey);
        ws.mergeCells(
          anchorRow + 1,
          anchorCol + 1,
          anchorRow + info.rowSpan,
          anchorCol + info.colSpan,
        );
      }
    }

    if (sheet.frozenRows > 0 || sheet.frozenCols > 0) {
      ws.views = [{ state: 'frozen', xSplit: sheet.frozenCols, ySplit: sheet.frozenRows }];
    }

    const sheetSizes = options.sizesBySheet?.get(sheet.id);
    const colWidthsForSheet = sheetSizes?.colWidths ?? options.colWidths;
    const rowHeightsForSheet = sheetSizes?.rowHeights ?? options.rowHeights;
    // Sheet defaults: always written, so columns/rows without their own size open in Excel at the
    // size they had here (the app's defaults differ from Excel's)
    ws.properties.defaultColWidth = pxToColWidth(
      sheetSizes?.defaultColWidth ?? GRID_CONSTANTS.DEFAULT_COL_WIDTH,
    );
    ws.properties.defaultRowHeight = pxToPt(
      sheetSizes?.defaultRowHeight ?? GRID_CONSTANTS.DEFAULT_ROW_HEIGHT,
    );
    for (const [index, px] of colWidthsForSheet) {
      ws.getColumn(index + 1).width = pxToColWidth(px);
    }
    for (const [index, px] of rowHeightsForSheet) {
      ws.getRow(index + 1).height = pxToPt(px);
    }

    for (const r of sheet.hiddenRows ?? []) {
      ws.getRow(r + 1).hidden = true;
    }
    for (const c of sheet.hiddenCols ?? []) {
      ws.getColumn(c + 1).hidden = true;
    }
  }

  for (const nr of options.namedRanges ?? []) {
    const targetSheet = nr.refSheetId
      ? options.sheets.find((s) => s.id === nr.refSheetId)
      : options.sheets[0];
    const sheetName = targetSheet?.name ?? options.sheets[0]?.name;
    if (!sheetName) continue;
    workbook.definedNames.add(`'${sheetName}'!${toAbsoluteRange(nr.range)}`, nr.name);
  }

  const raw = await workbook.xlsx.writeBuffer();
  if (raw instanceof ArrayBuffer) return raw;
  const view = raw as unknown as {
    buffer: ArrayBufferLike;
    byteOffset: number;
    byteLength: number;
  };
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

// --- Import ---

/** Convert a Date to an Excel date serial number (days since 1899-12-30, UTC-based). */
function dateToSerial(d: Date): number {
  return (
    (Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ) -
      Date.UTC(1899, 11, 30)) /
    86400000
  );
}

function commentTextFromNote(
  note: string | ExcelJSNamespace.Comment | undefined,
): string | undefined {
  if (!note) return undefined;
  if (typeof note === 'string') return note;
  if (note.texts) return note.texts.map((t) => toPlainText(t.text)).join('');
  return undefined;
}

/**
 * Flatten any exceljs text-ish value to a plain string. Hyperlink `text` and formula results can be
 * plain strings, numbers, rich text (`{ richText: [{ text }] }`) or nested `{ text }` objects.
 */
function toPlainText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return String(dateToSerial(v));
  if (Array.isArray(v)) return v.map(toPlainText).join('');
  if (typeof v === 'object') {
    const o = v as { richText?: unknown; text?: unknown; result?: unknown; error?: unknown };
    if (Array.isArray(o.richText))
      return o.richText.map((rt) => toPlainText((rt as { text?: unknown }).text)).join('');
    if (o.text !== undefined) return toPlainText(o.text);
    if (o.result !== undefined) return toPlainText(o.result);
    if (typeof o.error === 'string') return o.error;
  }
  return '';
}

/** Convert a non-formula cell value into { rawValue, isDate }. */
function convertCellValue(value: ExcelJSNamespace.CellValue): {
  rawValue: string;
  isDate: boolean;
} {
  if (value === null || value === undefined) {
    return { rawValue: '', isDate: false };
  }
  if (typeof value === 'number') {
    return { rawValue: String(value), isDate: false };
  }
  if (typeof value === 'boolean') {
    return { rawValue: value ? 'TRUE' : 'FALSE', isDate: false };
  }
  if (value instanceof Date) {
    return { rawValue: String(dateToSerial(value)), isDate: true };
  }
  if (typeof value === 'string') {
    return { rawValue: value, isDate: false };
  }
  if ('richText' in value) {
    return { rawValue: toPlainText(value), isDate: false };
  }
  if ('hyperlink' in value) {
    const label = toPlainText(value.text);
    const url = toPlainText(value.hyperlink);
    if (!url) return { rawValue: label, isDate: false };
    return {
      rawValue: `=HYPERLINK("${url.replace(/"/g, '""')}","${label.replace(/"/g, '""')}")`,
      isDate: false,
    };
  }
  if ('error' in value) {
    return { rawValue: toPlainText(value.error), isDate: false };
  }
  return { rawValue: toPlainText(value), isDate: false };
}

/** Convert a formula's result value into a display string. */
function formulaResultToDisplay(result: ExcelJSNamespace.CellFormulaValue['result']): string {
  if (result === undefined || result === null) return '';
  if (result instanceof Date) return String(dateToSerial(result));
  if (typeof result === 'object') {
    return toPlainText(result);
  }
  if (typeof result === 'boolean') return result ? 'TRUE' : 'FALSE';
  return String(result);
}

/** Resolve the list values for a 'list' data validation, either from an inline quoted formula or a cell range reference. */
function resolveListValidationValues(
  ws: ExcelJSNamespace.Worksheet,
  dv: ExcelJSNamespace.DataValidation,
): string[] | undefined {
  if (dv.type !== 'list') return undefined;
  const formula = dv.formulae?.[0];
  if (typeof formula !== 'string') return undefined;

  const quoted = formula.match(/^"(.*)"$/);
  if (quoted) {
    return quoted[1].split(',');
  }

  const plainRange = formula.replace(/\$/g, '');
  const rangeMatch = plainRange.match(/^([A-Z]+\d+)(?::([A-Z]+\d+))?$/);
  if (!rangeMatch) return undefined;
  const start = parseCellKey(rangeMatch[1]);
  const end = rangeMatch[2] ? parseCellKey(rangeMatch[2]) : start;
  const values: string[] = [];
  for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
    for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
      values.push(toPlainText(ws.getCell(r + 1, c + 1).value));
    }
  }
  return values.length > 0 ? values : undefined;
}

export async function importXlsx(buffer: ArrayBuffer): Promise<DeserializeResult> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheets = workbook.worksheets.filter((ws) => ws.state !== 'veryHidden');
  if (worksheets.length === 0) {
    throw new Error('シートが含まれていません');
  }

  const sheets: SheetData[] = [];
  // Merged from all sheets (first sheet's values), kept for compat with older callers.
  const colWidths = new Map<number, number>();
  const rowHeights = new Map<number, number>();
  // Each sheet's own sizes.
  const sizesBySheet = new Map<string, SheetSizes>();

  worksheets.forEach((ws, sheetIndex) => {
    const sheet = createEmptySheet(ws.name);
    const sheetColWidths = new Map<number, number>();
    const sheetRowHeights = new Map<number, number>();

    if (ws.state === 'hidden') {
      sheet.hidden = true;
    }
    const tabColorArgb = ws.properties.tabColor?.argb;
    if (tabColorArgb) {
      sheet.tabColor = argbToHex(tabColorArgb);
    }

    // Sheet defaults (sheetFormatPr): what Excel draws for columns/rows without their own size
    const defaultColWidth = ws.properties.defaultColWidth
      ? colWidthToPx(ws.properties.defaultColWidth)
      : EXCEL_DEFAULT_COL_WIDTH_PX;
    const defaultRowHeight = ptToPx(ws.properties.defaultRowHeight || EXCEL_DEFAULT_ROW_HEIGHT_PT);

    // Row heights: every row that declares one, including empty spacer rows (not just rows with cells)
    for (let r = 1; r <= ws.rowCount; r++) {
      const height = ws.findRow(r)?.height;
      if (!height) continue;
      const h = ptToPx(height);
      if (h === defaultRowHeight) continue;
      sheetRowHeights.set(r - 1, h);
      if (sheetIndex === 0) rowHeights.set(r - 1, h);
    }

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = cellKey(colNumber - 1, rowNumber - 1);

        let rawValue: string;
        let displayValue: string;
        let isDate = false;

        // One unusual cell (unexpected value shape from another app) must not abort the whole import
        try {
          const formulaText = cell.formula;
          if (formulaText) {
            const result = (cell.value as ExcelJSNamespace.CellFormulaValue).result;
            rawValue = `=${formulaText}`;
            displayValue = formulaResultToDisplay(result);
          } else if (cell.formulaType === ExcelJS.FormulaType.Shared && cell.model.sharedFormula) {
            // Shared formula whose master could not be resolved: fall back to the cached result only.
            const result = (cell.value as ExcelJSNamespace.CellSharedFormulaValue).result;
            rawValue = formulaResultToDisplay(result);
            displayValue = rawValue;
          } else {
            const converted = convertCellValue(cell.value);
            rawValue = converted.rawValue;
            displayValue = converted.rawValue;
            isDate = converted.isDate;
          }
        } catch (err) {
          console.warn(`xlsx import: could not read ${ws.name}!${key}`, err);
          rawValue = toPlainText(cell.value);
          displayValue = rawValue;
          isDate = false;
        }

        const style = cellStyleFromExcel(cell.style);
        if (isDate && (!style || !style.numberFormatPattern)) {
          const dateStyle: CellStyle = {
            ...(style ?? {}),
            numberFormat: 'custom',
            numberFormatPattern: 'yyyy/mm/dd',
          };
          sheet.cells.set(key, { rawValue, displayValue, style: dateStyle });
        } else {
          sheet.cells.set(key, {
            rawValue,
            displayValue,
            ...(style ? { style } : {}),
          });
        }

        const comment = commentTextFromNote(cell.note);
        if (comment) {
          const existing = sheet.cells.get(key)!;
          existing.comment = comment;
        }

        if (cell.dataValidation?.type === 'list') {
          const listValues = resolveListValidationValues(ws, cell.dataValidation);
          if (listValues) {
            const existing = sheet.cells.get(key)!;
            existing.validation = { type: 'list', listValues, showDropdown: true };
          }
        }
      });
    });

    // exceljs's eachRow/eachCell iteration only discovers cells that have a value assigned;
    // a cell whose *only* content is a data validation rule (no value) is invisible to that
    // iteration even with includeEmpty:true (verified empirically), so it must be picked up
    // here directly from the worksheet's internal validation model.
    const validationModel =
      (
        ws as unknown as {
          dataValidations?: { model?: Record<string, ExcelJSNamespace.DataValidation | undefined> };
        }
      ).dataValidations?.model ?? {};
    for (const [address, dv] of Object.entries(validationModel)) {
      if (!dv || dv.type !== 'list' || sheet.cells.has(address)) continue;
      const listValues = resolveListValidationValues(ws, dv);
      if (listValues) {
        sheet.cells.set(address, {
          rawValue: '',
          displayValue: '',
          validation: { type: 'list', listValues, showDropdown: true },
        });
      }
    }

    // Merges
    const mergeRanges: string[] = ws.model.merges ?? [];
    for (const rangeStr of mergeRanges) {
      const [tl, br] = rangeStr.split(':');
      if (!tl || !br) continue;
      const start = parseCellKey(tl);
      const end = parseCellKey(br);
      const anchorKey = tl;
      const colSpan = end.col - start.col + 1;
      const rowSpan = end.row - start.row + 1;
      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          const key = cellKey(c, r);
          sheet.merges.set(key, {
            anchorKey,
            colSpan: key === anchorKey ? colSpan : 0,
            rowSpan: key === anchorKey ? rowSpan : 0,
          });
        }
      }
    }

    // Frozen panes
    const view = ws.views?.[0];
    if (view && view.state === 'frozen') {
      sheet.frozenCols = view.xSplit ?? 0;
      sheet.frozenRows = view.ySplit ?? 0;
    }

    // Row/col counts
    sheet.rowCount = Math.min(
      Math.max(GRID_CONSTANTS.DEFAULT_ROW_COUNT, ws.rowCount + 50),
      GRID_CONSTANTS.MAX_ROW_COUNT,
    );
    sheet.colCount = Math.min(
      Math.max(GRID_CONSTANTS.DEFAULT_COL_COUNT, ws.columnCount + 5),
      GRID_CONSTANTS.MAX_COL_COUNT,
    );

    // Column widths (per-sheet; the first sheet's are also merged into the flat `colWidths` for compat)
    (ws.columns ?? []).forEach((col, index) => {
      if (col?.width) {
        const w = colWidthToPx(col.width);
        if (w === defaultColWidth) return;
        sheetColWidths.set(index, w);
        if (sheetIndex === 0) colWidths.set(index, w);
      }
    });

    // Hidden rows/columns (per-sheet)
    const hiddenRows: number[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getRow(r).hidden) hiddenRows.push(r - 1);
    }
    if (hiddenRows.length > 0) sheet.hiddenRows = hiddenRows;

    const hiddenCols: number[] = [];
    (ws.columns ?? []).forEach((col, index) => {
      if (col?.hidden) hiddenCols.push(index);
    });
    if (hiddenCols.length > 0) sheet.hiddenCols = hiddenCols;

    sizesBySheet.set(sheet.id, {
      colWidths: sheetColWidths,
      rowHeights: sheetRowHeights,
      defaultColWidth,
      defaultRowHeight,
    });
    sheets.push(sheet);
  });

  // Named ranges
  const namedRanges: NamedRange[] = [];
  for (const entry of workbook.definedNames.model ?? []) {
    if (entry.name.startsWith('_xlnm.')) continue;
    const rangeStr = entry.ranges?.[0];
    if (!rangeStr) continue;
    const parsed = parseDefinedNameRange(rangeStr);
    if (!parsed) continue;
    const targetSheet = sheets.find((s) => s.name === parsed.sheetName);
    if (!targetSheet) continue;
    namedRanges.push({ name: entry.name, range: parsed.range, refSheetId: targetSheet.id });
  }

  const workbookData: WorkbookData = {
    sheets,
    activeSheetId: sheets[0].id,
    namedRanges: namedRanges.length > 0 ? namedRanges : undefined,
  };

  return { workbook: workbookData, colWidths, rowHeights, sizesBySheet };
}
