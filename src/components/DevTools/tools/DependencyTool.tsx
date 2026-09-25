import { memo, useMemo, useState } from 'react';
import { cellKey } from '../../../utils/coordinates';
import type { DevToolsHost } from '../types';
import { buildDependencyGraph, type DepNode } from './dependencyGraph';

const COL_W = 168;
const NODE_W = 138;
const NODE_H = 42;
const ROW_GAP = 12;
const PAD = 28;
const HEADER = 26;

const LEVEL_TITLES: Record<number, string> = {
  [-2]: '参照元 2',
  [-1]: '参照元',
  0: '選択中',
  1: '参照先',
  2: '参照先 2',
};

/**
 * Developer tools "依存グラフ" tab: what the selected cell reads (left) and what reads it (right),
 * two levels each, from the engine's dependency graph. Click a node to jump to that cell.
 */
export const DependencyTool = memo(function DependencyTool({ host }: { host: DevToolsHost }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const key = cellKey(host.activeCell.col, host.activeCell.row);
  const graph = useMemo(
    () => buildDependencyGraph(host, host.activeSheetId, key),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [host.activeSheetId, key, host.version],
  );

  const layout = useMemo(() => {
    const levels = [-2, -1, 0, 1, 2].filter((l) => graph.nodes.some((n) => n.level === l));
    const tallest = Math.max(...levels.map((l) => graph.nodes.filter((n) => n.level === l).length));
    const height = PAD * 2 + HEADER + tallest * NODE_H + (tallest - 1) * ROW_GAP;
    const pos = new Map<string, { x: number; y: number; node: DepNode }>();
    levels.forEach((level, li) => {
      const column = graph.nodes.filter((n) => n.level === level);
      const colHeight = column.length * NODE_H + (column.length - 1) * ROW_GAP;
      const top = PAD + HEADER + (height - PAD * 2 - HEADER - colHeight) / 2;
      column.forEach((node, i) =>
        pos.set(node.id, { x: PAD + li * COL_W, y: top + i * (NODE_H + ROW_GAP), node }),
      );
    });
    return { levels, pos, width: PAD * 2 + (levels.length - 1) * COL_W + NODE_W, height };
  }, [graph]);

  const connected = useMemo(() => {
    const set = new Set<string>();
    if (!hoverId) return set;
    set.add(hoverId);
    for (const e of graph.edges) {
      if (e.from === hoverId) set.add(e.to);
      if (e.to === hoverId) set.add(e.from);
    }
    return set;
  }, [graph, hoverId]);

  const isolated = graph.nodes.length === 1;

  return (
    <div className="devtools-tool dep-tool">
      <div className="devtools-toolbar">
        <span className="ast-viz-origin">{key}</span>
        <span className="devtools-muted">
          参照元 {graph.nodes.filter((n) => n.level < 0).length} ・ 参照先{' '}
          {graph.nodes.filter((n) => n.level > 0).length}・ ノードをクリックでそのセルへ移動
        </span>
      </div>
      {isolated ? (
        <div className="ast-viz-empty">このセルはほかのセルとつながっていません</div>
      ) : (
        <div className="devtools-canvas" onMouseLeave={() => setHoverId(null)}>
          <svg
            key={`${host.activeSheetId}:${key}`}
            className="dep-graph"
            width={layout.width}
            height={layout.height}
          >
            {layout.levels.map((level, li) => (
              <text
                key={level}
                className="dep-level-title"
                x={PAD + li * COL_W + NODE_W / 2}
                y={PAD + 8}
              >
                {LEVEL_TITLES[level]}
              </text>
            ))}
            {graph.edges.map((e) => {
              const a = layout.pos.get(e.from);
              const b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const active = hoverId !== null && connected.has(e.from) && connected.has(e.to);
              return (
                <path
                  key={`${e.from}>${e.to}`}
                  className="dep-edge"
                  data-active={active || undefined}
                  data-dim={(hoverId !== null && !active) || undefined}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 6} ${y2}`}
                  pathLength={1}
                  markerEnd="url(#dep-arrow)"
                  style={{ ['--d' as string]: Math.abs(b.node.level) }}
                />
              );
            })}
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="dep-arrowhead" />
              </marker>
            </defs>
            {Array.from(layout.pos.values()).map(({ x, y, node }) => (
              <g
                key={node.id}
                transform={`translate(${x} ${y})`}
                className={`dep-node dep-node-${node.kind}`}
                data-error={node.error || undefined}
                data-dim={(hoverId !== null && !connected.has(node.id)) || undefined}
                onMouseEnter={() => setHoverId(node.id)}
                onClick={() => {
                  if (
                    node.sheetId !== undefined &&
                    node.col !== undefined &&
                    node.row !== undefined
                  ) {
                    host.goToCell(node.sheetId, node.col, node.row);
                  }
                }}
              >
                <g className="dep-node-pop" style={{ ['--d' as string]: Math.abs(node.level) }}>
                  <rect width={NODE_W} height={NODE_H} rx={10} />
                  <text x={10} y={17} className="dep-node-label">
                    {node.label}
                  </text>
                  {node.detail && (
                    <text x={10} y={32} className="dep-node-detail">
                      {node.detail.length > 22 ? `${node.detail.slice(0, 21)}…` : node.detail}
                    </text>
                  )}
                </g>
                {node.detail && <title>{node.detail}</title>}
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
});
