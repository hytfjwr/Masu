import { describe, it, expect } from 'vitest';
import {
  addGroup,
  removeGroup,
  toggleGroupCollapse,
  setExpandLevel,
  computeCollapsedIndices,
  getMaxGroupLevel,
  computeGroupLevel,
  shiftGroupRanges,
} from './groupManager';
import type { GroupRange } from '../types/grid';

function makeGroup(
  start: number,
  end: number,
  level: number = 1,
  collapsed: boolean = false,
): GroupRange {
  return {
    id: `g_${start}_${end}_${level}`,
    start,
    end,
    level,
    collapsed,
  };
}

describe('addGroup', () => {
  it('adds a single group with level 1', () => {
    const result = addGroup([], 2, 5);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.newGroup.start).toBe(2);
      expect(result.newGroup.end).toBe(5);
      expect(result.newGroup.level).toBe(1);
    }
  });

  it('adds nested group with correct level', () => {
    const groups = [makeGroup(2, 8, 1)];
    const result = addGroup(groups, 3, 5);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.newGroup.level).toBe(2);
    }
  });

  it('supports 3-level nesting', () => {
    const groups = [makeGroup(2, 8, 1), makeGroup(3, 7, 2)];
    const result = addGroup(groups, 4, 6);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.newGroup.level).toBe(3);
    }
  });

  it('rejects 4th level nesting', () => {
    const groups = [makeGroup(2, 10, 1), makeGroup(3, 9, 2), makeGroup(4, 8, 3)];
    const result = addGroup(groups, 5, 7);
    expect('error' in result).toBe(true);
  });

  it('adds non-overlapping group at same level', () => {
    const groups = [makeGroup(2, 5, 1)];
    const result = addGroup(groups, 7, 10);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.newGroup.level).toBe(1);
    }
  });

  it('adds partially overlapping group at higher level', () => {
    const groups = [makeGroup(2, 5, 1)];
    const result = addGroup(groups, 4, 8);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.newGroup.level).toBe(2);
    }
  });
});

describe('removeGroup', () => {
  it('removes specified group', () => {
    const groups = [makeGroup(2, 5, 1), makeGroup(7, 10, 1)];
    const result = removeGroup(groups, groups[0].id);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(groups[1].id);
  });

  it('returns unchanged array for non-existent id', () => {
    const groups = [makeGroup(2, 5, 1)];
    const result = removeGroup(groups, 'nonexistent');
    expect(result).toHaveLength(1);
  });
});

describe('toggleGroupCollapse', () => {
  it('toggles from false to true', () => {
    const groups = [makeGroup(2, 5, 1, false)];
    const result = toggleGroupCollapse(groups, groups[0].id);
    expect(result[0].collapsed).toBe(true);
  });

  it('toggles from true to false', () => {
    const groups = [makeGroup(2, 5, 1, true)];
    const result = toggleGroupCollapse(groups, groups[0].id);
    expect(result[0].collapsed).toBe(false);
  });
});

describe('setExpandLevel', () => {
  it('level 1: collapses level 1 and above', () => {
    const groups = [makeGroup(2, 5, 1, false), makeGroup(3, 4, 2, false)];
    const result = setExpandLevel(groups, 1);
    expect(result[0].collapsed).toBe(true); // level 1 >= 1
    expect(result[1].collapsed).toBe(true); // level 2 >= 1
  });

  it('level 2: collapses level 2+, expands level 1', () => {
    const groups = [makeGroup(2, 8, 1, true), makeGroup(3, 5, 2, false)];
    const result = setExpandLevel(groups, 2);
    expect(result[0].collapsed).toBe(false); // level 1 < 2
    expect(result[1].collapsed).toBe(true); // level 2 >= 2
  });

  it('level 3: expands all groups (level 3 collapses level 3+)', () => {
    const groups = [makeGroup(2, 8, 1, true), makeGroup(3, 5, 2, true), makeGroup(4, 4, 3, true)];
    const result = setExpandLevel(groups, 4);
    expect(result.every((g) => !g.collapsed)).toBe(true);
  });
});

describe('computeCollapsedIndices', () => {
  it('returns collapsed group indices', () => {
    const groups = [makeGroup(2, 5, 1, true)];
    const hidden = computeCollapsedIndices(groups);
    expect(hidden).toEqual(new Set([2, 3, 4, 5]));
  });

  it('returns empty set for expanded groups', () => {
    const groups = [makeGroup(2, 5, 1, false)];
    const hidden = computeCollapsedIndices(groups);
    expect(hidden.size).toBe(0);
  });

  it('includes nested group indices when parent is collapsed', () => {
    const groups = [makeGroup(2, 8, 1, true), makeGroup(3, 5, 2, false)];
    const hidden = computeCollapsedIndices(groups);
    expect(hidden).toEqual(new Set([2, 3, 4, 5, 6, 7, 8]));
  });

  it('handles nested group collapsed inside expanded parent', () => {
    const groups = [makeGroup(2, 8, 1, false), makeGroup(3, 5, 2, true)];
    const hidden = computeCollapsedIndices(groups);
    expect(hidden).toEqual(new Set([3, 4, 5]));
  });

  it('skips frozen rows', () => {
    const groups = [makeGroup(0, 3, 1, true)];
    const hidden = computeCollapsedIndices(groups, 2);
    expect(hidden).toEqual(new Set([2, 3]));
  });
});

describe('getMaxGroupLevel', () => {
  it('returns 0 for empty groups', () => {
    expect(getMaxGroupLevel([])).toBe(0);
  });

  it('returns 1 for single-level groups', () => {
    expect(getMaxGroupLevel([makeGroup(2, 5, 1)])).toBe(1);
  });

  it('returns 3 for mixed levels', () => {
    const groups = [makeGroup(2, 8, 1), makeGroup(3, 5, 2), makeGroup(4, 4, 3)];
    expect(getMaxGroupLevel(groups)).toBe(3);
  });
});

describe('computeGroupLevel', () => {
  it('returns 1 for no existing groups', () => {
    expect(computeGroupLevel([], 2, 5)).toBe(1);
  });

  it('returns 2 for overlapping with level 1 group', () => {
    const groups = [makeGroup(2, 8, 1)];
    expect(computeGroupLevel(groups, 3, 5)).toBe(2);
  });

  it('returns 1 for non-overlapping groups', () => {
    const groups = [makeGroup(2, 5, 1)];
    expect(computeGroupLevel(groups, 7, 10)).toBe(1);
  });
});

describe('shiftGroupRanges', () => {
  it('insert shifts groups after index forward', () => {
    const groups = [makeGroup(5, 8, 1)];
    const result = shiftGroupRanges(groups, 3, 'insert');
    expect(result[0].start).toBe(6);
    expect(result[0].end).toBe(9);
  });

  it('insert within group expands end only', () => {
    const groups = [makeGroup(2, 8, 1)];
    const result = shiftGroupRanges(groups, 5, 'insert');
    expect(result[0].start).toBe(2);
    expect(result[0].end).toBe(9);
  });

  it('delete shifts groups after index backward', () => {
    const groups = [makeGroup(5, 8, 1)];
    const result = shiftGroupRanges(groups, 3, 'delete');
    expect(result[0].start).toBe(4);
    expect(result[0].end).toBe(7);
  });

  it('delete within group shrinks end only', () => {
    const groups = [makeGroup(2, 8, 1)];
    const result = shiftGroupRanges(groups, 5, 'delete');
    expect(result[0].start).toBe(2);
    expect(result[0].end).toBe(7);
  });

  it('delete removes single-element group at deleted index', () => {
    const groups = [makeGroup(5, 5, 1)];
    const result = shiftGroupRanges(groups, 5, 'delete');
    expect(result).toHaveLength(0);
  });
});
