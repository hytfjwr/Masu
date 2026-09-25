import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  Cell as RechartsCell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartData } from '../../types/chart';
import type { CellData } from '../../types/grid';
import { buildChartModel, DEFAULT_PALETTE } from '../../utils/chartData';
import type { ChartCell } from '../../utils/chartData';

interface ChartPanelProps {
  chart: ChartData;
  getCellData: (col: number, row: number) => CellData | undefined;
  version: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

type LegendPosition = 'top' | 'bottom' | 'right';

function legendLayoutProps(position: LegendPosition) {
  if (position === 'right') {
    return { layout: 'vertical' as const, verticalAlign: 'middle' as const, align: 'right' as const, wrapperStyle: { fontSize: 10 } };
  }
  if (position === 'top') {
    return { verticalAlign: 'top' as const, wrapperStyle: { fontSize: 10 } };
  }
  return { verticalAlign: 'bottom' as const, wrapperStyle: { fontSize: 10 } };
}

/** null-or-number, since recharts treats null (not NaN) as a missing data point. */
function toChartValue(n: number): number | null {
  return Number.isNaN(n) ? null : n;
}

export const ChartPanel = memo(function ChartPanel({
  chart,
  getCellData,
  version,
  selected,
  onSelect,
  onMove,
  onResize,
  onDelete,
  onEdit,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeStartRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const showLegend = chart.showLegend ?? true;
  const legendPosition: LegendPosition = chart.legendPosition ?? 'bottom';
  const showGridlines = chart.showGridlines ?? true;

  // Rows shaped for recharts' category-based chart types (bar/line/area/pie/donut): one row per label.
  const rows = useMemo(() => {
    return model.labels.map((label, i) => {
      const row: Record<string, string | number | null> = { name: label };
      for (const s of model.series) {
        row[s.name] = toChartValue(s.values[i]);
      }
      return row;
    });
  }, [model]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      onSelect(chart.id);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: chart.x,
        origY: chart.y,
      };

      const handlePointerMove = (ev: PointerEvent) => {
        if (!dragStartRef.current) return;
        const dx = ev.clientX - dragStartRef.current.startX;
        const dy = ev.clientY - dragStartRef.current.startY;
        onMove(chart.id, dragStartRef.current.origX + dx, dragStartRef.current.origY + dy);
      };

      const handlePointerUp = () => {
        dragStartRef.current = null;
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [chart.id, chart.x, chart.y, onMove, onSelect],
  );

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: chart.width,
        origH: chart.height,
      };

      const handlePointerMove = (ev: PointerEvent) => {
        if (!resizeStartRef.current) return;
        const dx = ev.clientX - resizeStartRef.current.startX;
        const dy = ev.clientY - resizeStartRef.current.startY;
        const newW = Math.max(200, resizeStartRef.current.origW + dx);
        const newH = Math.max(150, resizeStartRef.current.origH + dy);
        onResize(chart.id, newW, newH);
      };

      const handlePointerUp = () => {
        resizeStartRef.current = null;
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [chart.id, chart.width, chart.height, onResize],
  );

  const handleDelete = useCallback(() => {
    onDelete(chart.id);
  }, [chart.id, onDelete]);

  const handleEdit = useCallback(() => {
    setMenuOpen(false);
    onEdit(chart.id);
  }, [chart.id, onEdit]);

  const handleContainerMouseDown = useCallback(() => {
    onSelect(chart.id);
    containerRef.current?.focus();
  }, [chart.id, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        onDelete(chart.id);
      }
    },
    [chart.id, selected, onDelete],
  );

  // useEffect required: global click-outside listener to close the "⋮" menu
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const xAxisLabel = chart.xAxisTitle
    ? { value: chart.xAxisTitle, position: 'insideBottom' as const, offset: -2, fontSize: 10 }
    : undefined;
  const yAxisLabel = chart.yAxisTitle
    ? { value: chart.yAxisTitle, angle: -90, position: 'insideLeft' as const, fontSize: 10 }
    : undefined;

  const renderChart = () => {
    switch (chart.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="name" tick={{ fontSize: 10 }} label={xAxisLabel} />
              <YAxis tick={{ fontSize: 10 }} label={yAxisLabel} />
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {model.series.map((s) => (
                <Bar key={s.name} dataKey={s.name} fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'horizontalBar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical">
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis type="number" tick={{ fontSize: 10 }} label={xAxisLabel} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} label={yAxisLabel} />
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {model.series.map((s) => (
                <Bar key={s.name} dataKey={s.name} fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'stackedBar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="name" tick={{ fontSize: 10 }} label={xAxisLabel} />
              <YAxis tick={{ fontSize: 10 }} label={yAxisLabel} />
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {model.series.map((s) => (
                <Bar key={s.name} dataKey={s.name} fill={s.color} stackId="stack" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="name" tick={{ fontSize: 10 }} label={xAxisLabel} />
              <YAxis tick={{ fontSize: 10 }} label={yAxisLabel} />
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {model.series.map((s) => (
                <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="name" tick={{ fontSize: 10 }} label={xAxisLabel} />
              <YAxis tick={{ fontSize: 10 }} label={yAxisLabel} />
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {model.series.map((s) => (
                <Area key={s.name} type="monotone" dataKey={s.name} stroke={s.color} fill={s.color} fillOpacity={0.4} connectNulls={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'pie':
      case 'donut': {
        const valueSeries = model.series[0];
        const pieData = model.labels.map((label, i) => ({
          name: label,
          value: valueSeries ? (Number.isNaN(valueSeries.values[i]) ? 0 : valueSeries.values[i]) : 0,
        }));
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="70%"
                innerRadius={chart.type === 'donut' ? '50%' : 0}
                label
              >
                {pieData.map((_, i) => (
                  <RechartsCell key={i} fill={chart.seriesColors?.[i] ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
            </PieChart>
          </ResponsiveContainer>
        );
      }

      case 'scatter': {
        const [xSeries, ...ySeries] = model.series;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              {showGridlines && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis type="number" dataKey="x" tick={{ fontSize: 10 }} name={xSeries?.name} label={xAxisLabel} />
              <YAxis type="number" dataKey="y" tick={{ fontSize: 10 }} label={yAxisLabel} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              {showLegend && <Legend {...legendLayoutProps(legendPosition)} />}
              {ySeries.map((s) => (
                <Scatter
                  key={s.name}
                  name={s.name}
                  data={(xSeries?.values ?? []).map((x, i) => ({ x, y: s.values[i] })).filter((p) => !Number.isNaN(p.x) && !Number.isNaN(p.y))}
                  fill={s.color}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );
      }
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-chart-panel
      className={`bg-grid-bg border rounded-lg shadow-xl overflow-hidden outline-none ${
        selected ? 'border-2 border-accent-selection' : 'border-grid-line'
      }`}
      style={{
        position: 'absolute',
        left: chart.x,
        top: chart.y,
        width: chart.width,
        height: chart.height,
        backgroundColor: chart.backgroundColor,
      }}
      onMouseDown={handleContainerMouseDown}
      onKeyDown={handleKeyDown}
    >
      {/* Title bar / drag handle */}
      <div
        className="flex items-center justify-between px-2 h-6 bg-ui-bg border-b border-grid-line cursor-move select-none"
        onPointerDown={handleDragStart}
        onDoubleClick={handleEdit}
      >
        <span className="text-xs text-text-primary truncate">{chart.title}</span>
        <div className="relative flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="text-xs text-text-primary/50 hover:text-text-primary leading-none px-1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="グラフのメニュー"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 z-10 glass-surface rounded-xl py-1 min-w-[120px]">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleEdit}
              >
                グラフを編集
              </button>
            </div>
          )}
          <button
            type="button"
            className="text-xs text-text-primary/50 hover:text-text-primary leading-none"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            aria-label="グラフを削除"
          >
            ×
          </button>
        </div>
      </div>

      {/* Chart body */}
      <div style={{ width: '100%', height: `calc(100% - 24px)` }} className="p-1">
        {renderChart()}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
        onPointerDown={handleResizeStart}
        style={{
          background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%)',
        }}
      />
    </div>
  );
});
