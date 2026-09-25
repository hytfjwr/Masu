import { memo, useCallback, useMemo, useRef } from 'react';
import { GRID_CONSTANTS } from '../../types/grid';
import { colIndexToLetter } from '../../utils/coordinates';

interface ColumnHeaderProps {
  colIndex: number;
  left: number;
  width: number;
  onResize?: (colIndex: number, newWidth: number) => void;
  onContextMenu?: (colIndex: number, x: number, y: number) => void;
  onSelect?: (colIndex: number, e: { shiftKey: boolean }) => void;
  onAutoFit?: (colIndex: number) => void;
  /** Current zoom level (percent, default 100). The header lives inside a CSS `zoom`-scaled wrapper,
   * so mouse movement deltas must be divided back into logical pixels before updating widths. */
  zoom?: number;
  /** There's a hidden column immediately to the left (before) of this one */
  hiddenBefore?: boolean;
  /** There's a hidden column immediately to the right (after) of this one */
  hiddenAfter?: boolean;
  /** Unhide the contiguous hidden run ending just before this column */
  onUnhideBefore?: () => void;
  /** Unhide the contiguous hidden run starting just after this column */
  onUnhideAfter?: () => void;
}

export const ColumnHeader = memo(function ColumnHeader({
  colIndex,
  left,
  width,
  onResize,
  onContextMenu,
  onSelect,
  onAutoFit,
  zoom = 100,
  hiddenBefore,
  hiddenAfter,
  onUnhideBefore,
  onUnhideAfter,
}: ColumnHeaderProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = width ?? GRID_CONSTANTS.DEFAULT_COL_WIDTH;
      const zoomFactor = zoom / 100;

      // Coalesce resize updates to one per animation frame (each update re-lays out the grid)
      let pendingSize: number | null = null;
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (pendingSize !== null) onResize?.(colIndex, pendingSize);
        pendingSize = null;
      };
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = (moveEvent.clientX - startXRef.current) / zoomFactor;
        pendingSize = startWidthRef.current + delta;
        if (raf === 0) raf = requestAnimationFrame(flush);
      };

      const handleMouseUp = () => {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          flush();
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [colIndex, width, onResize, zoom],
  );

  const handleResizeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onAutoFit?.(colIndex);
    },
    [colIndex, onAutoFit],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu?.(colIndex, e.clientX, e.clientY);
    },
    [colIndex, onContextMenu],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onSelect?.(colIndex, { shiftKey: e.shiftKey });
    },
    [colIndex, onSelect],
  );

  const positionStyle: React.CSSProperties = useMemo(() => ({
    left,
    width,
    top: 0,
    height: GRID_CONSTANTS.COL_HEADER_HEIGHT,
  }), [left, width]);

  return (
    <div
      data-col-header
      data-col-index={colIndex}
      className="absolute flex items-center justify-center border-r border-b border-grid-line bg-header-bg text-text-primary text-xs font-medium select-none cursor-pointer transition-[background] duration-100"
      style={positionStyle}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      <span>{colIndexToLetter(colIndex)}</span>

      {/* Resize handle */}
      <div
        data-resize-handle
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-selection/30 z-10 transition-all duration-100"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleResizeDoubleClick}
      />

      {/* Hidden-column boundary indicators: unhide the adjacent hidden run on click */}
      {hiddenBefore && (
        <button
          type="button"
          data-testid={`unhide-col-before-${colIndex}`}
          title="非表示の列を再表示"
          className="absolute left-0 top-0 w-[10px] h-[10px] flex items-center justify-center leading-none text-[8px] bg-accent-selection/20 hover:bg-accent-selection/40 text-accent-selection z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnhideBefore?.();
          }}
        >
          ◂
        </button>
      )}
      {hiddenAfter && (
        <button
          type="button"
          data-testid={`unhide-col-after-${colIndex}`}
          title="非表示の列を再表示"
          className="absolute right-0 top-0 w-[10px] h-[10px] flex items-center justify-center leading-none text-[8px] bg-accent-selection/20 hover:bg-accent-selection/40 text-accent-selection z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnhideAfter?.();
          }}
        >
          ▸
        </button>
      )}
    </div>
  );
});
