import { memo, useCallback } from 'react';
import type { GroupRange } from '../../types/grid';

const GROUP_INDENT = 16;

interface RowGroupBarProps {
  groups: GroupRange[];
  maxLevel: number;
  visibleRowIndices: number[];
  getRowHeight: (rowIndex: number) => number;
  rowVirtualItems: Array<{ index: number; start: number; size: number }>;
  onToggleCollapse: (groupId: string) => void;
  onSetExpandLevel: (level: number) => void;
  totalHeight: number;
}

export const RowGroupBar = memo(function RowGroupBar({
  groups,
  maxLevel,
  visibleRowIndices,
  rowVirtualItems,
  onToggleCollapse,
  onSetExpandLevel,
  totalHeight,
}: RowGroupBarProps) {
  const handleLevelClick = useCallback(
    (level: number) => {
      onSetExpandLevel(level);
    },
    [onSetExpandLevel],
  );

  if (maxLevel === 0) return null;

  const width = maxLevel * GROUP_INDENT;

  // Build position map: real row index -> virtual item info
  const rowPositionMap = new Map<number, { start: number; size: number }>();
  for (const item of rowVirtualItems) {
    const actualRow = visibleRowIndices[item.index];
    rowPositionMap.set(actualRow, { start: item.start, size: item.size });
  }

  return (
    <div className="relative" style={{ width, height: totalHeight }}>
      {/* Level buttons at the top */}
      <div
        className="sticky top-0 flex flex-col items-center gap-0 bg-header-bg z-10 border-b border-grid-line"
        style={{ width }}
      >
        {Array.from({ length: maxLevel }, (_, i) => (
          <button
            key={i}
            type="button"
            className="text-[9px] text-text-primary hover:bg-accent-selection/10 w-4 h-4 flex items-center justify-center"
            onClick={() => handleLevelClick(i + 1)}
            title={`レベル ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Group bars */}
      {groups.map((group) => {
        const levelX = (group.level - 1) * GROUP_INDENT;

        // Find start and end positions in the visible area
        const startInfo = rowPositionMap.get(group.start);
        const endInfo = rowPositionMap.get(group.end);

        if (group.collapsed) {
          // When collapsed, show + button at the position where the group starts
          // Find the first visible row after the group ends
          let buttonTop = 0;
          for (const item of rowVirtualItems) {
            const actualRow = visibleRowIndices[item.index];
            if (actualRow >= group.start) {
              buttonTop = item.start;
              break;
            }
            buttonTop = item.start + item.size;
          }

          return (
            <button
              key={group.id}
              type="button"
              className="absolute text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-grid-line bg-header-bg text-text-primary hover:bg-accent-selection/10 rounded-sm"
              style={{
                left: levelX + 1,
                top: buttonTop - 2,
              }}
              onClick={() => onToggleCollapse(group.id)}
              title="展開"
            >
              +
            </button>
          );
        }

        // Expanded: draw vertical bar and - button
        if (!startInfo || !endInfo) return null;

        const barTop = startInfo.start;
        const barBottom = endInfo.start + endInfo.size;
        const barHeight = barBottom - barTop;

        return (
          <div key={group.id}>
            {/* Vertical bar */}
            <div
              className="absolute border-l border-b border-grid-line"
              style={{
                left: levelX + GROUP_INDENT / 2,
                top: barTop + 4,
                height: barHeight - 8,
                width: GROUP_INDENT / 2,
              }}
            />
            {/* Collapse button at the end */}
            <button
              type="button"
              className="absolute text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-grid-line bg-header-bg text-text-primary hover:bg-accent-selection/10 rounded-sm"
              style={{
                left: levelX + 1,
                top: barBottom - 8,
              }}
              onClick={() => onToggleCollapse(group.id)}
              title="折りたたみ"
            >
              −
            </button>
          </div>
        );
      })}
    </div>
  );
});
