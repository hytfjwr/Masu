import { describe, it, expect } from 'vitest';
import { createEmptySheet } from '../../../utils/sheetUtils';
import { describeDiff, diffWorkbooks } from './historyDiff';

function sheet(id: string, name: string, cells: Record<string, string>) {
  const s = createEmptySheet(name);
  s.id = id;
  for (const [k, v] of Object.entries(cells)) s.cells.set(k, { rawValue: v, displayValue: v });
  return s;
}

describe('diffWorkbooks', () => {
  it('counts added, removed and changed cells (value or style) and lists a sample', () => {
    const before = [sheet('a', 'Sheet1', { A1: '1', B1: '2', C1: '3' })];
    const after = [sheet('a', 'Sheet1', { A1: '1', B1: '20', D1: '4' })];
    after[0].cells.set('A1', { rawValue: '1', displayValue: '1', style: { bold: true } });
    const diff = diffWorkbooks(before, after);
    expect(diff.changedCells).toBe(4); // A1 style, B1 value, C1 removed, D1 added
    expect(diff.sample).toHaveLength(4);
    expect(describeDiff(diffWorkbooks(before, before))).toBe('変更なし（シート設定などのみ）');
  });

  it('treats an empty style object like no style', () => {
    const before = [sheet('a', 'S', { A1: '1' })];
    const after = [sheet('a', 'S', { A1: '1' })];
    after[0].cells.set('A1', { rawValue: '1', displayValue: '1', style: {} });
    expect(diffWorkbooks(before, after).changedCells).toBe(0);
  });

  it('reports sheet additions and removals', () => {
    const diff = diffWorkbooks([sheet('a', 'A', {})], [sheet('b', 'B', {})]);
    expect(diff.sheetsAdded).toEqual(['B']);
    expect(diff.sheetsRemoved).toEqual(['A']);
    expect(describeDiff(diff)).toBe('シート追加: B / シート削除: A');
  });
});
