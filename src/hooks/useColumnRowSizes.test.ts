// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useColumnRowSizes } from './useColumnRowSizes';
import { GRID_CONSTANTS } from '../types/grid';

describe('useColumnRowSizes', () => {
  it('keeps column/row sizes independent per sheet, and switching activeSheetId switches which sizes are visible', () => {
    const { result, rerender } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );

    act(() => result.current.setColWidth(0, 200));
    act(() => result.current.setRowHeight(0, 60));
    expect(result.current.getColWidth(0)).toBe(200);
    expect(result.current.getRowHeight(0)).toBe(60);

    rerender({ activeSheetId: 'sheet2' });
    // sheet2 has never had a custom size set — defaults
    expect(result.current.getColWidth(0)).toBe(GRID_CONSTANTS.DEFAULT_COL_WIDTH);
    expect(result.current.getRowHeight(0)).toBe(GRID_CONSTANTS.DEFAULT_ROW_HEIGHT);

    act(() => result.current.setColWidth(0, 80));
    expect(result.current.getColWidth(0)).toBe(80);

    // Switching back to sheet1 keeps its own value untouched by sheet2's change
    rerender({ activeSheetId: 'sheet1' });
    expect(result.current.getColWidth(0)).toBe(200);
  });

  it('shiftColWidths/shiftRowHeights only affect the active sheet', () => {
    const { result, rerender } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );

    act(() => result.current.setColWidth(2, 300));
    rerender({ activeSheetId: 'sheet2' });
    act(() => result.current.setColWidth(2, 150));

    rerender({ activeSheetId: 'sheet1' });
    act(() => result.current.shiftColWidths(0, 'insert'));
    expect(result.current.getColWidth(3)).toBe(300);

    rerender({ activeSheetId: 'sheet2' });
    // sheet2's width at col 2 is untouched by sheet1's shift
    expect(result.current.getColWidth(2)).toBe(150);
  });

  it('getAllSizesBySheet/restoreAllSizes round-trip every sheet independently', () => {
    const { result, rerender } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );

    act(() => result.current.setColWidth(0, 120));
    rerender({ activeSheetId: 'sheet2' });
    act(() => result.current.setRowHeight(1, 40));

    const dump = result.current.getAllSizesBySheet();
    expect(dump.get('sheet1')?.colWidths.get(0)).toBe(120);
    expect(dump.get('sheet2')?.rowHeights.get(1)).toBe(40);

    const { result: restored } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );
    act(() => restored.current.restoreAllSizes(dump));
    expect(restored.current.getColWidth(0)).toBe(120);
  });

  it("copySheetSizes clones one sheet's sizes onto another", () => {
    const { result, rerender } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );

    act(() => result.current.setColWidth(0, 250));
    act(() => result.current.copySheetSizes('sheet1', 'sheet1-copy'));

    rerender({ activeSheetId: 'sheet1-copy' });
    expect(result.current.getColWidth(0)).toBe(250);

    // Independent afterwards — changing the copy doesn't affect the original
    act(() => result.current.setColWidth(0, 90));
    rerender({ activeSheetId: 'sheet1' });
    expect(result.current.getColWidth(0)).toBe(250);
  });

  it("getColOffset/getRowOffset reflect the active sheet's custom sizes", () => {
    const { result, rerender } = renderHook(
      ({ activeSheetId }) => useColumnRowSizes(activeSheetId),
      { initialProps: { activeSheetId: 'sheet1' } },
    );

    act(() => result.current.setColWidth(0, GRID_CONSTANTS.DEFAULT_COL_WIDTH + 50));
    expect(result.current.getColOffset(1)).toBe(GRID_CONSTANTS.DEFAULT_COL_WIDTH + 50);

    rerender({ activeSheetId: 'sheet2' });
    expect(result.current.getColOffset(1)).toBe(GRID_CONSTANTS.DEFAULT_COL_WIDTH);
  });
  it("uses a sheet's own default sizes for widths, heights and offsets", () => {
    const { result } = renderHook(({ activeSheetId }) => useColumnRowSizes(activeSheetId), {
      initialProps: { activeSheetId: 's1' },
    });
    act(() =>
      result.current.restoreAllSizes(
        new Map([
          [
            's1',
            {
              colWidths: new Map([[1, 140]]),
              rowHeights: new Map(),
              defaultColWidth: 64,
              defaultRowHeight: 20,
            },
          ],
        ]),
      ),
    );
    expect(result.current.getColWidth(0)).toBe(64);
    expect(result.current.getColWidth(1)).toBe(140);
    expect(result.current.getRowHeight(5)).toBe(20);
    expect(result.current.getColOffset(3)).toBe(64 + 140 + 64);
    expect(result.current.getRowOffset(3)).toBe(60);
    expect(result.current.defaultColWidth).toBe(64);
    expect(result.current.getAllSizesBySheet().get('s1')?.defaultRowHeight).toBe(20);
  });

  it('tells auto-fit row heights apart from user/file heights, and keeps that through inserts', () => {
    const { result } = renderHook(() => useColumnRowSizes('s1'));
    act(() => {
      result.current.setRowHeight(2, 60, { auto: true });
      result.current.setRowHeight(4, 50);
    });
    expect(result.current.isRowHeightManual(2)).toBe(false);
    expect(result.current.isRowHeightManual(4)).toBe(true);
    expect(result.current.isRowHeightManual(7)).toBe(false);
    act(() => result.current.shiftRowHeights(0, 'insert'));
    expect(result.current.isRowHeightManual(3)).toBe(false);
    expect(result.current.getRowHeight(3)).toBe(60);
    expect(result.current.isRowHeightManual(5)).toBe(true);
    act(() => result.current.resetRowHeight(3));
    expect(result.current.getRowHeight(3)).toBe(GRID_CONSTANTS.DEFAULT_ROW_HEIGHT);
  });
});
