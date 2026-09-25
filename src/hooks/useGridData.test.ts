// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGridData } from './useGridData';
import { parseCellKey } from '../utils/coordinates';
import { recalcProfiler } from '../engine/recalcProfiler';

function setup() {
  const { result } = renderHook(() => useGridData());
  const set = (key: string, value: string) => {
    const { col, row } = parseCellKey(key);
    act(() => result.current.setCellValue(col, row, value));
  };
  const cell = (key: string) => {
    const { col, row } = parseCellKey(key);
    return result.current.getCellData(col, row);
  };
  const show = (key: string) => cell(key)?.displayValue ?? '';
  return { result, set, cell, show };
}

describe('useGridData integration', () => {
  it('records recalculation passes with cache stats while the profiler is on', () => {
    const { set } = setup();
    recalcProfiler.clear();
    recalcProfiler.setEnabled(true);
    try {
      for (let r = 1; r <= 40; r++) set(`A${r}`, String(r));
      set('B1', '=SUM(A1:A40)');
      set('B2', '=SUM(A1:A40)*2');
      set('A1', '100');
      const [latest] = recalcProfiler.getRecords();
      expect(latest.kind).toBe('dependents');
      expect(latest.evaluations).toBe(2);
      // the second SUM(A1:A40) in the same pass is served from the call cache
      expect(latest.stats.callHits).toBeGreaterThanOrEqual(1);
    } finally {
      recalcProfiler.setEnabled(false);
    }
  });

  it('exposes dependency info and time-travels through the undo timeline', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('B1', '=A1*10');
    const sheetId = result.current.activeSheetId;
    const info = result.current.getDependencyInfo(sheetId, 'B1');
    expect(info.precedents).toEqual([`${sheetId}:A1`]);
    expect(result.current.getDependencyInfo(sheetId, 'A1').dependents).toEqual([`${sheetId}:B1`]);

    set('A1', '2');
    set('A1', '3');
    expect(show('B1')).toBe('30');
    const timeline = result.current.historyTimeline;
    expect(timeline[timeline.length - 1].current).toBe(true);
    act(() => result.current.jumpToHistory(timeline.length - 3)); // before "A1 = 2"
    expect(show('B1')).toBe('10');
    act(() => result.current.jumpToHistory(result.current.historyTimeline.length - 1));
    expect(show('B1')).toBe('30');
  });

  it('keeps the reason and position of a formula syntax error, and clears it once fixed', () => {
    const { set, cell, show } = setup();
    set('A1', '=SUM(B1:B3');
    expect(show('A1')).toBe('#ERROR!');
    expect(cell('A1')?.parseError).toEqual({
      message: "式が途中で終わっています（')' が必要です）",
      start: 9,
      end: 9,
    });
    set('A1', '=SUM(B1:B3)');
    expect(show('A1')).toBe('0');
    expect(cell('A1')?.parseError).toBeUndefined();
  });

  it('recalculates dependents incrementally', () => {
    const { set, show } = setup();
    set('A1', '2');
    set('A2', '=A1*3');
    set('A3', '=A2+1');
    expect(show('A3')).toBe('7');
    set('A1', '10');
    expect(show('A2')).toBe('30');
    expect(show('A3')).toBe('31');
  });

  it('recalculates whole-column references when a new row is added', () => {
    const { set, show } = setup();
    set('A1', '1');
    set('A2', '2');
    set('B1', '=SUM(A:A)');
    expect(show('B1')).toBe('3');
    set('A50', '10');
    expect(show('B1')).toBe('13');
  });

  it('parses typed values (commas, percent, dates) into numbers', () => {
    const { set, cell, show } = setup();
    set('A1', '1,234');
    set('A2', '10%');
    set('A3', '2026/4/10');
    set('B1', '=A1+A2');
    expect(show('B1')).toBe('1234.1');
    expect(cell('A2')?.style?.numberFormat).toBe('percent');
    expect(cell('A3')?.computed).toBe(46122);
    expect(cell('A3')?.style?.numberFormat).toBe('date');
  });

  it('spills array formulas and updates formulas that read the spill range', () => {
    const { set, show } = setup();
    set('A1', '3');
    set('B1', '=SEQUENCE(A1)');
    set('C1', '=SUM(B1:B5)');
    expect(show('B3')).toBe('3');
    expect(show('C1')).toBe('6');
    set('A1', '4');
    expect(show('B4')).toBe('4');
    expect(show('C1')).toBe('10');
  });

  it('reports #SPILL! when the spill range is blocked and recovers when cleared', () => {
    const { result, set, show } = setup();
    set('A2', 'x');
    set('A1', '={1;2;3}');
    expect(show('A1')).toBe('#SPILL!');
    act(() => result.current.deleteCells([{ col: 0, row: 1 }]));
    // Clearing the blocker does not re-trigger A1 automatically in Excel either; re-enter to recompute
    set('A1', '={1;2;3}');
    expect(show('A3')).toBe('3');
  });

  it('keeps formatting and notes when a cell is cleared with Delete', () => {
    const { result, set, cell } = setup();
    set('A1', '5');
    act(() => result.current.setCellStyle([{ col: 0, row: 0 }], { bold: true }));
    act(() => result.current.setCellComment(0, 0, 'note'));
    act(() => result.current.deleteCells([{ col: 0, row: 0 }]));
    expect(cell('A1')?.rawValue).toBe('');
    expect(cell('A1')?.style?.bold).toBe(true);
    expect(cell('A1')?.comment).toBe('note');
  });

  it('keeps the note when a commented cell is edited', () => {
    const { result, set, cell } = setup();
    set('A1', '5');
    act(() => result.current.setCellComment(0, 0, 'note'));
    set('A1', '6');
    expect(cell('A1')?.comment).toBe('note');
  });

  it('undo restores the previous value and recomputes', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('B1', '=A1+1');
    set('A1', '5');
    expect(show('B1')).toBe('6');
    act(() => result.current.undo());
    expect(show('A1')).toBe('1');
    expect(show('B1')).toBe('2');
  });

  it('detects circular references', () => {
    const { set, show } = setup();
    set('A1', '=B1');
    set('B1', '=SUM(A1:A3)');
    expect(show('B1')).toBe('#REF!');
  });

  it('resolves cross-sheet references', () => {
    const { result, set, show } = setup();
    act(() => result.current.addSheet());
    const [s1, s2] = result.current.sheets;
    act(() => result.current.setActiveSheet(s2.id));
    set('A1', '42');
    act(() => result.current.setActiveSheet(s1.id));
    set('A1', `=${s2.name}!A1*2`);
    expect(show('A1')).toBe('84');
  });

  it('duplicateSheet copies values/formulas (evaluated), names the copy "<name> のコピー", and activates it', () => {
    const { result, set, show } = setup();
    set('A1', '5');
    set('B1', '=A1*2');
    const original = result.current.sheets[0];

    let newId: string | null = null;
    act(() => {
      newId = result.current.duplicateSheet(original.id);
    });

    expect(newId).not.toBeNull();
    expect(result.current.activeSheetId).toBe(newId);
    const newSheet = result.current.sheets.find((s) => s.id === newId);
    expect(newSheet?.name).toBe(`${original.name} のコピー`);
    // Values/formulas were copied and are evaluated on the new (now active) sheet
    expect(show('A1')).toBe('5');
    expect(show('B1')).toBe('10');
  });

  it('moveSheet reorders the sheets array', () => {
    const { result } = setup();
    act(() => result.current.addSheet());
    act(() => result.current.addSheet());
    const [s1, s2, s3] = result.current.sheets;

    act(() => result.current.moveSheet(s1.id, 2));

    expect(result.current.sheets.map((s) => s.id)).toEqual([s2.id, s3.id, s1.id]);
  });

  it('setSheetHidden refuses to hide the last visible sheet, and hiding the active sheet activates another', () => {
    const { result } = setup();
    const [onlySheet] = result.current.sheets;

    let ok = true;
    act(() => {
      ok = result.current.setSheetHidden(onlySheet.id, true);
    });
    expect(ok).toBe(false);
    expect(result.current.sheets[0].hidden).toBeUndefined();

    act(() => result.current.addSheet());
    const [sheetA, sheetB] = result.current.sheets;
    act(() => result.current.setActiveSheet(sheetA.id));

    act(() => {
      ok = result.current.setSheetHidden(sheetA.id, true);
    });
    expect(ok).toBe(true);
    expect(result.current.activeSheetId).toBe(sheetB.id);
  });

  it('shifts hiddenRows when a row is inserted above them', () => {
    const { result } = setup();
    act(() => result.current.hideRows(2, 2));
    expect(result.current.getActiveSheet().hiddenRows).toEqual([2]);

    act(() => result.current.insertRow(0, 'before', result.current.getRowCount(), 1_000_000));

    expect(result.current.getActiveSheet().hiddenRows).toEqual([3]);
  });

  it('undo restores hiddenRows after hideRows', () => {
    const { result } = setup();
    act(() => result.current.hideRows(1, 1));
    expect(result.current.getActiveSheet().hiddenRows).toEqual([1]);

    act(() => result.current.undo());

    expect(result.current.getActiveSheet().hiddenRows).toBeUndefined();
  });

  it('insertRows inserts several rows at once as a single undo step', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('A2', '2');

    let ok = false;
    act(() => {
      ok = result.current.insertRows(1, 3, result.current.getRowCount(), 1_000_000);
    });
    expect(ok).toBe(true);
    // A2's old value shifted down by 3 rows
    expect(show('A2')).toBe('');
    expect(show('A5')).toBe('2');
    expect(show('A1')).toBe('1');

    act(() => result.current.undo());
    expect(show('A2')).toBe('2');
    expect(show('A5')).toBe('');
  });

  it('deleteRows removes a range of rows at once as a single undo step', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('A2', '2');
    set('A3', '3');
    set('A4', '4');

    let ok = false;
    act(() => {
      ok = result.current.deleteRows(1, 2);
    });
    expect(ok).toBe(true);
    expect(show('A1')).toBe('1');
    expect(show('A2')).toBe('4');
    expect(show('A3')).toBe('');

    act(() => result.current.undo());
    expect(show('A2')).toBe('2');
    expect(show('A3')).toBe('3');
    expect(show('A4')).toBe('4');
  });

  it('insertColumns inserts several columns at once as a single undo step', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('B1', '2');

    let ok = false;
    act(() => {
      ok = result.current.insertColumns(1, 2, result.current.getColCount(), 1_000);
    });
    expect(ok).toBe(true);
    expect(show('B1')).toBe('');
    expect(show('D1')).toBe('2');

    act(() => result.current.undo());
    expect(show('B1')).toBe('2');
    expect(show('D1')).toBe('');
  });

  it('deleteColumns removes a range of columns at once as a single undo step', () => {
    const { result, set, show } = setup();
    set('A1', '1');
    set('B1', '2');
    set('C1', '3');
    set('D1', '4');

    let ok = false;
    act(() => {
      ok = result.current.deleteColumns(1, 2);
    });
    expect(ok).toBe(true);
    expect(show('A1')).toBe('1');
    expect(show('B1')).toBe('4');
    expect(show('C1')).toBe('');

    act(() => result.current.undo());
    expect(show('B1')).toBe('2');
    expect(show('C1')).toBe('3');
    expect(show('D1')).toBe('4');
  });
});

describe('useGridData plain text format', () => {
  it('keeps input verbatim in cells formatted as plain text', () => {
    const { result } = renderHook(() => useGridData());
    act(() => result.current.setCellStyle([{ col: 0, row: 0 }], { numberFormat: 'plainText' }));
    act(() => result.current.setCellValue(0, 0, '00123'));
    expect(result.current.getCellData(0, 0)?.computed).toBe('00123');
  });
});

describe('useGridData transactions', () => {
  it('groups several mutations into one undo step', () => {
    const { result } = renderHook(() => useGridData());
    act(() => result.current.setCellValue(0, 0, 'a'));
    act(() =>
      result.current.transact(() => {
        result.current.setCellValue(0, 0, 'b');
        result.current.setCellStyle([{ col: 0, row: 0 }], { bold: true });
      }),
    );
    act(() => result.current.undo());
    expect(result.current.getCellData(0, 0)?.rawValue).toBe('a');
    expect(result.current.getCellData(0, 0)?.style?.bold).toBeUndefined();
  });
});

describe('useGridData evaluateFormulaAt', () => {
  it('evaluates a formula against the current cell data', () => {
    const { set, result } = setup();
    set('A1', '5');
    set('B1', '10');
    expect(result.current.evaluateFormulaAt('A1+B1', 1, 0)).toBe(15);
  });

  it('resolves currentCell-dependent functions relative to the given position', () => {
    const { result } = setup();
    expect(result.current.evaluateFormulaAt('ROW()', 2, 4)).toBe(5);
  });
});

describe('useGridData resolveRangeValues', () => {
  it('resolves a same-sheet range in row-major order', () => {
    const { set, result } = setup();
    set('A1', '1');
    set('B1', '2');
    set('A2', '3');
    set('B2', '4');
    expect(result.current.resolveRangeValues('A1:B2')).toEqual([1, 2, 3, 4]);
  });

  it('resolves a cross-sheet range and returns null for an unresolvable sheet name', () => {
    const { set, result } = setup();
    act(() => result.current.addSheet());
    const [s1, s2] = result.current.sheets;
    act(() => result.current.setActiveSheet(s2.id));
    set('A1', '42');
    act(() => result.current.setActiveSheet(s1.id));
    expect(result.current.resolveRangeValues(`${s2.name}!A1:A1`)).toEqual([42]);
    expect(result.current.resolveRangeValues('NoSuchSheet!A1:A1')).toBeNull();
  });
});

describe('useGridData document title', () => {
  it('setTitle updates title without being undoable', () => {
    const { result, set } = setup();
    set('A1', '1');
    act(() => result.current.setTitle('売上レポート'));
    expect(result.current.title).toBe('売上レポート');

    act(() => result.current.undo());
    // undo only reverts the cell edit, not the title
    expect(result.current.title).toBe('売上レポート');
    expect(result.current.getCellData(0, 0)?.rawValue ?? '').toBe('');
  });

  it('setTitle("") clears the title back to undefined', () => {
    const { result } = setup();
    act(() => result.current.setTitle('Foo'));
    expect(result.current.title).toBe('Foo');
    act(() => result.current.setTitle(''));
    expect(result.current.title).toBeUndefined();
  });

  it("replaceWorkbook carries over the incoming workbook's title", () => {
    const { result } = setup();
    act(() => result.current.setTitle('Old Title'));
    act(() =>
      result.current.replaceWorkbook({
        sheets: result.current.sheets,
        activeSheetId: result.current.activeSheetId,
        title: 'Imported Title',
      }),
    );
    expect(result.current.title).toBe('Imported Title');
  });

  it('newWorkbook resets to a single empty sheet with no title', () => {
    const { result, set } = setup();
    set('A1', '1');
    act(() => result.current.addSheet());
    act(() => result.current.setTitle('Old Title'));
    act(() => result.current.addNamedRange('Foo', 'A1'));

    act(() => result.current.newWorkbook());

    expect(result.current.title).toBeUndefined();
    expect(result.current.sheets).toHaveLength(1);
    expect(result.current.namedRanges).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.getCellData(0, 0)?.rawValue ?? '').toBe('');
  });
});

describe('useGridData review fixes', () => {
  it('counts spilled cells in whole-column references', () => {
    const { result } = renderHook(() => useGridData());
    act(() => result.current.setCellValue(0, 0, '=SEQUENCE(5,1)'));
    act(() => result.current.setCellValue(1, 0, '=SUM(A:A)'));
    expect(result.current.getCellData(1, 0)?.displayValue).toBe('15');
  });

  it('updates whole-column and cross-sheet references on column insert', () => {
    const { result } = renderHook(() => useGridData());
    act(() => result.current.addSheet());
    const [s1, s2] = result.current.sheets;
    // Sheet1: A1..A2 values, C1 = SUM(A:A)
    act(() => result.current.setActiveSheet(s1.id));
    act(() => result.current.setCellValue(0, 0, '1'));
    act(() => result.current.setCellValue(0, 1, '2'));
    act(() => result.current.setCellValue(2, 0, '=SUM(A:A)'));
    // Sheet2: B1 = Sheet1!A1 * 10, and a same-sheet ref that must not move
    act(() => result.current.setActiveSheet(s2.id));
    act(() => result.current.setCellValue(0, 0, '7'));
    act(() => result.current.setCellValue(1, 0, `=${s1.name}!A1*10+A1`));
    // Insert a column before A on Sheet1
    act(() => result.current.setActiveSheet(s1.id));
    act(() => {
      result.current.insertColumn(0, 'before', 26, 16384);
    });
    expect(result.current.getCellData(3, 0)?.rawValue).toBe('=SUM(B:B)');
    expect(result.current.getCellData(3, 0)?.displayValue).toBe('3');
    act(() => result.current.setActiveSheet(s2.id));
    expect(result.current.getCellData(1, 0)?.rawValue).toBe(`=${s1.name}!B1*10+A1`);
    expect(result.current.getCellData(1, 0)?.displayValue).toBe('17');
  });
});

describe('useGridData import evaluates formulas', () => {
  it('evaluates formulas from imported cell data (CSV/JSON path)', () => {
    const { result } = renderHook(() => useGridData());
    const data = new Map([
      ['A1', { rawValue: '2', displayValue: '2' }],
      ['A2', { rawValue: '3', displayValue: '3' }],
      ['A3', { rawValue: '=SUM(A1:A2)', displayValue: '=SUM(A1:A2)' }],
    ]);
    act(() => result.current.replaceAllData(data));
    expect(result.current.getCellData(0, 2)?.displayValue).toBe('5');
    expect(result.current.getCellData(0, 2)?.formula).toBe('SUM(A1:A2)');
  });

  it('evaluates formulas after replaceWorkbook (native file/xlsx/autosave path)', () => {
    const { result } = renderHook(() => useGridData());
    const sheet = {
      ...result.current.sheets[0],
      cells: new Map([
        ['E2', { rawValue: '10', displayValue: '10' }],
        ['E3', { rawValue: '20', displayValue: '20' }],
        ['E46', { rawValue: '=SUM(E2:E45)', displayValue: '=SUM(E2:E45)' }],
      ]),
    };
    act(() => result.current.replaceWorkbook({ sheets: [sheet], activeSheetId: sheet.id }));
    expect(result.current.getCellData(4, 45)?.displayValue).toBe('30');
  });
});

describe('useGridData recalculation caches', () => {
  it('does not confuse same-geometry ranges on different sheets within one pass', () => {
    const { result } = renderHook(() => useGridData());
    act(() => result.current.addSheet());
    const [s1, s2] = result.current.sheets;
    act(() => result.current.setActiveSheet(s2.id));
    act(() =>
      result.current.batchSetCellValues(
        Array.from({ length: 20 }, (_, i) => ({ col: 0, row: i, value: '100' })),
      ),
    );
    act(() => result.current.setActiveSheet(s1.id));
    act(() =>
      result.current.batchSetCellValues([
        ...Array.from({ length: 20 }, (_, i) => ({ col: 0, row: i, value: '1' })),
        { col: 1, row: 0, value: '=SUM(A:A)' },
        { col: 1, row: 1, value: `=SUM(${s2.name}!A:A)` },
      ]),
    );
    expect(result.current.getCellData(1, 0)?.displayValue).toBe('20');
    expect(result.current.getCellData(1, 1)?.displayValue).toBe('2000');
  });

  it('evaluates formulas of one batch in dependency order (deferred batch evaluation)', () => {
    const { result } = renderHook(() => useGridData());
    act(() =>
      result.current.batchSetCellValues([
        { col: 2, row: 0, value: '=B1*2' },
        { col: 1, row: 0, value: '=A1+1' },
        { col: 0, row: 0, value: '5' },
        { col: 3, row: 0, value: '=SUM(A1:C1)' },
      ]),
    );
    expect(result.current.getCellData(1, 0)?.displayValue).toBe('6');
    expect(result.current.getCellData(2, 0)?.displayValue).toBe('12');
    expect(result.current.getCellData(3, 0)?.displayValue).toBe('23');
  });

  it('flags a cycle created inside one batch', () => {
    const { result } = renderHook(() => useGridData());
    act(() =>
      result.current.batchSetCellValues([
        { col: 0, row: 0, value: '=B1' },
        { col: 1, row: 0, value: '=A1' },
      ]),
    );
    expect(result.current.getCellData(1, 0)?.displayValue).toBe('#REF!');
  });
});
