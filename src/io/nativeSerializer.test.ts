import { describe, it, expect } from 'vite-plus/test';
import { serialize, deserialize } from './nativeSerializer';
import type { SheetData } from '../types/grid';

function createTestSheet(overrides: Partial<SheetData> = {}): SheetData {
  return {
    id: 'sheet1',
    name: 'Sheet1',
    cells: new Map(),
    colCount: 26,
    rowCount: 100,
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
    ...overrides,
  };
}

describe('nativeSerializer', () => {
  describe('serialize', () => {
    it('produces valid JSON with version 1', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.workbook.sheets).toHaveLength(1);
      expect(parsed.workbook.activeSheetId).toBe('sheet1');
    });

    it('round-trips per-sheet default column width / row height (and omits them when unset)', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
        sizesBySheet: new Map([
          [
            'sheet1',
            {
              colWidths: new Map([[1, 140]]),
              rowHeights: new Map(),
              defaultColWidth: 64,
              defaultRowHeight: 20,
            },
          ],
        ]),
      });
      const sizes = deserialize(json).sizesBySheet.get('sheet1');
      expect(sizes?.defaultColWidth).toBe(64);
      expect(sizes?.defaultRowHeight).toBe(20);
      expect(sizes?.colWidths.get(1)).toBe(140);

      const plain = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      expect(JSON.parse(plain).workbook.sheets[0].defaultColWidth).toBeUndefined();
      expect(deserialize(plain).sizesBySheet.get('sheet1')?.defaultColWidth).toBeUndefined();
    });

    it('serializes cell rawValue and style', () => {
      const cells = new Map();
      cells.set('A1', {
        rawValue: '=SUM(A2:A10)',
        displayValue: '55',
        formula: 'SUM(A2:A10)',
        style: { bold: true, backgroundColor: '#ff0000' },
      });
      const json = serialize({
        sheets: [createTestSheet({ cells })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      const parsed = JSON.parse(json);
      const cellData = parsed.workbook.sheets[0].cells['A1'];
      expect(cellData.rawValue).toBe('=SUM(A2:A10)');
      expect(cellData.style.bold).toBe(true);
      expect(cellData.style.backgroundColor).toBe('#ff0000');
      // displayValue, formula, dependencies should NOT be in the serialized data
      expect(cellData.displayValue).toBeUndefined();
      expect(cellData.formula).toBeUndefined();
    });

    it('serializes column widths and row heights', () => {
      const colWidths = new Map([
        [0, 150],
        [2, 200],
      ]);
      const rowHeights = new Map([[5, 40]]);
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths,
        rowHeights,
      });
      const parsed = JSON.parse(json);
      expect(parsed.workbook.sheets[0].colWidths['0']).toBe(150);
      expect(parsed.workbook.sheets[0].colWidths['2']).toBe(200);
      expect(parsed.workbook.sheets[0].rowHeights['5']).toBe(40);
    });

    it('serializes conditional format rules', () => {
      const rules = [
        {
          id: 'r1',
          range: { startCol: 0, startRow: 0, endCol: 5, endRow: 10 },
          operator: 'greaterThan' as const,
          value1: '100',
          style: { backgroundColor: '#ff0000' },
          priority: 1,
          enabled: true,
        },
      ];
      const json = serialize({
        sheets: [createTestSheet({ conditionalFormatRules: rules })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      const parsed = JSON.parse(json);
      expect(parsed.workbook.sheets[0].conditionalFormatRules).toHaveLength(1);
      expect(parsed.workbook.sheets[0].conditionalFormatRules[0].operator).toBe('greaterThan');
    });

    it('serializes empty workbook without error', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('deserialize', () => {
    it('round-trips serialize -> deserialize', () => {
      const cells = new Map();
      cells.set('A1', { rawValue: '42', displayValue: '42' });
      cells.set('B1', {
        rawValue: '=A1*2',
        displayValue: '84',
        formula: 'A1*2',
        style: { bold: true },
      });

      const json = serialize({
        sheets: [createTestSheet({ cells })],
        activeSheetId: 'sheet1',
        colWidths: new Map([[0, 150]]),
        rowHeights: new Map([[1, 40]]),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets).toHaveLength(1);
      expect(result.workbook.activeSheetId).toBe('sheet1');

      const sheet = result.workbook.sheets[0];
      expect(sheet.cells.get('A1')?.rawValue).toBe('42');
      expect(sheet.cells.get('B1')?.rawValue).toBe('=A1*2');
      expect(sheet.cells.get('B1')?.style?.bold).toBe(true);

      expect(result.colWidths.get(0)).toBe(150);
      expect(result.rowHeights.get(1)).toBe(40);
    });

    it('round-trips independent per-sheet column widths/row heights via sizesBySheet', () => {
      const sheet1 = createTestSheet({ id: 'sheet1', name: 'Sheet1' });
      const sheet2 = createTestSheet({ id: 'sheet2', name: 'Sheet2' });

      const json = serialize({
        sheets: [sheet1, sheet2],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
        sizesBySheet: new Map([
          ['sheet1', { colWidths: new Map([[0, 150]]), rowHeights: new Map([[0, 30]]) }],
          ['sheet2', { colWidths: new Map([[0, 250]]), rowHeights: new Map([[0, 80]]) }],
        ]),
      });

      const result = deserialize(json);
      expect(result.sizesBySheet.get('sheet1')?.colWidths.get(0)).toBe(150);
      expect(result.sizesBySheet.get('sheet1')?.rowHeights.get(0)).toBe(30);
      expect(result.sizesBySheet.get('sheet2')?.colWidths.get(0)).toBe(250);
      expect(result.sizesBySheet.get('sheet2')?.rowHeights.get(0)).toBe(80);
    });

    it('restores frozenRows and frozenCols', () => {
      const json = serialize({
        sheets: [createTestSheet({ frozenRows: 2, frozenCols: 1 })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets[0].frozenRows).toBe(2);
      expect(result.workbook.sheets[0].frozenCols).toBe(1);
    });

    it('restores conditional format rules', () => {
      const rules = [
        {
          id: 'r1',
          range: { startCol: 0, startRow: 0, endCol: 5, endRow: 10 },
          operator: 'greaterThan' as const,
          value1: '100',
          style: { backgroundColor: '#ff0000' },
          priority: 1,
          enabled: true,
        },
      ];

      const json = serialize({
        sheets: [createTestSheet({ conditionalFormatRules: rules })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets[0].conditionalFormatRules).toHaveLength(1);
      expect(result.workbook.sheets[0].conditionalFormatRules[0].operator).toBe('greaterThan');
    });

    it('resets sort and filter state', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets[0].sortState).toEqual({ col: -1, direction: 'none' });
      expect(result.workbook.sheets[0].filterState.size).toBe(0);
    });

    it('round-trips the document title', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
        title: '売上レポート',
      });

      const result = deserialize(json);
      expect(result.workbook.title).toBe('売上レポート');
    });

    it('leaves title undefined when not provided', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.title).toBeUndefined();
    });

    it('round-trips new chart fields (type, orientation, customization)', () => {
      const charts = [
        {
          id: 'chart1',
          type: 'donut' as const,
          title: '売上構成',
          sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 3 },
          x: 10,
          y: 20,
          width: 400,
          height: 300,
          useFirstColumnAsLabels: false,
          useFirstRowAsHeaders: false,
          seriesIn: 'rows' as const,
          seriesColors: ['#111111', '#222222'],
          showLegend: false,
          legendPosition: 'right' as const,
          xAxisTitle: 'X軸',
          yAxisTitle: 'Y軸',
          showGridlines: false,
          backgroundColor: '#ffffff',
        },
      ];

      const json = serialize({
        sheets: [createTestSheet({ charts })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const chart = result.workbook.sheets[0].charts[0];
      expect(chart).toMatchObject({
        type: 'donut',
        useFirstColumnAsLabels: false,
        useFirstRowAsHeaders: false,
        seriesIn: 'rows',
        seriesColors: ['#111111', '#222222'],
        showLegend: false,
        legendPosition: 'right',
        xAxisTitle: 'X軸',
        yAxisTitle: 'Y軸',
        showGridlines: false,
        backgroundColor: '#ffffff',
      });
    });

    it('throws on invalid JSON', () => {
      expect(() => deserialize('not json')).toThrow('Invalid JSON file');
    });

    it('throws on wrong version', () => {
      const json = JSON.stringify({ version: 99, workbook: { sheets: [{}], activeSheetId: 's1' } });
      expect(() => deserialize(json)).toThrow('Unsupported Masu file version');
    });

    it('throws on missing workbook', () => {
      const json = JSON.stringify({ version: 1 });
      expect(() => deserialize(json)).toThrow('missing workbook data');
    });

    it('throws on empty sheets', () => {
      const json = JSON.stringify({ version: 1, workbook: { sheets: [], activeSheetId: '' } });
      expect(() => deserialize(json)).toThrow('no sheets found');
    });

    it('restores named ranges', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
        namedRanges: [
          { name: '売上データ', range: 'A1:A10', refSheetId: 'sheet1' },
          { name: 'Tax', range: 'B1', refSheetId: 'sheet1' },
        ],
      });

      const result = deserialize(json);
      expect(result.workbook.namedRanges).toHaveLength(2);
      expect(result.workbook.namedRanges![0].name).toBe('売上データ');
      expect(result.workbook.namedRanges![1].range).toBe('B1');
    });

    it('restores hyperlink metadata', () => {
      const cells = new Map();
      cells.set('A1', {
        rawValue: '=HYPERLINK("https://example.com","Test")',
        displayValue: 'Test',
        hyperlink: { url: 'https://example.com', label: 'Test' },
      });

      const json = serialize({
        sheets: [createTestSheet({ cells })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const cell = result.workbook.sheets[0].cells.get('A1');
      expect(cell?.hyperlink).toEqual({ url: 'https://example.com', label: 'Test' });
    });

    it('restores spillExtent on origin cells', () => {
      const cells = new Map();
      cells.set('A1', {
        rawValue: '=SEQUENCE(3)',
        displayValue: '1',
        spillExtent: { rows: 3, cols: 1 },
      });

      const json = serialize({
        sheets: [createTestSheet({ cells })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const cell = result.workbook.sheets[0].cells.get('A1');
      expect(cell?.spillExtent).toEqual({ rows: 3, cols: 1 });
    });

    it('skips spill target cells during serialization', () => {
      const cells = new Map();
      cells.set('A1', {
        rawValue: '=SEQUENCE(3)',
        displayValue: '1',
        spillExtent: { rows: 3, cols: 1 },
      });
      cells.set('A2', {
        rawValue: '',
        displayValue: '2',
        spillSource: 'A1',
      });
      cells.set('A3', {
        rawValue: '',
        displayValue: '3',
        spillSource: 'A1',
      });

      const json = serialize({
        sheets: [createTestSheet({ cells })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const parsed = JSON.parse(json);
      // Spill target cells should not be serialized
      expect(parsed.workbook.sheets[0].cells['A2']).toBeUndefined();
      expect(parsed.workbook.sheets[0].cells['A3']).toBeUndefined();
      // Origin cell should be serialized
      expect(parsed.workbook.sheets[0].cells['A1']).toBeDefined();
    });

    it('handles old format without named ranges (backward compat)', () => {
      const oldFormatJson = JSON.stringify({
        version: 1,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        workbook: {
          sheets: [
            {
              id: 'sheet1',
              name: 'Sheet1',
              cells: { A1: { rawValue: 'hello' } },
              colCount: 26,
              rowCount: 100,
              colWidths: {},
              rowHeights: {},
              frozenRows: 0,
              frozenCols: 0,
              conditionalFormatRules: [],
            },
          ],
          activeSheetId: 'sheet1',
          // No namedRanges field
        },
      });

      const result = deserialize(oldFormatJson);
      expect(result.workbook.sheets).toHaveLength(1);
      expect(result.workbook.namedRanges).toBeUndefined();
    });

    it('restores sparkline settings (round-trip)', () => {
      const sparklines = [
        {
          id: 'sp1',
          type: 'line' as const,
          dataRange: 'B2:L2',
          locationCell: 'M2',
          colors: { primary: '#3B82F6', highPoint: '#FF0000' },
          groupId: 'group1',
        },
      ];

      const json = serialize({
        sheets: [createTestSheet({ sparklines })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets[0].sparklines).toHaveLength(1);
      expect(result.workbook.sheets[0].sparklines[0].type).toBe('line');
      expect(result.workbook.sheets[0].sparklines[0].dataRange).toBe('B2:L2');
      expect(result.workbook.sheets[0].sparklines[0].colors.primary).toBe('#3B82F6');
      expect(result.workbook.sheets[0].sparklines[0].groupId).toBe('group1');
    });

    it('restores row/col group definitions (round-trip)', () => {
      const rowGroups = [
        {
          id: 'rg1',
          start: 2,
          end: 5,
          level: 1,
          collapsed: true,
        },
      ];
      const colGroups = [
        {
          id: 'cg1',
          start: 1,
          end: 3,
          level: 1,
          collapsed: false,
        },
      ];

      const json = serialize({
        sheets: [createTestSheet({ rowGroups, colGroups })],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets[0].rowGroups).toHaveLength(1);
      expect(result.workbook.sheets[0].rowGroups[0].start).toBe(2);
      expect(result.workbook.sheets[0].rowGroups[0].collapsed).toBe(true);
      expect(result.workbook.sheets[0].colGroups).toHaveLength(1);
      expect(result.workbook.sheets[0].colGroups[0].start).toBe(1);
      expect(result.workbook.sheets[0].colGroups[0].collapsed).toBe(false);
    });

    it('handles old format without sparklines/groups (backward compat)', () => {
      const oldFormatJson = JSON.stringify({
        version: 1,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        workbook: {
          sheets: [
            {
              id: 'sheet1',
              name: 'Sheet1',
              cells: { A1: { rawValue: 'test' } },
              colCount: 26,
              rowCount: 100,
              colWidths: {},
              rowHeights: {},
              frozenRows: 0,
              frozenCols: 0,
              conditionalFormatRules: [],
              // No sparklines, rowGroups, colGroups fields
            },
          ],
          activeSheetId: 'sheet1',
        },
      });

      const result = deserialize(oldFormatJson);
      expect(result.workbook.sheets[0].sparklines).toEqual([]);
      expect(result.workbook.sheets[0].rowGroups).toEqual([]);
      expect(result.workbook.sheets[0].colGroups).toEqual([]);
    });

    it('omits empty sparklines/groups during serialization', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });
      const parsed = JSON.parse(json);
      expect(parsed.workbook.sheets[0].sparklines).toBeUndefined();
      expect(parsed.workbook.sheets[0].rowGroups).toBeUndefined();
      expect(parsed.workbook.sheets[0].colGroups).toBeUndefined();
    });

    it('restores tabColor, hidden, hiddenRows, hiddenCols (round-trip)', () => {
      const json = serialize({
        sheets: [
          createTestSheet({
            tabColor: '#FF0000',
            hidden: true,
            hiddenRows: [1, 3],
            hiddenCols: [2],
          }),
        ],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const sheet = result.workbook.sheets[0];
      expect(sheet.tabColor).toBe('#FF0000');
      expect(sheet.hidden).toBe(true);
      expect(sheet.hiddenRows).toEqual([1, 3]);
      expect(sheet.hiddenCols).toEqual([2]);
    });

    it('leaves tabColor/hidden/hiddenRows/hiddenCols undefined when absent (backward compat)', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const sheet = result.workbook.sheets[0];
      expect(sheet.tabColor).toBeUndefined();
      expect(sheet.hidden).toBeUndefined();
      expect(sheet.hiddenRows).toBeUndefined();
      expect(sheet.hiddenCols).toBeUndefined();
    });

    it('restores filterRange, filterState, and filterConditions (round-trip)', () => {
      const json = serialize({
        sheets: [
          createTestSheet({
            filterRange: { startCol: 0, endCol: 2, startRow: 0, endRow: 9 },
            filterState: new Map([[1, new Set(['Tokyo', 'Osaka'])]]),
            filterConditions: { 2: { operator: 'greaterThan', value1: '10' } },
          }),
        ],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const sheet = result.workbook.sheets[0];
      expect(sheet.filterRange).toEqual({ startCol: 0, endCol: 2, startRow: 0, endRow: 9 });
      expect(sheet.filterState.get(1)).toEqual(new Set(['Tokyo', 'Osaka']));
      expect(sheet.filterConditions?.[2]).toEqual({ operator: 'greaterThan', value1: '10' });
    });

    it('leaves filterRange/filterConditions undefined and filterState empty when absent (backward compat)', () => {
      const json = serialize({
        sheets: [createTestSheet()],
        activeSheetId: 'sheet1',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      const sheet = result.workbook.sheets[0];
      expect(sheet.filterRange).toBeUndefined();
      expect(sheet.filterConditions).toBeUndefined();
      expect(sheet.filterState.size).toBe(0);
    });

    it('handles multiple sheets', () => {
      const cells1 = new Map();
      cells1.set('A1', { rawValue: 'Sheet1Data', displayValue: 'Sheet1Data' });
      const cells2 = new Map();
      cells2.set('A1', { rawValue: 'Sheet2Data', displayValue: 'Sheet2Data' });

      const json = serialize({
        sheets: [
          createTestSheet({ id: 's1', name: 'Sheet1', cells: cells1 }),
          createTestSheet({ id: 's2', name: 'Sheet2', cells: cells2 }),
        ],
        activeSheetId: 's2',
        colWidths: new Map(),
        rowHeights: new Map(),
      });

      const result = deserialize(json);
      expect(result.workbook.sheets).toHaveLength(2);
      expect(result.workbook.activeSheetId).toBe('s2');
      expect(result.workbook.sheets[0].cells.get('A1')?.rawValue).toBe('Sheet1Data');
      expect(result.workbook.sheets[1].cells.get('A1')?.rawValue).toBe('Sheet2Data');
    });
  });
});
