import { describe, it, expect } from 'vite-plus/test';
import { DependencyGraph } from './dependency';
import type { GlobalRangeDep } from './dependency';

describe('DependencyGraph range dependencies', () => {
  it('a cell inside a fixed range is found via getDependents', () => {
    const graph = new DependencyGraph();
    // s1:B1's formula depends on the range s1!A1:A10
    const range: GlobalRangeDep = { sheetId: 's1', startCol: 0, startRow: 0, endCol: 0, endRow: 9 };
    graph.setDependencies('s1:B1', [], [range]);

    expect(graph.getDependents('s1:A5').has('s1:B1')).toBe(true);
    expect(graph.getDependents('s1:A11').has('s1:B1')).toBe(false);
  });

  it('an open-ended range (endRow null) matches cells beyond any fixed bound', () => {
    const graph = new DependencyGraph();
    const range: GlobalRangeDep = {
      sheetId: 's1',
      startCol: 0,
      startRow: 0,
      endCol: 0,
      endRow: null,
    };
    graph.setDependencies('s1:B1', [], [range]);

    expect(graph.getDependents('s1:A99999').has('s1:B1')).toBe(true);
  });

  it('wouldCreateCycle detects a formula that depends on a range containing itself', () => {
    const graph = new DependencyGraph();
    // A1's formula would depend on the range A1:A3, which contains A1 itself
    const range: GlobalRangeDep = { sheetId: 's1', startCol: 0, startRow: 0, endCol: 0, endRow: 2 };
    expect(graph.wouldCreateCycle('s1:A1', [], [range])).toBe(true);
  });

  it('removeDependencies clears range dependencies too', () => {
    const graph = new DependencyGraph();
    const range: GlobalRangeDep = { sheetId: 's1', startCol: 0, startRow: 0, endCol: 0, endRow: 9 };
    graph.setDependencies('s1:B1', [], [range]);
    graph.removeDependencies('s1:B1');

    expect(graph.getDependents('s1:A5').has('s1:B1')).toBe(false);
  });
});
