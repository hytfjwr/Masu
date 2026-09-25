import { memo, useCallback } from 'react';
import type { GroupRange } from '../../types/grid';
import { useI18n } from '../../i18n/useI18n';

const GROUP_INDENT = 16;

interface ColGroupBarProps {
  groups: GroupRange[];
  maxLevel: number;
  colVirtualItems: Array<{ index: number; start: number; size: number }>;
  onToggleCollapse: (groupId: string) => void;
  onSetExpandLevel: (level: number) => void;
  totalWidth: number;
}

export const ColGroupBar = memo(function ColGroupBar({
  groups,
  maxLevel,
  colVirtualItems,
  onToggleCollapse,
  onSetExpandLevel,
  totalWidth,
}: ColGroupBarProps) {
  const { t } = useI18n();
  const handleLevelClick = useCallback(
    (level: number) => {
      onSetExpandLevel(level);
    },
    [onSetExpandLevel],
  );

  if (maxLevel === 0) return null;

  const height = maxLevel * GROUP_INDENT;

  // Build position map: real col index -> virtual item info
  const colPositionMap = new Map<number, { start: number; size: number }>();
  for (const item of colVirtualItems) {
    colPositionMap.set(item.index, { start: item.start, size: item.size });
  }

  return (
    <div className="relative" style={{ width: totalWidth, height }}>
      {/* Level buttons on the left */}
      <div
        className="sticky left-0 flex items-center gap-0 bg-header-bg z-10 border-r border-grid-line"
        style={{ height }}
      >
        {Array.from({ length: maxLevel }, (_, i) => (
          <button
            key={i}
            type="button"
            className="text-[9px] text-text-primary hover:bg-accent-selection/10 w-4 h-4 flex items-center justify-center"
            onClick={() => handleLevelClick(i + 1)}
            title={t('grid.groupBar.level', { level: i + 1 })}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Group bars */}
      {groups.map((group) => {
        const levelY = (group.level - 1) * GROUP_INDENT;

        const startInfo = colPositionMap.get(group.start);
        const endInfo = colPositionMap.get(group.end);

        if (group.collapsed) {
          let buttonLeft = 0;
          for (const item of colVirtualItems) {
            if (item.index >= group.start) {
              buttonLeft = item.start;
              break;
            }
            buttonLeft = item.start + item.size;
          }

          return (
            <button
              key={group.id}
              type="button"
              className="absolute text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-grid-line bg-header-bg text-text-primary hover:bg-accent-selection/10 rounded-sm"
              style={{
                top: levelY + 1,
                left: buttonLeft - 2,
              }}
              onClick={() => onToggleCollapse(group.id)}
              title={t('grid.groupBar.expand')}
            >
              +
            </button>
          );
        }

        if (!startInfo || !endInfo) return null;

        const barLeft = startInfo.start;
        const barRight = endInfo.start + endInfo.size;
        const barWidth = barRight - barLeft;

        return (
          <div key={group.id}>
            {/* Horizontal bar */}
            <div
              className="absolute border-t border-r border-grid-line"
              style={{
                top: levelY + GROUP_INDENT / 2,
                left: barLeft + 4,
                width: barWidth - 8,
                height: GROUP_INDENT / 2,
              }}
            />
            {/* Collapse button at the end */}
            <button
              type="button"
              className="absolute text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-grid-line bg-header-bg text-text-primary hover:bg-accent-selection/10 rounded-sm"
              style={{
                top: levelY + 1,
                left: barRight - 8,
              }}
              onClick={() => onToggleCollapse(group.id)}
              title={t('grid.groupBar.collapse')}
            >
              −
            </button>
          </div>
        );
      })}
    </div>
  );
});
