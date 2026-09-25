import { describe, it, expect } from 'vitest';
import { parse } from '../../../engine/parser';
import { buildVizTree, layoutTree, type PlacedNode } from './astLayout';

const tree = (formula: string) => buildVizTree(parse(formula), formula);

describe('buildVizTree', () => {
  it('labels nodes by kind, using the source text for references', () => {
    const root = tree('SUM($A$1:B2, "hi")*-2');
    expect(root.label).toBe('*');
    const [sum, neg] = root.children;
    expect(sum.label).toBe('SUM()');
    expect(sum.category).toBe('function');
    expect(sum.children.map((c) => c.label)).toEqual(['$A$1:B2', '"hi"']);
    expect(sum.children[0].ref).toEqual({ startCol: 0, startRow: 0, endCol: 1, endRow: 1 });
    expect(neg.label).toBe('-');
    expect(neg.children[0].label).toBe('2');
  });

  it('shows array literals as rows of elements and omitted arguments explicitly', () => {
    const arr = tree('{1,2;3,4}');
    expect(arr.label).toBe('{ 2×2 }');
    expect(arr.children.map((r) => r.children.map((c) => c.label))).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(tree('IF(A1,,1)').children[1].label).toBe('（省略）');
  });
});

describe('layoutTree', () => {
  const overlaps = (a: PlacedNode, b: PlacedNode) =>
    a.y === b.y && Math.abs(a.x - b.x) < (a.width + b.width) / 2;

  it('places levels top-down, parents over their children, and never overlaps nodes', () => {
    const layout = layoutTree(tree('IF(SUM(A1:A10)>100, VLOOKUP(B1, C1:D20, 2, FALSE), "小さい")'));
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const n of layout.nodes) {
      if (n.children.length > 0) {
        const kids = n.children.map((c) => byId.get(c.id)!);
        expect(kids.every((k) => k.y > n.y)).toBe(true);
        // Parent sits over its children (centered unless that would leave its subtree's band)
        expect(n.x).toBeGreaterThanOrEqual(Math.min(...kids.map((k) => k.x)) - 1);
        expect(n.x).toBeLessThanOrEqual(Math.max(...kids.map((k) => k.x)) + 1);
      }
    }
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false);
      }
    }
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    // A binary operator with balanced operands is exactly centered
    const bin = layoutTree(tree('A1+B1'));
    expect(bin.nodes[0].x).toBeCloseTo((bin.nodes[1].x + bin.nodes[2].x) / 2);
    expect(Math.max(...layout.nodes.map((n) => n.x + n.width / 2))).toBeLessThanOrEqual(
      layout.width,
    );
  });
});
