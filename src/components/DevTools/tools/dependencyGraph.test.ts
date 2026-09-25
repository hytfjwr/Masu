import { describe, it, expect } from 'vitest';
import type { CellData } from '../../../types/grid';
import { buildDependencyGraph, splitGlobalKey } from './dependencyGraph';

/** Fake host over a tiny dependency map: key → cells it reads. */
function host(reads: Record<string, string[]>, formulas: Record<string, string> = {}) {
  const dependents = (g: string) => Object.keys(reads).filter((k) => reads[k].includes(g));
  return {
    sheets: [{ id: 's', name: 'Sheet1' }, { id: 't', name: 'Other' }] as never,
    getCell: (sheetId: string, key: string): CellData | undefined => {
      const f = formulas[`${sheetId}:${key}`];
      return f ? { rawValue: `=${f}`, displayValue: '1', formula: f } : { rawValue: '1', displayValue: '1' };
    },
    getDependencyInfo: (sheetId: string, key: string) => ({
      precedents: reads[`${sheetId}:${key}`] ?? [],
      rangePrecedents: sheetId === 's' && key === 'C1' ? [{ sheetId: 's', startCol: 0, startRow: 4, endCol: 0, endRow: 9 }] : [],
      dependents: dependents(`${sheetId}:${key}`),
    }),
  };
}

describe('buildDependencyGraph', () => {
  it('lays out two levels of precedents and dependents with data-flow edges', () => {
    // A1 → B1 → C1 → D1 → E1, and C1 also reads Other!A1 and the range A5:A10
    const h = host(
      { 's:B1': ['s:A1'], 's:C1': ['s:B1', 't:A1'], 's:D1': ['s:C1'], 's:E1': ['s:D1'] },
      { 's:C1': 'B1+Other!A1+SUM(A5:A10)' },
    );
    const g = buildDependencyGraph(h, 's', 'C1');
    const level = (label: string) => g.nodes.find((n) => n.label === label)?.level;
    expect(level('C1')).toBe(0);
    expect(level('B1')).toBe(-1);
    expect(level('Other!A1')).toBe(-1);
    expect(level('A5:A10')).toBe(-1);
    expect(level('A1')).toBe(-2);
    expect(level('D1')).toBe(1);
    expect(level('E1')).toBe(2);
    expect(g.edges).toContainEqual({ from: 's:B1', to: 's:C1' });
    expect(g.edges).toContainEqual({ from: 's:C1', to: 's:D1' });
    expect(g.nodes.find((n) => n.level === 0)?.detail).toBe('=B1+Other!A1+SUM(A5:A10)');
  });

  it('collapses crowded levels into a "+N" node', () => {
    const readers: Record<string, string[]> = {};
    for (let r = 2; r <= 15; r++) readers[`s:B${r}`] = ['s:A1'];
    const g = buildDependencyGraph(host(readers), 's', 'A1');
    expect(g.nodes.filter((n) => n.level === 1 && n.kind === 'cell')).toHaveLength(10);
    expect(g.nodes.find((n) => n.kind === 'more')?.label).toBe('+4');
  });

  it('splits global keys', () => {
    expect(splitGlobalKey('sheet-1:AB12')).toEqual({ sheetId: 'sheet-1', key: 'AB12' });
    expect(splitGlobalKey('nope')).toBeNull();
  });
});
