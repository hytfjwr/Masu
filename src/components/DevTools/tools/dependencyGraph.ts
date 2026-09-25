import type { GlobalRangeDep } from '../../../engine/dependency';
import { t } from '../../../i18n';
import { cellKey, parseCellKey } from '../../../utils/coordinates';
import type { DevToolsHost } from '../types';

/** Nodes shown per level before collapsing the rest into a "+N" node. */
const MAX_PER_LEVEL = 10;

export interface DepNode {
  id: string;
  /** −2, −1 = precedents (what the cell reads), 0 = the cell, +1, +2 = dependents (what reads it). */
  level: number;
  kind: 'center' | 'cell' | 'range' | 'more';
  label: string;
  /** Short preview of the cell's value / formula. */
  detail?: string;
  error?: boolean;
  sheetId?: string;
  col?: number;
  row?: number;
}

export interface DepEdge {
  /** Data flows from → to (a precedent into the cell that reads it). */
  from: string;
  to: string;
}

export interface DepGraph {
  nodes: DepNode[];
  edges: DepEdge[];
}

type GraphHost = Pick<DevToolsHost, 'getCell' | 'getDependencyInfo' | 'sheets'>;

/** Split a global key `sheetId:A1`. */
export function splitGlobalKey(g: string): { sheetId: string; key: string } | null {
  const m = /^(.*):([A-Z]+\d+)$/.exec(g);
  return m ? { sheetId: m[1], key: m[2] } : null;
}

function rangeLabel(r: GlobalRangeDep): string {
  const start = cellKey(r.startCol, r.startRow);
  if (r.endCol === null && r.endRow === null) return `${start}:…`;
  if (r.endRow === null) return `${start}:${cellKey(r.endCol!, 0).replace(/\d+$/, '')}`;
  if (r.endCol === null) return `${start}:${r.endRow + 1}`;
  return `${start}:${cellKey(r.endCol, r.endRow)}`;
}

/**
 * Two levels of precedents and dependents around one cell, from the engine's dependency graph.
 * Range precedents are shown as single (unexpanded) nodes, as the engine stores them.
 */
export function buildDependencyGraph(host: GraphHost, sheetId: string, key: string): DepGraph {
  const sheetName = (id: string) => host.sheets.find((s) => s.id === id)?.name ?? id;
  const nodes = new Map<string, DepNode>();
  const edges: DepEdge[] = [];
  const edgeSet = new Set<string>();
  const perLevel = new Map<number, number>();
  const overflow = new Map<number, number>();

  const addEdge = (from: string, to: string) => {
    const k = `${from}>${to}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    edges.push({ from, to });
  };

  /** Add a cell node (once, at its first level); false when the level is full. */
  const addCell = (g: string, level: number): boolean => {
    if (nodes.has(g)) return true;
    const count = perLevel.get(level) ?? 0;
    if (count >= MAX_PER_LEVEL) {
      overflow.set(level, (overflow.get(level) ?? 0) + 1);
      return false;
    }
    const parts = splitGlobalKey(g);
    if (!parts) return false;
    const cell = host.getCell(parts.sheetId, parts.key);
    const { col, row } = parseCellKey(parts.key);
    nodes.set(g, {
      id: g,
      level,
      kind: level === 0 ? 'center' : 'cell',
      label: parts.sheetId === sheetId ? parts.key : `${sheetName(parts.sheetId)}!${parts.key}`,
      detail:
        cell?.formula !== undefined
          ? `=${cell.formula}`
          : cell?.displayValue || t('devtools.dependencyTool.detailEmpty'),
      error: cell?.error !== undefined,
      sheetId: parts.sheetId,
      col,
      row,
    });
    perLevel.set(level, count + 1);
    return true;
  };

  const center = `${sheetId}:${key}`;
  addCell(center, 0);

  // Precedents: walk "depends on" leftwards
  let frontier = [center];
  for (let level = -1; level >= -2; level--) {
    const next: string[] = [];
    for (const g of frontier) {
      const parts = splitGlobalKey(g);
      if (!parts) continue;
      const info = host.getDependencyInfo(parts.sheetId, parts.key);
      for (const p of info.precedents) {
        if (addCell(p, level)) {
          addEdge(p, g);
          next.push(p);
        }
      }
      for (const r of info.rangePrecedents) {
        const id = `${r.sheetId}:${rangeLabel(r)}`;
        if (!nodes.has(id)) {
          const count = perLevel.get(level) ?? 0;
          if (count >= MAX_PER_LEVEL) {
            overflow.set(level, (overflow.get(level) ?? 0) + 1);
            continue;
          }
          nodes.set(id, {
            id,
            level,
            kind: 'range',
            label:
              r.sheetId === sheetId ? rangeLabel(r) : `${sheetName(r.sheetId)}!${rangeLabel(r)}`,
            detail: t('devtools.dependencyTool.detailRange'),
            sheetId: r.sheetId,
            col: r.startCol,
            row: r.startRow,
          });
          perLevel.set(level, count + 1);
        }
        addEdge(id, g);
      }
    }
    frontier = next;
  }

  // Dependents: walk rightwards
  frontier = [center];
  for (let level = 1; level <= 2; level++) {
    const next: string[] = [];
    for (const g of frontier) {
      const parts = splitGlobalKey(g);
      if (!parts) continue;
      for (const d of host.getDependencyInfo(parts.sheetId, parts.key).dependents) {
        if (addCell(d, level)) {
          addEdge(g, d);
          next.push(d);
        }
      }
    }
    frontier = next;
  }

  for (const [level, n] of overflow) {
    nodes.set(`more:${level}`, { id: `more:${level}`, level, kind: 'more', label: `+${n}` });
  }
  return { nodes: Array.from(nodes.values()), edges };
}
