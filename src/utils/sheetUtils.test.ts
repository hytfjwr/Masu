import { describe, it, expect } from 'vitest';
import {
  generateSheetId,
  createEmptySheet,
  generateSheetName,
  generateCopyName,
  deepCloneCellDataMap,
  deepCloneSheet,
  deepCloneSheets,
} from './sheetUtils';
import type { CellDataMap, SheetData } from '../types/grid';

describe('generateSheetId', () => {
  it('generates unique IDs on successive calls', () => {
    const id1 = generateSheetId();
    const id2 = generateSheetId();
    expect(id1).not.toBe(id2);
  });

  it('returns a string starting with "sheet_"', () => {
    const id = generateSheetId();
    expect(id.startsWith('sheet_')).toBe(true);
  });
});

describe('createEmptySheet', () => {
  it('creates a sheet with the given name and empty cells', () => {
    const sheet = createEmptySheet('TestSheet');
    expect(sheet.name).toBe('TestSheet');
    expect(sheet.cells.size).toBe(0);
    expect(sheet.id).toBeTruthy();
    expect(sheet.colCount).toBe(26);
    expect(sheet.rowCount).toBe(100);
  });

  it('initializes frozen pane state to zero', () => {
    const sheet = createEmptySheet('Test');
    expect(sheet.frozenRows).toBe(0);
    expect(sheet.frozenCols).toBe(0);
  });

  it('initializes sort state to none', () => {
    const sheet = createEmptySheet('Test');
    expect(sheet.sortState).toEqual({ col: -1, direction: 'none' });
  });

  it('initializes filter state to empty map', () => {
    const sheet = createEmptySheet('Test');
    expect(sheet.filterState.size).toBe(0);
  });

  it('generates unique IDs for different sheets', () => {
    const s1 = createEmptySheet('Sheet1');
    const s2 = createEmptySheet('Sheet2');
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('generateSheetName', () => {
  it('returns Sheet1 when no existing names', () => {
    expect(generateSheetName([])).toBe('Sheet1');
  });

  it('returns Sheet2 when Sheet1 exists', () => {
    expect(generateSheetName(['Sheet1'])).toBe('Sheet2');
  });

  it('skips existing names to find the next available', () => {
    expect(generateSheetName(['Sheet1', 'Sheet2', 'Sheet3'])).toBe('Sheet4');
  });

  it('fills gaps in numbering', () => {
    expect(generateSheetName(['Sheet1', 'Sheet3'])).toBe('Sheet2');
  });
});

describe('generateCopyName', () => {
  it('returns "<name> のコピー" when no conflict exists', () => {
    expect(generateCopyName('Sheet1', [])).toBe('Sheet1 のコピー');
  });

  it('appends "(2)" when the base copy name already exists', () => {
    expect(generateCopyName('Sheet1', ['Sheet1 のコピー'])).toBe('Sheet1 のコピー (2)');
  });

  it('skips existing numbered copies to find the next available', () => {
    expect(generateCopyName('Sheet1', ['Sheet1 のコピー', 'Sheet1 のコピー (2)'])).toBe(
      'Sheet1 のコピー (3)',
    );
  });
});

describe('deepCloneCellDataMap', () => {
  it('creates an independent copy of the cell data', () => {
    const original: CellDataMap = new Map();
    original.set('A1', { rawValue: '10', displayValue: '10' });
    original.set('B1', {
      rawValue: '=A1',
      displayValue: '10',
      formula: 'A1',
      dependencies: ['A1'],
    });

    const clone = deepCloneCellDataMap(original);

    // Should have same keys and values
    expect(clone.size).toBe(2);
    expect(clone.get('A1')?.rawValue).toBe('10');
    expect(clone.get('B1')?.formula).toBe('A1');
    expect(clone.get('B1')?.dependencies).toEqual(['A1']);

    // Should be independent (mutation doesn't affect original)
    clone.get('A1')!.rawValue = 'changed';
    expect(original.get('A1')!.rawValue).toBe('10');

    // Dependencies array should be independent
    clone.get('B1')!.dependencies!.push('C1');
    expect(original.get('B1')!.dependencies).toEqual(['A1']);
  });

  it('clones style objects independently', () => {
    const original: CellDataMap = new Map();
    original.set('A1', {
      rawValue: 'hello',
      displayValue: 'hello',
      style: { bold: true, textColor: '#FF0000' },
    });

    const clone = deepCloneCellDataMap(original);
    clone.get('A1')!.style!.bold = false;
    expect(original.get('A1')!.style!.bold).toBe(true);
  });
});

describe('deepCloneSheet', () => {
  it('creates an independent copy of the sheet', () => {
    const original: SheetData = {
      id: 'test-id',
      name: 'TestSheet',
      cells: new Map([['A1', { rawValue: '5', displayValue: '5' }]]),
      colCount: 26,
      rowCount: 100,
      frozenRows: 2,
      frozenCols: 1,
      sortState: { col: 0, direction: 'asc' },
      filterState: new Map([[0, new Set(['a', 'b'])]]),
      conditionalFormatRules: [],
      merges: new Map(),
      charts: [],
      sparklines: [],
      rowGroups: [],
      colGroups: [],
    };

    const clone = deepCloneSheet(original);

    expect(clone.id).toBe('test-id');
    expect(clone.name).toBe('TestSheet');
    expect(clone.frozenRows).toBe(2);
    expect(clone.frozenCols).toBe(1);
    expect(clone.sortState).toEqual({ col: 0, direction: 'asc' });
    expect(clone.filterState.get(0)).toEqual(new Set(['a', 'b']));

    // Mutation test
    clone.cells.get('A1')!.rawValue = 'changed';
    expect(original.cells.get('A1')!.rawValue).toBe('5');

    // Sort state independence
    clone.sortState.col = 5;
    expect(original.sortState.col).toBe(0);

    // Filter state independence
    clone.filterState.get(0)!.add('c');
    expect(original.filterState.get(0)!.size).toBe(2);
  });

  it('clones tabColor, hidden, hiddenRows, hiddenCols independently', () => {
    const original: SheetData = {
      id: 'test-id',
      name: 'TestSheet',
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
      tabColor: '#FF0000',
      hidden: true,
      hiddenRows: [1, 3],
      hiddenCols: [2],
    };

    const clone = deepCloneSheet(original);
    expect(clone.tabColor).toBe('#FF0000');
    expect(clone.hidden).toBe(true);
    expect(clone.hiddenRows).toEqual([1, 3]);
    expect(clone.hiddenCols).toEqual([2]);

    // Independence
    clone.hiddenRows!.push(9);
    expect(original.hiddenRows).toEqual([1, 3]);
  });

  it('clones preSortData when present', () => {
    const original: SheetData = {
      id: 'test-id',
      name: 'TestSheet',
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
      preSortData: new Map([['A1', { rawValue: '1', displayValue: '1' }]]),
    };

    const clone = deepCloneSheet(original);
    expect(clone.preSortData).toBeDefined();
    expect(clone.preSortData!.get('A1')?.rawValue).toBe('1');

    // Independence
    clone.preSortData!.get('A1')!.rawValue = 'changed';
    expect(original.preSortData!.get('A1')!.rawValue).toBe('1');
  });
});

describe('deepCloneSheets', () => {
  it('clones an array of sheets independently', () => {
    const sheets: SheetData[] = [createEmptySheet('Sheet1'), createEmptySheet('Sheet2')];
    sheets[0].cells.set('A1', { rawValue: 'test', displayValue: 'test' });

    const cloned = deepCloneSheets(sheets);
    expect(cloned.length).toBe(2);
    expect(cloned[0].cells.get('A1')?.rawValue).toBe('test');

    // Independence
    cloned[0].cells.get('A1')!.rawValue = 'changed';
    expect(sheets[0].cells.get('A1')!.rawValue).toBe('test');
  });
});
