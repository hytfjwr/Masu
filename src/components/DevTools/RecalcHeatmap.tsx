import { memo, useMemo, useSyncExternalStore } from 'react';
import { recalcProfiler } from '../../engine/recalcProfiler';
import { parseCellKey } from '../../utils/coordinates';

const MAX_CELLS = 1500;

interface RecalcHeatmapProps {
  sheetId: string;
  /** Content-space rect of a cell (same coordinates as the grid's cells). */
  rectFor: (
    col: number,
    row: number,
  ) => { left: number; top: number; width: number; height: number };
}

/**
 * Developer tools overlay: tints each formula cell of the active sheet by how long its latest
 * recorded evaluation took (green → amber → red, relative to the slowest cell), in the grid's
 * content space so it scrolls with the cells.
 */
export const RecalcHeatmap = memo(function RecalcHeatmap({ sheetId, rectFor }: RecalcHeatmapProps) {
  const version = useSyncExternalStore(recalcProfiler.subscribe, recalcProfiler.getVersion);
  const cells = useMemo(() => {
    const prefix = `${sheetId}:`;
    const entries: Array<{ key: string; ms: number }> = [];
    for (const [g, ms] of recalcProfiler.getCellTimes()) {
      if (g.startsWith(prefix)) entries.push({ key: g.slice(prefix.length), ms });
    }
    entries.sort((a, b) => b.ms - a.ms);
    const top = entries.slice(0, MAX_CELLS);
    const max = Math.max(0.001, top[0]?.ms ?? 0);
    return top.map(({ key, ms }) => {
      const { col, row } = parseCellKey(key);
      return { key, ms, t: Math.sqrt(ms / max), rect: rectFor(col, row) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, rectFor, version]);

  return (
    <div className="recalc-heatmap" aria-hidden>
      {cells.map(({ key, ms, t, rect }, i) => (
        <div
          key={key}
          className="recalc-heatmap-cell"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            // hue 140 (green) → 0 (red) with the relative cost
            background: `hsl(${140 - 140 * t} 85% 50% / ${0.18 + 0.42 * t})`,
          }}
        >
          {i < 30 && <span>{ms >= 1 ? ms.toFixed(1) : ms.toFixed(2)}ms</span>}
        </div>
      ))}
    </div>
  );
});
