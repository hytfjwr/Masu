import { memo, useCallback, useMemo, useState } from 'react';
import type { ChartData, ChartDataRange, ChartType } from '../../types/chart';
import type { CellData } from '../../types/grid';
import { buildChartModel, DEFAULT_PALETTE } from '../../utils/chartData';
import type { ChartCell } from '../../utils/chartData';
import { cellKey, parseCellKey } from '../../utils/coordinates';
import { ColorPicker } from '../Toolbar/ColorPicker';

interface ChartEditorPanelProps {
  chart: ChartData;
  onUpdate: (updates: Partial<ChartData>) => void;
  getCellData: (col: number, row: number) => CellData | undefined;
  version: number;
}

type Tab = 'settings' | 'customize';

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: '縦棒' },
  { value: 'horizontalBar', label: '横棒' },
  { value: 'stackedBar', label: '積み上げ棒' },
  { value: 'line', label: '折れ線' },
  { value: 'area', label: 'エリア' },
  { value: 'pie', label: '円' },
  { value: 'donut', label: 'ドーナツ' },
  { value: 'scatter', label: '散布図' },
];

function ChartTypeIcon({ type }: { type: ChartType }) {
  switch (type) {
    case 'bar':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
          <rect x="2" y="10" width="3" height="8" />
          <rect x="8.5" y="4" width="3" height="14" />
          <rect x="15" y="7" width="3" height="11" />
        </svg>
      );
    case 'horizontalBar':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
          <rect x="2" y="2" width="14" height="3" />
          <rect x="2" y="8.5" width="9" height="3" />
          <rect x="2" y="15" width="16" height="3" />
        </svg>
      );
    case 'stackedBar':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
          <rect x="2" y="12" width="4" height="6" />
          <rect x="2" y="6" width="4" height="5" opacity="0.5" />
          <rect x="8" y="8" width="4" height="10" />
          <rect x="8" y="2" width="4" height="5" opacity="0.5" />
          <rect x="14" y="10" width="4" height="8" />
          <rect x="14" y="4" width="4" height="5" opacity="0.5" />
        </svg>
      );
    case 'line':
      return (
        <svg
          viewBox="0 0 20 20"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="2,15 7,7 12,12 18,3" />
        </svg>
      );
    case 'area':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" opacity="0.7">
          <polygon points="2,18 2,12 7,6 12,10 18,2 18,18" />
        </svg>
      );
    case 'pie':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20">
          <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.3" />
          <path d="M10,10 L10,2 A8,8 0 0,1 17,13 Z" fill="currentColor" />
        </svg>
      );
    case 'donut':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            opacity="0.3"
          />
          <path d="M10,2 A8,8 0 0,1 17,13" fill="none" stroke="currentColor" strokeWidth="4" />
        </svg>
      );
    case 'scatter':
      return (
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
          <circle cx="4" cy="15" r="1.6" />
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="13" cy="11" r="1.6" />
          <circle cx="17" cy="4" r="1.6" />
          <circle cx="7" cy="16" r="1.6" />
        </svg>
      );
  }
}

const CELL_REF_RE = /^[A-Z]{1,3}\d+$/;

function rangeToString(r: ChartDataRange): string {
  const start = cellKey(r.startCol, r.startRow);
  const end = cellKey(r.endCol, r.endRow);
  return start === end ? start : `${start}:${end}`;
}

function parseRangeString(input: string): ChartDataRange | null {
  const parts = input.trim().toUpperCase().split(':');
  if (parts.length === 1) {
    if (!CELL_REF_RE.test(parts[0])) return null;
    const p = parseCellKey(parts[0]);
    return { startCol: p.col, startRow: p.row, endCol: p.col, endRow: p.row };
  }
  if (parts.length !== 2 || !CELL_REF_RE.test(parts[0]) || !CELL_REF_RE.test(parts[1])) return null;
  const a = parseCellKey(parts[0]);
  const b = parseCellKey(parts[1]);
  return {
    startCol: Math.min(a.col, b.col),
    startRow: Math.min(a.row, b.row),
    endCol: Math.max(a.col, b.col),
    endRow: Math.max(a.row, b.row),
  };
}

const inputClass =
  'h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none w-full';
const labelClass = 'flex flex-col gap-1 text-xs text-text-primary';
const tabBtnClass = (active: boolean) =>
  `flex-1 h-7 text-xs rounded transition-colors ${active ? 'bg-accent-selection text-white' : 'text-text-primary bg-ui-bg hover:bg-grid-line/40'}`;

export const ChartEditorPanel = memo(function ChartEditorPanel({
  chart,
  onUpdate,
  getCellData,
  version,
}: ChartEditorPanelProps) {
  const [tab, setTab] = useState<Tab>('settings');
  const [rangeInput, setRangeInput] = useState(() => rangeToString(chart.sourceRange));
  const [rangeError, setRangeError] = useState('');

  const cellGetter = useCallback(
    (col: number, row: number): ChartCell | undefined => {
      const cd = getCellData(col, row);
      if (!cd) return undefined;
      return { display: cd.displayValue, value: cd.computed };
    },
    [getCellData],
  );

  const model = useMemo(
    () => buildChartModel(chart, cellGetter, DEFAULT_PALETTE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chart, cellGetter, version],
  );

  const commitRange = useCallback(() => {
    const parsed = parseRangeString(rangeInput);
    if (!parsed) {
      setRangeError('範囲は "A1" または "A1:B10" の形式で入力してください');
      return;
    }
    setRangeError('');
    onUpdate({ sourceRange: parsed });
  }, [rangeInput, onUpdate]);

  const handleSeriesColorChange = useCallback(
    (index: number, color: string | undefined) => {
      const next = [...(chart.seriesColors ?? [])];
      next[index] = color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
      onUpdate({ seriesColors: next });
    },
    [chart.seriesColors, onUpdate],
  );

  const useFirstRowAsHeaders = chart.useFirstRowAsHeaders ?? true;
  const useFirstColumnAsLabels = chart.useFirstColumnAsLabels ?? true;
  const seriesIn = chart.seriesIn ?? 'columns';
  const showLegend = chart.showLegend ?? true;
  const legendPosition = chart.legendPosition ?? 'bottom';
  const showGridlines = chart.showGridlines ?? true;

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <button
          type="button"
          className={tabBtnClass(tab === 'settings')}
          onClick={() => setTab('settings')}
        >
          設定
        </button>
        <button
          type="button"
          className={tabBtnClass(tab === 'customize')}
          onClick={() => setTab('customize')}
        >
          カスタマイズ
        </button>
      </div>

      {tab === 'settings' && (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-text-primary mb-1 block">グラフの種類</span>
            <div className="grid grid-cols-4 gap-1.5">
              {CHART_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.label}
                  onClick={() => onUpdate({ type: opt.value })}
                  className={`flex flex-col items-center justify-center gap-1 h-14 rounded border text-[10px] transition-colors ${
                    chart.type === opt.value
                      ? 'border-accent-selection text-accent-selection bg-accent-selection/10'
                      : 'border-grid-line text-text-primary hover:bg-grid-line/40'
                  }`}
                >
                  <ChartTypeIcon type={opt.value} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className={labelClass}>
            <span>データ範囲</span>
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              onBlur={commitRange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRange();
                }
              }}
              className={inputClass}
              placeholder="A1:C10"
            />
          </label>
          {rangeError && <div className="text-xs text-error">{rangeError}</div>}

          <label className={labelClass}>
            <span>系列の向き</span>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="radio"
                  name="chart-series-in"
                  checked={seriesIn === 'columns'}
                  onChange={() => onUpdate({ seriesIn: 'columns' })}
                />
                <span>列</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="radio"
                  name="chart-series-in"
                  checked={seriesIn === 'rows'}
                  onChange={() => onUpdate({ seriesIn: 'rows' })}
                />
                <span>行</span>
              </label>
            </div>
          </label>

          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={useFirstRowAsHeaders}
              onChange={(e) => onUpdate({ useFirstRowAsHeaders: e.target.checked })}
            />
            <span>1 行目を見出しとして使用</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={useFirstColumnAsLabels}
              onChange={(e) => onUpdate({ useFirstColumnAsLabels: e.target.checked })}
            />
            <span>1 列目をラベルとして使用</span>
          </label>
        </div>
      )}

      {tab === 'customize' && (
        <div className="space-y-3">
          <label className={labelClass}>
            <span>タイトル</span>
            <input
              type="text"
              value={chart.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span>X 軸タイトル</span>
            <input
              type="text"
              value={chart.xAxisTitle ?? ''}
              onChange={(e) => onUpdate({ xAxisTitle: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span>Y 軸タイトル</span>
            <input
              type="text"
              value={chart.yAxisTitle ?? ''}
              onChange={(e) => onUpdate({ yAxisTitle: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={showLegend}
              onChange={(e) => onUpdate({ showLegend: e.target.checked })}
            />
            <span>凡例を表示</span>
          </label>
          {showLegend && (
            <label className={labelClass}>
              <span>凡例の位置</span>
              <select
                value={legendPosition}
                onChange={(e) =>
                  onUpdate({ legendPosition: e.target.value as 'top' | 'bottom' | 'right' })
                }
                className={inputClass}
              >
                <option value="top">上</option>
                <option value="bottom">下</option>
                <option value="right">右</option>
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={showGridlines}
              onChange={(e) => onUpdate({ showGridlines: e.target.checked })}
            />
            <span>グリッド線を表示</span>
          </label>

          <div className="flex items-center justify-between text-xs text-text-primary">
            <span>背景色</span>
            <ColorPicker
              currentColor={chart.backgroundColor}
              onColorChange={(color) => onUpdate({ backgroundColor: color })}
              label="背景色"
              icon={<span className="text-[10px]">背景</span>}
            />
          </div>

          <div className="border-t border-grid-line pt-2 space-y-2">
            <span className="text-xs text-text-primary/60">系列の色</span>
            {model.series.map((s, i) => (
              <div
                key={`${s.name}-${i}`}
                className="flex items-center justify-between text-xs text-text-primary"
              >
                <span className="truncate">{s.name}</span>
                <ColorPicker
                  currentColor={chart.seriesColors?.[i] ?? s.color}
                  onColorChange={(color) => handleSeriesColorChange(i, color)}
                  label={s.name}
                  icon={<span className="text-[10px]">色</span>}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
