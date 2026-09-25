/** Chart type. 'bar' is kept as the "vertical bar" meaning for backward compatibility with existing data; horizontal bars use 'horizontalBar'. */
export type ChartType =
  | 'bar'
  | 'horizontalBar'
  | 'stackedBar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter';

/** Range of cells used as chart data source */
export interface ChartDataRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

/** A chart embedded in a sheet */
export interface ChartData {
  id: string;
  type: ChartType;
  title: string;
  sourceRange: ChartDataRange;
  /** X position in pixels relative to the grid area origin */
  x: number;
  /** Y position in pixels relative to the grid area origin */
  y: number;
  width: number;
  height: number;
  /** 1 列目（系列が列の場合）/1 行目をラベル（X 軸）として使う（既定 true） */
  useFirstColumnAsLabels?: boolean;
  /** 1 行目を系列名（見出し）として使う（既定 true） */
  useFirstRowAsHeaders?: boolean;
  /** 系列の向き: 'columns' = 各列が 1 系列（既定）、'rows' = 各行が 1 系列 */
  seriesIn?: 'columns' | 'rows';
  /** 系列ごとの色（系列 index → '#RRGGBB'）。未指定はパレット */
  seriesColors?: string[];
  /** 凡例を表示するか（既定 true） */
  showLegend?: boolean;
  /** 凡例の位置（既定 'bottom'） */
  legendPosition?: 'top' | 'bottom' | 'right';
  xAxisTitle?: string;
  yAxisTitle?: string;
  /** グリッド線を表示するか（既定 true） */
  showGridlines?: boolean;
  /** 背景色（既定 テーマの grid-bg） */
  backgroundColor?: string;
}
