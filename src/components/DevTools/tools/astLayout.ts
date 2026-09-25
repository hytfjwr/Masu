import { getNodeSpan } from '../../../engine/parser';
import type { TokenSpan } from '../../../engine/tokenizer';
import type { ASTNode } from '../../../engine/types';
import { t } from '../../../i18n';
import { parseCellKey } from '../../../utils/coordinates';

export type VizCategory =
  | 'function'
  | 'operator'
  | 'reference'
  | 'literal'
  | 'error'
  | 'array'
  | 'empty'
  | 'named';

/** A display node: one AST node (or an array-literal row) with its label and source range. */
export interface VizNode {
  id: string;
  label: string;
  /** Node kind shown under the label (the AST `kind`, or "Row" for array rows). */
  kind: string;
  category: VizCategory;
  depth: number;
  span?: TokenSpan;
  /** Same-sheet cell/range a click can select. */
  ref?: { startCol: number; startRow: number; endCol: number; endRow: number };
  children: VizNode[];
}

export interface PlacedNode extends VizNode {
  /** Center x / top y in tree coordinates. */
  x: number;
  y: number;
  width: number;
  parentId?: string;
}

export interface TreeLayout {
  nodes: PlacedNode[];
  edges: Array<{ from: PlacedNode; to: PlacedNode }>;
  width: number;
  height: number;
}

export const NODE_HEIGHT = 36;
const LEVEL_GAP = 34;
const SIBLING_GAP = 14;
const PADDING = 24;

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Rough rendered width of a label (monospace 12px; CJK characters count double). */
function textWidth(text: string, charWidth: number): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? charWidth * 1.7 : charWidth;
  return w;
}

export function nodeWidth(node: Pick<VizNode, 'label' | 'kind'>): number {
  return Math.max(
    40,
    Math.ceil(Math.max(textWidth(node.label, 7.3), textWidth(node.kind, 5.6)) + 24),
  );
}

function rangeOf(start: string, end: string): VizNode['ref'] {
  const a = parseCellKey(start);
  const b = parseCellKey(end);
  return {
    startCol: Math.min(a.col, b.col),
    startRow: Math.min(a.row, b.row),
    endCol: Math.max(a.col, b.col),
    endRow: Math.max(a.row, b.row),
  };
}

/** Build the display tree for an AST. `source` is the formula text the AST was parsed from (no '='). */
export function buildVizTree(ast: ASTNode, source: string): VizNode {
  let nextId = 0;
  const sliceOf = (node: ASTNode, fallback: string) => {
    const span = getNodeSpan(node);
    return span && span.end > span.start ? source.slice(span.start, span.end) : fallback;
  };

  const visit = (node: ASTNode, depth: number): VizNode => {
    const base = { id: `n${nextId++}`, kind: node.kind, depth, span: getNodeSpan(node) };
    switch (node.kind) {
      case 'NumberLiteral':
        return { ...base, label: String(node.value), category: 'literal', children: [] };
      case 'StringLiteral':
        return {
          ...base,
          label: `"${truncate(node.value, 18)}"`,
          category: 'literal',
          children: [],
        };
      case 'BooleanLiteral':
        return { ...base, label: node.value ? 'TRUE' : 'FALSE', category: 'literal', children: [] };
      case 'ErrorLiteral':
        return { ...base, label: node.code, category: 'error', children: [] };
      case 'EmptyArg':
        return { ...base, label: t('devtools.astTool.emptyArg'), category: 'empty', children: [] };
      case 'NamedRef':
        return { ...base, label: node.name, category: 'named', children: [] };
      case 'CellRef':
        return {
          ...base,
          label: sliceOf(node, node.key),
          category: 'reference',
          ref: rangeOf(node.key, node.key),
          children: [],
        };
      case 'RangeRef':
        return {
          ...base,
          label: sliceOf(node, `${node.start}:${node.end}`),
          category: 'reference',
          ref: rangeOf(node.start, node.end),
          children: [],
        };
      case 'SheetCellRef':
        return {
          ...base,
          label: sliceOf(node, `${node.sheetName}!${node.key}`),
          category: 'reference',
          children: [],
        };
      case 'SheetRangeRef':
        return {
          ...base,
          label: sliceOf(node, `${node.sheetName}!${node.start}:${node.end}`),
          category: 'reference',
          children: [],
        };
      case 'OpenRange':
        return { ...base, label: sliceOf(node, 'range'), category: 'reference', children: [] };
      case 'BinaryOp':
        return {
          ...base,
          label: node.op,
          category: 'operator',
          children: [visit(node.left, depth + 1), visit(node.right, depth + 1)],
        };
      case 'UnaryOp':
        return {
          ...base,
          label: node.op,
          category: 'operator',
          children: [visit(node.operand, depth + 1)],
        };
      case 'FunctionCall':
        return {
          ...base,
          label: `${node.name}()`,
          category: 'function',
          children: node.args.map((a) => visit(a, depth + 1)),
        };
      case 'ArrayLiteral': {
        const cols = node.rows[0]?.length ?? 0;
        return {
          ...base,
          label: `{ ${node.rows.length}×${cols} }`,
          category: 'array',
          children: node.rows.map((row, r) => ({
            id: `n${nextId++}`,
            label: t('devtools.astTool.arrayRow', { row: r + 1 }),
            kind: 'Row',
            category: 'array' as const,
            depth: depth + 1,
            children: row.map((el) => visit(el, depth + 2)),
          })),
        };
      }
    }
  };
  return visit(ast, 0);
}

/**
 * Tidy top-down layout: every subtree gets the width of max(own node, children side by side), and a
 * parent is centered over its children. Leaves never overlap; siblings keep SIBLING_GAP apart.
 */
export function layoutTree(root: VizNode): TreeLayout {
  const subtreeWidth = new Map<string, number>();
  const measure = (node: VizNode): number => {
    const own = nodeWidth(node);
    const kids =
      node.children.reduce((sum, c) => sum + measure(c), 0) +
      SIBLING_GAP * Math.max(0, node.children.length - 1);
    const w = Math.max(own, kids);
    subtreeWidth.set(node.id, w);
    return w;
  };
  const total = measure(root);

  const nodes: PlacedNode[] = [];
  const edges: TreeLayout['edges'] = [];
  let maxDepth = 0;
  const place = (node: VizNode, left: number, parent?: PlacedNode): PlacedNode => {
    const w = subtreeWidth.get(node.id)!;
    const placed: PlacedNode = {
      ...node,
      x: left + w / 2,
      y: PADDING + node.depth * (NODE_HEIGHT + LEVEL_GAP),
      width: nodeWidth(node),
      parentId: parent?.id,
    };
    nodes.push(placed);
    if (parent) edges.push({ from: parent, to: placed });
    maxDepth = Math.max(maxDepth, node.depth);
    const kidsWidth =
      node.children.reduce((sum, c) => sum + subtreeWidth.get(c.id)!, 0) +
      SIBLING_GAP * Math.max(0, node.children.length - 1);
    let cursor = left + (w - kidsWidth) / 2;
    const kids: PlacedNode[] = [];
    for (const child of node.children) {
      kids.push(place(child, cursor, placed));
      cursor += subtreeWidth.get(child.id)! + SIBLING_GAP;
    }
    if (kids.length > 0) {
      // Center over the first/last child, but stay inside this subtree's band so neighbours never overlap
      const mid = (kids[0].x + kids[kids.length - 1].x) / 2;
      placed.x = Math.min(Math.max(mid, left + placed.width / 2), left + w - placed.width / 2);
    }
    return placed;
  };
  place(root, PADDING);

  return {
    nodes,
    edges,
    width: total + PADDING * 2,
    height: PADDING * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * LEVEL_GAP,
  };
}
