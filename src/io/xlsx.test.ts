import { describe, it, expect } from 'vitest';
import { exportXlsx, importXlsx } from './xlsx';
import { createEmptySheet } from '../utils/sheetUtils';
import type { SheetData } from '../types/grid';

function buildSheet1(): SheetData {
  const sheet = createEmptySheet('Sheet1');
  sheet.cells.set('A1', {
    rawValue: 'Name',
    displayValue: 'Name',
    style: { bold: true, backgroundColor: '#FFFF00' },
  });
  sheet.cells.set('B1', {
    rawValue: '1234.5',
    displayValue: '1234.5',
    style: { numberFormatPattern: '#,##0.00' },
  });
  sheet.cells.set('C1', {
    rawValue: '=B1*2',
    displayValue: '2469',
    formula: 'B1*2',
    computed: 2469,
  });
  // Comment on a value-less cell (exporter writes an empty string so exceljs keeps the note)
  sheet.cells.set('A2', {
    rawValue: '',
    displayValue: '',
    comment: 'メモ',
  });
  sheet.merges.set('A3', { anchorKey: 'A3', colSpan: 2, rowSpan: 2 });
  sheet.merges.set('A4', { anchorKey: 'A3', colSpan: 0, rowSpan: 0 });
  sheet.merges.set('B3', { anchorKey: 'A3', colSpan: 0, rowSpan: 0 });
  sheet.merges.set('B4', { anchorKey: 'A3', colSpan: 0, rowSpan: 0 });
  sheet.frozenRows = 1;
  return sheet;
}

function buildSheet2(): SheetData {
  const sheet = createEmptySheet('売上 2026');
  sheet.cells.set('A1', {
    rawValue: '',
    displayValue: '',
    validation: { type: 'list', listValues: ['a', 'b', 'c'], showDropdown: true },
  });
  return sheet;
}

describe('xlsx export/import round trip', () => {
  it('round-trips sheet names, styles, formulas, comments, merges, and freeze panes', async () => {
    const sheet1 = buildSheet1();
    const sheet2 = buildSheet2();

    const buffer = await exportXlsx({
      sheets: [sheet1, sheet2],
      activeSheetId: sheet1.id,
      colWidths: new Map(),
      rowHeights: new Map(),
    });

    const result = await importXlsx(buffer);
    const [importedSheet1, importedSheet2] = result.workbook.sheets;

    expect(importedSheet1.name).toBe('Sheet1');
    expect(importedSheet2.name).toBe('売上 2026');

    const a1 = importedSheet1.cells.get('A1');
    expect(a1?.style?.bold).toBe(true);
    expect(a1?.style?.backgroundColor).toBe('#FFFF00');

    const b1 = importedSheet1.cells.get('B1');
    expect(b1?.rawValue).toBe('1234.5');
    expect(b1?.style?.numberFormatPattern).toBe('#,##0.00');

    const c1 = importedSheet1.cells.get('C1');
    expect(c1?.rawValue).toBe('=B1*2');

    const a2 = importedSheet1.cells.get('A2');
    expect(a2?.comment).toBe('メモ');

    expect(importedSheet1.merges.get('A3')).toEqual({ anchorKey: 'A3', colSpan: 2, rowSpan: 2 });
    expect(importedSheet1.merges.get('B4')?.anchorKey).toBe('A3');

    expect(importedSheet1.frozenRows).toBe(1);

    expect(importedSheet2.cells.get('A1')?.validation?.listValues).toEqual(['a', 'b', 'c']);
  });

  it('round-trips named ranges', async () => {
    const sheet1 = buildSheet1();

    const buffer = await exportXlsx({
      sheets: [sheet1],
      activeSheetId: sheet1.id,
      colWidths: new Map(),
      rowHeights: new Map(),
      namedRanges: [{ name: 'Sales', range: 'B1:B10', refSheetId: sheet1.id }],
    });

    const result = await importXlsx(buffer);
    const importedSheet1 = result.workbook.sheets[0];
    const namedRange = result.workbook.namedRanges?.find((nr) => nr.name === 'Sales');

    expect(namedRange).toBeDefined();
    expect(namedRange?.range).toBe('B1:B10');
    expect(namedRange?.refSheetId).toBe(importedSheet1.id);
  });

  it('round-trips column widths within +/-2px', async () => {
    const sheet1 = buildSheet1();

    const buffer = await exportXlsx({
      sheets: [sheet1],
      activeSheetId: sheet1.id,
      colWidths: new Map([[0, 150]]),
      rowHeights: new Map(),
    });

    const result = await importXlsx(buffer);
    const width = result.colWidths.get(0) ?? 0;
    expect(Math.abs(width - 150)).toBeLessThanOrEqual(2);
  });

  it('round-trips independent per-sheet column widths via sizesBySheet', async () => {
    const sheet1 = buildSheet1();
    const sheet2 = buildSheet2();

    const buffer = await exportXlsx({
      sheets: [sheet1, sheet2],
      activeSheetId: sheet1.id,
      colWidths: new Map(),
      rowHeights: new Map(),
      sizesBySheet: new Map([
        [sheet1.id, { colWidths: new Map([[0, 150]]), rowHeights: new Map() }],
        [sheet2.id, { colWidths: new Map([[0, 300]]), rowHeights: new Map() }],
      ]),
    });

    const result = await importXlsx(buffer);
    const [importedSheet1, importedSheet2] = result.workbook.sheets;
    const width1 = result.sizesBySheet.get(importedSheet1.id)?.colWidths.get(0) ?? 0;
    const width2 = result.sizesBySheet.get(importedSheet2.id)?.colWidths.get(0) ?? 0;
    expect(Math.abs(width1 - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(width2 - 300)).toBeLessThanOrEqual(2);
  });

  it('imports sheet default sizes, declared column widths and spacer-row heights like Excel draws them', async () => {
    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.properties.defaultColWidth = 12; // 84px
    ws.properties.defaultRowHeight = 18; // 24px
    ws.getColumn(2).width = 20; // 140px
    ws.getCell('A2').value = 'x';
    ws.getRow(5).height = 30; // 40px, a row without any cell
    ws.getCell('A7').value = 'y'; // keeps row 5 inside the used range
    const plain = workbook.addWorksheet('Plain'); // no sheetFormatPr defaults
    plain.getCell('A1').value = 1;
    const buffer = await workbook.xlsx.writeBuffer();

    const result = await importXlsx(buffer as ArrayBuffer);
    const [s1, s2] = result.workbook.sheets;
    const sizes1 = result.sizesBySheet.get(s1.id)!;
    expect(sizes1.defaultColWidth).toBe(84);
    expect(sizes1.defaultRowHeight).toBe(24);
    expect(sizes1.colWidths.get(1)).toBe(140);
    expect(sizes1.rowHeights.get(4)).toBe(40);
    // Excel's standard 8.43-char column (64px) and 15pt row (20px) when nothing is declared
    const sizes2 = result.sizesBySheet.get(s2.id)!;
    expect(sizes2.defaultColWidth).toBe(64);
    expect(sizes2.defaultRowHeight).toBe(20);
  });

  it('converts stored column widths without double-counting the cell padding', async () => {
    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.getColumn(1).width = 9.140625; // what Excel stores for its default "8.43" column
    ws.getCell('A1').value = 'x';
    const result = await importXlsx((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    // Equal to the sheet default (64px), so no per-column entry is needed
    expect(result.sizesBySheet.get(result.workbook.sheets[0].id)?.colWidths.has(0)).toBe(false);
  });

  it('round-trips per-sheet default sizes, and writes the app defaults for sheets without them', async () => {
    const sheet1 = buildSheet1();
    const sheet2 = buildSheet2();
    const buffer = await exportXlsx({
      sheets: [sheet1, sheet2],
      activeSheetId: sheet1.id,
      colWidths: new Map(),
      rowHeights: new Map(),
      sizesBySheet: new Map([
        [sheet1.id, { colWidths: new Map(), rowHeights: new Map(), defaultColWidth: 84, defaultRowHeight: 30 }],
      ]),
    });
    const result = await importXlsx(buffer);
    const [s1, s2] = result.workbook.sheets;
    expect(result.sizesBySheet.get(s1.id)?.defaultColWidth).toBe(84);
    expect(result.sizesBySheet.get(s1.id)?.defaultRowHeight).toBe(30);
    // A sheet at the app defaults opens at the same size in Excel (and back here)
    expect(result.sizesBySheet.get(s2.id)?.defaultColWidth).toBe(100);
    expect(result.sizesBySheet.get(s2.id)?.defaultRowHeight).toBe(24);
  });

  it('imports a Date cell as an Excel serial number', async () => {
    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.getCell('A1').value = new Date(Date.UTC(2026, 3, 10));
    const raw = await workbook.xlsx.writeBuffer();
    const view = raw as unknown as { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;

    const result = await importXlsx(buffer);
    const a1 = result.workbook.sheets[0].cells.get('A1');
    expect(a1?.rawValue).toBe('46122');
  });

  it('round-trips tab color, sheet hidden state, and hidden rows/cols', async () => {
    const sheet1 = buildSheet1();
    sheet1.tabColor = '#FF0000';
    sheet1.hiddenRows = [1, 3];
    sheet1.hiddenCols = [2];
    const sheet2 = buildSheet2();
    sheet2.hidden = true;

    const buffer = await exportXlsx({
      sheets: [sheet1, sheet2],
      activeSheetId: sheet1.id,
      colWidths: new Map(),
      rowHeights: new Map(),
    });

    const result = await importXlsx(buffer);
    const [importedSheet1, importedSheet2] = result.workbook.sheets;

    expect(importedSheet1.tabColor).toBe('#FF0000');
    expect(importedSheet1.hidden).toBeUndefined();
    expect(importedSheet1.hiddenRows).toEqual([1, 3]);
    expect(importedSheet1.hiddenCols).toEqual([2]);

    expect(importedSheet2.hidden).toBe(true);
  });

  it('rejects an invalid buffer with no sheets', async () => {
    await expect(importXlsx(new ArrayBuffer(10))).rejects.toThrow();
  });
});

describe('importXlsx rich text robustness', () => {
  it('imports hyperlinks whose text is rich text (formatted link labels)', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Links');
    ws.getCell('A1').value = {
      text: { richText: [{ text: 'Go ', font: { bold: true } }, { text: 'here' }] },
      hyperlink: 'https://example.com/?q="x"',
    } as unknown as import('exceljs').CellValue;
    ws.getCell('A2').value = { richText: [{ text: 'rich ' }, { text: 'text', font: { italic: true } }] };
    ws.getCell('B1').value = 'x';
    ws.getCell('B1').dataValidation = { type: 'list', allowBlank: true, formulae: ['$A$1:$A$2'] };
    const buf = await wb.xlsx.writeBuffer();

    const result = await importXlsx(buf as ArrayBuffer);
    const cells = result.workbook.sheets[0].cells;
    expect(cells.get('A1')?.rawValue).toBe('=HYPERLINK("https://example.com/?q=""x""","Go here")');
    expect(cells.get('A2')?.rawValue).toBe('rich text');
    expect(cells.get('B1')?.validation?.listValues).toEqual(['Go here', 'rich text']);
  });
});
