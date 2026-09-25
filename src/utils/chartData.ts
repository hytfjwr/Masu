/**
 * Pure data transformation from a ChartData's source range + cell contents into a
 * chart-library-agnostic model (labels + per-series numeric values), used by ChartPanel.
 */
import type { ChartData } from '../types/chart';
import { t } from '../i18n';

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export interface ChartModel {
  labels: string[];
  series: ChartSeries[];
}

/** A single resolved cell's display text and typed value, as seen by the chart builder. */
export interface ChartCell {
  display: string;
  value: number | string | boolean | undefined;
}

export type ChartCellGetter = (col: number, row: number) => ChartCell | undefined;

const DEFAULT_PALETTE = [
  '#3B82F6',
  '#EF4444',
  '#22C55E',
  '#EAB308',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

export { DEFAULT_PALETTE };

function displayOf(cell: ChartCell | undefined): string {
  return cell?.display ?? '';
}

/** Numeric value of a cell, or NaN when it isn't a number (never 0 — recharts treats NaN/null as a gap). */
function toNumber(cell: ChartCell | undefined): number {
  if (!cell) return NaN;
  if (typeof cell.value === 'number') return cell.value;
  const text = cell.display.trim();
  if (text === '') return NaN;
  const n = Number(text);
  return Number.isNaN(n) ? NaN : n;
}

/**
 * Build the generic (non-scatter) label/series model for one axis orientation.
 * `primary` iterates the series axis (columns when seriesIn='columns', rows when 'rows');
 * `secondary` iterates the category axis.
 *
 * `excludePrimaryHeader` skips the primary axis's index-0 (it holds category label text, read
 * via `labelCellAt`); `excludeSecondaryHeader` skips the secondary axis's index-0 (it holds
 * series-name text, read via `headerCellAt`). E.g. in the default "series in columns" layout,
 * column A is the primary axis's index-0 (labels) and row 1 is the secondary axis's index-0
 * (headers/series names).
 */
function buildOriented(
  chart: ChartData,
  palette: string[],
  primaryStart: number,
  primaryEnd: number,
  secondaryStart: number,
  secondaryEnd: number,
  excludePrimaryHeader: boolean,
  excludeSecondaryHeader: boolean,
  cellAt: (primary: number, secondary: number) => ChartCell | undefined,
  headerCellAt: (primary: number) => ChartCell | undefined,
  labelCellAt: (secondary: number) => ChartCell | undefined,
): ChartModel {
  const dataPrimaryStart = excludePrimaryHeader ? primaryStart + 1 : primaryStart;
  const dataSecondaryStart = excludeSecondaryHeader ? secondaryStart + 1 : secondaryStart;

  const labels: string[] = [];
  for (let s = dataSecondaryStart; s <= secondaryEnd; s++) {
    labels.push(
      excludePrimaryHeader ? displayOf(labelCellAt(s)) : String(s - dataSecondaryStart + 1),
    );
  }

  const series: ChartSeries[] = [];
  let idx = 0;
  for (let p = dataPrimaryStart; p <= primaryEnd; p++) {
    const headerText = excludeSecondaryHeader ? displayOf(headerCellAt(p)) : '';
    const name = headerText || t('engine.chartData.seriesName', { index: idx + 1 });
    const values: number[] = [];
    for (let s = dataSecondaryStart; s <= secondaryEnd; s++) {
      values.push(toNumber(cellAt(p, s)));
    }
    series.push({
      name,
      color: chart.seriesColors?.[idx] ?? palette[idx % palette.length],
      values,
    });
    idx++;
  }

  return { labels, series };
}

/**
 * Turn a chart's source range + cell contents into a { labels, series } model, honoring
 * seriesIn / useFirstRowAsHeaders / useFirstColumnAsLabels. Values that aren't numbers are
 * NaN (never 0); the caller (ChartPanel) converts NaN to null for recharts.
 *
 * For 'scatter', the label column/row becomes series[0] (the X values, numeric), and
 * `labels` holds that same column/row's display text; the remaining series are the Y values.
 */
export function buildChartModel(
  chart: ChartData,
  getCell: ChartCellGetter,
  palette: string[] = DEFAULT_PALETTE,
): ChartModel {
  const { startCol, startRow, endCol, endRow } = chart.sourceRange;
  const useHeaderRow = chart.useFirstRowAsHeaders ?? true;
  const useHeaderCol = chart.useFirstColumnAsLabels ?? true;
  const seriesIn = chart.seriesIn ?? 'columns';

  const base =
    seriesIn === 'rows'
      ? buildOriented(
          chart,
          palette,
          startRow,
          endRow,
          startCol,
          endCol,
          useHeaderRow,
          useHeaderCol,
          (primaryRow, secondaryCol) => getCell(secondaryCol, primaryRow),
          (primaryRow) => getCell(startCol, primaryRow),
          (secondaryCol) => getCell(secondaryCol, startRow),
        )
      : buildOriented(
          chart,
          palette,
          startCol,
          endCol,
          startRow,
          endRow,
          useHeaderCol,
          useHeaderRow,
          (primaryCol, secondaryRow) => getCell(primaryCol, secondaryRow),
          (primaryCol) => getCell(primaryCol, startRow),
          (secondaryRow) => getCell(startCol, secondaryRow),
        );

  if (chart.type !== 'scatter') return base;

  // Scatter: the label axis becomes the X series (numeric), the rest are Y series.
  const xValues = base.labels.map((label) => {
    const n = Number(label);
    return label.trim() === '' || Number.isNaN(n) ? NaN : n;
  });
  const xName = displayOf(useHeaderRow ? getCell(startCol, startRow) : undefined);
  const xSeries: ChartSeries = { name: xName || 'X', color: palette[0], values: xValues };
  const ySeries = base.series.map((s, i) => ({
    ...s,
    color: chart.seriesColors?.[i + 1] ?? palette[(i + 1) % palette.length],
  }));

  return { labels: base.labels, series: [xSeries, ...ySeries] };
}
