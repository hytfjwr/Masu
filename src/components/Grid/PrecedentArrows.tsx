import { memo, useMemo } from 'react';
import type { CursorRect } from './SelectionCursor';

interface Point {
  x: number;
  y: number;
}

export interface PrecedentSource {
  rect: CursorRect;
  color: string;
}

interface PrecedentArrowsProps {
  /** Referenced ranges (content-space rects), in formula order. */
  sources: PrecedentSource[];
  /** The formula cell (content-space rect). */
  target: CursorRect;
}

const PAD = 40;

const center = (r: CursorRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Where the ray from the rect's center toward `toward` leaves the rect. */
function edgePoint(r: CursorRect, toward: Point): Point {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const s = Math.min(
    dx === 0 ? Infinity : r.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : r.height / 2 / Math.abs(dy),
  );
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const contains = (r: CursorRect, p: Point) =>
  p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;

/**
 * "Trace precedents" overlay for the selected formula cell, drawn in the scrollable pane's content
 * space: each referenced range gets a tinted outline and a curved arrow that draws itself toward
 * the cell, then light pulses flow along it (index.css `.precedent-*`). Re-keyed per cell by Grid,
 * and its entrance is delayed so arrows only appear once the selection settles.
 */
export const PrecedentArrows = memo(function PrecedentArrows({
  sources,
  target,
}: PrecedentArrowsProps) {
  const geometry = useMemo(() => {
    const tc = center(target);
    const all = [target, ...sources.map((s) => s.rect)];
    const minX = Math.min(...all.map((r) => r.left));
    const minY = Math.min(...all.map((r) => r.top));
    const maxX = Math.max(...all.map((r) => r.left + r.width));
    const maxY = Math.max(...all.map((r) => r.top + r.height));
    const items = sources.map(({ rect, color }, i) => {
      // A range that contains the cell (or vice versa) gets its outline but no arrow
      const sc = center(rect);
      if (contains(rect, tc) || contains(target, sc)) return { rect, color, arrow: null };
      const start = edgePoint(rect, tc);
      const tip = edgePoint(target, sc);
      const dx = tip.x - start.x;
      const dy = tip.y - start.y;
      const dist = Math.hypot(dx, dy);
      // A range touching the cell (e.g. B2 → B3) leaves no room for an arrow: outline only
      if (dist < 8) return { rect, color, arrow: null };
      // Arc sideways (alternating per reference so parallel arrows fan out)
      const bend = Math.min(80, Math.max(18, dist * 0.22)) * (i % 2 === 0 ? 1 : -1);
      const ctrl = {
        x: (start.x + tip.x) / 2 - (dy / dist) * bend,
        y: (start.y + tip.y) / 2 + (dx / dist) * bend,
      };
      const angle = (Math.atan2(tip.y - ctrl.y, tip.x - ctrl.x) * 180) / Math.PI;
      return { rect, color, arrow: { start, tip, ctrl, angle } };
    });
    return {
      box: {
        left: minX - PAD,
        top: minY - PAD,
        width: maxX - minX + PAD * 2,
        height: maxY - minY + PAD * 2,
      },
      items,
    };
  }, [sources, target]);

  const { box, items } = geometry;
  // Local coordinates inside the SVG
  const lx = (x: number) => x - box.left;
  const ly = (y: number) => y - box.top;

  return (
    <svg
      aria-hidden
      className="precedent-arrows"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      viewBox={`0 0 ${box.width} ${box.height}`}
    >
      {items.map(({ rect, color, arrow }, i) => {
        const style = { ['--i' as string]: i } as React.CSSProperties;
        const d = arrow
          ? `M ${lx(arrow.start.x)} ${ly(arrow.start.y)} Q ${lx(arrow.ctrl.x)} ${ly(arrow.ctrl.y)} ${lx(arrow.tip.x)} ${ly(arrow.tip.y)}`
          : '';
        return (
          <g key={i} style={style}>
            <rect
              className="precedent-range"
              x={lx(rect.left) + 1}
              y={ly(rect.top) + 1}
              width={Math.max(0, rect.width - 2)}
              height={Math.max(0, rect.height - 2)}
              rx={3}
              stroke={color}
              fill={color}
            />
            {arrow && (
              <>
                <path className="precedent-path" d={d} pathLength={1} stroke={color} />
                <path className="precedent-flow" d={d} pathLength={1} />
                <circle
                  className="precedent-dot"
                  cx={lx(arrow.start.x)}
                  cy={ly(arrow.start.y)}
                  r={3.5}
                  fill={color}
                />
                <path
                  className="precedent-head"
                  d="M -9 -5 L 1 0 L -9 5 Z"
                  fill={color}
                  transform={`translate(${lx(arrow.tip.x)} ${ly(arrow.tip.y)}) rotate(${arrow.angle})`}
                />
              </>
            )}
          </g>
        );
      })}
      <rect
        className="precedent-target"
        x={lx(target.left)}
        y={ly(target.top)}
        width={target.width}
        height={target.height}
        rx={3}
      />
    </svg>
  );
});
