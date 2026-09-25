import type { GroupRange } from '../types/grid';

/**
 * ネストレベルの自動計算。
 * 既存グループとの重なりに基づいてレベルを決定する。
 */
export function computeGroupLevel(
  groups: GroupRange[],
  start: number,
  end: number,
): number {
  let maxOverlappingLevel = 0;
  for (const g of groups) {
    // Check if ranges overlap
    if (start <= g.end && end >= g.start) {
      // Overlapping: new group must be at a different level
      if (maxOverlappingLevel < g.level) {
        maxOverlappingLevel = g.level;
      }
    }
  }
  return maxOverlappingLevel + 1;
}

/**
 * 新しいグループを追加する。
 * ネストレベルの自動計算（既存グループとの重なりに基づく）と
 * 最大3階層の制限を適用する。
 */
export function addGroup(
  groups: GroupRange[],
  start: number,
  end: number,
): { groups: GroupRange[]; newGroup: GroupRange } | { error: string } {
  const level = computeGroupLevel(groups, start, end);
  if (level > 3) {
    return { error: '最大3階層までのネストに制限されています' };
  }

  const newGroup: GroupRange = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    start,
    end,
    level,
    collapsed: false,
  };

  return { groups: [...groups, newGroup], newGroup };
}

/**
 * グループを削除する。
 */
export function removeGroup(
  groups: GroupRange[],
  groupId: string,
): GroupRange[] {
  return groups.filter(g => g.id !== groupId);
}

/**
 * グループの折りたたみ/展開を切り替える。
 */
export function toggleGroupCollapse(
  groups: GroupRange[],
  groupId: string,
): GroupRange[] {
  return groups.map(g =>
    g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
  );
}

/**
 * レベルボタンによる一括展開/折りたたみ。
 * 指定レベル以下のグループを展開し、それ以上を折りたたむ。
 */
export function setExpandLevel(
  groups: GroupRange[],
  level: number,
): GroupRange[] {
  return groups.map(g => ({
    ...g,
    collapsed: g.level >= level,
  }));
}

/**
 * 折りたたまれたグループに基づいて非表示にすべき行/列インデックスの
 * Set を計算する。
 */
export function computeCollapsedIndices(
  groups: GroupRange[],
  frozenCount: number = 0,
): Set<number> {
  const hidden = new Set<number>();
  for (const g of groups) {
    if (g.collapsed) {
      for (let i = g.start; i <= g.end; i++) {
        // Skip frozen rows/cols
        if (i < frozenCount) continue;
        hidden.add(i);
      }
    }
  }
  // Also check if a parent group is collapsed - children indices should be hidden
  // This is handled naturally because we iterate all collapsed groups
  return hidden;
}

/**
 * グループの最大ネストレベルを返す（ヘッダー領域の幅/高さ計算用）。
 */
export function getMaxGroupLevel(groups: GroupRange[]): number {
  if (groups.length === 0) return 0;
  return Math.max(...groups.map(g => g.level));
}

/**
 * 行/列の挿入・削除時にグループ範囲をシフトする。
 */
export function shiftGroupRanges(
  groups: GroupRange[],
  index: number,
  operation: 'insert' | 'delete',
): GroupRange[] {
  if (operation === 'insert') {
    return groups.map(g => {
      if (g.start >= index) {
        return { ...g, start: g.start + 1, end: g.end + 1 };
      } else if (index <= g.end) {
        // Index is within the group range - expand the group
        return { ...g, end: g.end + 1 };
      }
      return g;
    });
  } else {
    // Delete
    return groups
      .filter(g => !(g.start === index && g.end === index)) // Remove single-element groups at the deleted index
      .map(g => {
        if (g.start > index) {
          return { ...g, start: g.start - 1, end: g.end - 1 };
        } else if (g.start <= index && index <= g.end) {
          // Index is within the group - shrink the group
          return { ...g, end: g.end - 1 };
        }
        return g;
      });
  }
}
