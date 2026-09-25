import { describe, it, expect } from 'vite-plus/test';
import { buildChartModel, DEFAULT_PALETTE } from './chartData';
import type { ChartData, ChartDataRange } from '../types/chart';
import type { ChartCell, ChartCellGetter } from './chartData';

function makeChart(overrides: Partial<ChartData> = {}): ChartData {
  return {
    id: 'c1',
    type: 'bar',
    title: 'Chart',
    sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 },
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    ...overrides,
  };
}

/** Build a getCell function from a row-major grid of raw values (string | number). */
function gridGetCell(grid: (string | number)[][]): ChartCellGetter {
  return (col: number, row: number): ChartCell | undefined => {
    const value = grid[row]?.[col];
    if (value === undefined) return undefined;
    return { display: String(value), value };
  };
}

describe('buildChartModel', () => {
  it('builds series from columns (default: header row + label column)', () => {
    const grid: (string | number)[][] = [
      ['', 'Y1', 'Y2'],
      ['Jan', 10, 20],
      ['Feb', 15, 25],
    ];
    const chart = makeChart({ sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 } });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.labels).toEqual(['Jan', 'Feb']);
    expect(model.series).toHaveLength(2);
    expect(model.series[0]).toMatchObject({ name: 'Y1', values: [10, 15] });
    expect(model.series[1]).toMatchObject({ name: 'Y2', values: [20, 25] });
  });

  it('builds series from rows when seriesIn is "rows" (transposed layout)', () => {
    const grid: (string | number)[][] = [
      ['', 'Jan', 'Feb', 'Mar'],
      ['Sales', 10, 20, 30],
      ['Cost', 5, 8, 12],
    ];
    const chart = makeChart({
      sourceRange: { startCol: 0, startRow: 0, endCol: 3, endRow: 2 },
      seriesIn: 'rows',
    });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(model.series).toHaveLength(2);
    expect(model.series[0]).toMatchObject({ name: 'Sales', values: [10, 20, 30] });
    expect(model.series[1]).toMatchObject({ name: 'Cost', values: [5, 8, 12] });
  });

  it('falls back to default series names when useFirstRowAsHeaders is false', () => {
    const grid: (string | number)[][] = [
      ['Jan', 10, 20],
      ['Feb', 15, 25],
    ];
    const chart = makeChart({
      sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 1 },
      useFirstRowAsHeaders: false,
    });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.labels).toEqual(['Jan', 'Feb']);
    expect(model.series.map((s) => s.name)).toEqual(['系列1', '系列2']);
    expect(model.series[0].values).toEqual([10, 15]);
  });

  it('falls back to sequential index labels when useFirstColumnAsLabels is false', () => {
    const grid: (string | number)[][] = [
      ['Y1', 'Y2'],
      [10, 20],
      [15, 25],
    ];
    const chart = makeChart({
      sourceRange: { startCol: 0, startRow: 0, endCol: 1, endRow: 2 },
      useFirstColumnAsLabels: false,
    });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.labels).toEqual(['1', '2']);
    expect(model.series[0]).toMatchObject({ name: 'Y1', values: [10, 15] });
  });

  it('treats non-numeric cells as NaN, never 0', () => {
    const grid: (string | number)[][] = [
      ['', 'Y1'],
      ['A', 10],
      ['B', 'n/a'],
      ['C', ''],
    ];
    const chart = makeChart({ sourceRange: { startCol: 0, startRow: 0, endCol: 1, endRow: 3 } });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.series[0].values[0]).toBe(10);
    expect(Number.isNaN(model.series[0].values[1])).toBe(true);
    expect(Number.isNaN(model.series[0].values[2])).toBe(true);
  });

  it('scatter: first series is X values (numeric), the rest are Y series', () => {
    const grid: (string | number)[][] = [
      ['X', 'Y1', 'Y2'],
      [1, 10, 100],
      [2, 15, 150],
      [3, 20, 200],
    ];
    const chart = makeChart({
      type: 'scatter',
      sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 3 } satisfies ChartDataRange,
    });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.labels).toEqual(['1', '2', '3']);
    expect(model.series).toHaveLength(3);
    expect(model.series[0]).toMatchObject({ name: 'X', values: [1, 2, 3] });
    expect(model.series[1]).toMatchObject({ name: 'Y1', values: [10, 15, 20] });
    expect(model.series[2]).toMatchObject({ name: 'Y2', values: [100, 150, 200] });
  });

  it('uses seriesColors when provided, otherwise the palette in order', () => {
    const grid: (string | number)[][] = [
      ['', 'Y1', 'Y2'],
      ['Jan', 10, 20],
    ];
    const chart = makeChart({
      sourceRange: { startCol: 0, startRow: 0, endCol: 2, endRow: 1 },
      seriesColors: ['#111111'],
    });
    const model = buildChartModel(chart, gridGetCell(grid), DEFAULT_PALETTE);

    expect(model.series[0].color).toBe('#111111');
    expect(model.series[1].color).toBe(DEFAULT_PALETTE[1]);
  });
});
