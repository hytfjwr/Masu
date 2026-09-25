import { memo, useCallback, useMemo, useRef } from 'react';
import { GRID_CONSTANTS } from '../../types/grid';

interface RowHeaderProps {
  rowIndex: number;
  top: number;
  height: number;
  onResize?: (rowIndex: number, newHeight: number) => void;
  onContextMenu?: (rowIndex: number, x: number, y: number) => void;
  onSelect?: (rowIndex: number, e: { shiftKey: boolean }) => void;
  onAutoFit?: (rowIndex: number) => void;
  /** Current zoom level (percent, default 100). The header lives inside a CSS `zoom`-scaled wrapper,
   * so mouse movement deltas must be divided back into logical pixels before updating heights. */
  zoom?: number;
  /** There's a hidden row immediately above (before) this one */
  hiddenBefore?: boolean;
  /** There's a hidden row immediately below (after) this one */
  hiddenAfter?: boolean;
  /** Unhide the contiguous hidden run ending just before this row */
  onUnhideBefore?: () => void;
  /** Unhide the contiguous hidden run starting just after this row */
  onUnhideAfter?: () => void;
}

export const RowHeader = memo(function RowHeader({
  rowIndex,
  top,
  height,
  onResize,
  onContextMenu,
  onSelect,
  onAutoFit,
  zoom = 100,
  hiddenBefore,
  hiddenAfter,
  onUnhideBefore,
  onUnhideAfter,
}: RowHeaderProps) {
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startYRef.current = e.clientY;
      startHeightRef.current = height ?? GRID_CONSTANTS.DEFAULT_ROW_HEIGHT;
      const zoomFactor = zoom / 100;

      // Coalesce resize updates to one per animation frame (each update re-lays out the grid)
      let pendingSize: number | null = null;
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (pendingSize !== null) onResize?.(rowIndex, pendingSize);
        pendingSize = null;
      };
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = (moveEvent.clientY - startYRef.current) / zoomFactor;
        pendingSize = startHeightRef.current + delta;
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
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [rowIndex, height, onResize, zoom],
  );

  const handleResizeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onAutoFit?.(rowIndex);
    },
    [rowIndex, onAutoFit],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu?.(rowIndex, e.clientX, e.clientY);
    },
    [rowIndex, onContextMenu],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onSelect?.(rowIndex, { shiftKey: e.shiftKey });
    },
    [rowIndex, onSelect],
  );

  const positionStyle: React.CSSProperties = useMemo(
    () => ({
      top,
      height,
      left: 0,
      width: GRID_CONSTANTS.ROW_HEADER_WIDTH,
    }),
    [top, height],
  );

  return (
    <div
      data-row-header
      data-row-index={rowIndex}
      className="absolute flex items-center justify-center border-r border-b border-grid-line bg-header-bg text-text-primary text-xs font-medium select-none transition-[background] duration-100"
      style={positionStyle}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      {rowIndex + 1}
      {/* Resize handle */}
      <div
        data-resize-handle
        className="absolute left-0 right-0 bottom-0 h-1 cursor-row-resize hover:bg-accent-selection/30 z-10 transition-all duration-100"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleResizeDoubleClick}
      />

      {/* Hidden-row boundary indicators: unhide the adjacent hidden run on click */}
      {hiddenBefore && (
        <button
          type="button"
          data-testid={`unhide-row-before-${rowIndex}`}
          title="非表示の行を再表示"
          className="absolute top-0 left-0 w-[10px] h-[10px] flex items-center justify-center leading-none text-[8px] bg-accent-selection/20 hover:bg-accent-selection/40 text-accent-selection z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnhideBefore?.();
          }}
        >
          ▴
        </button>
      )}
      {hiddenAfter && (
        <button
          type="button"
          data-testid={`unhide-row-after-${rowIndex}`}
          title="非表示の行を再表示"
          className="absolute bottom-0 left-0 w-[10px] h-[10px] flex items-center justify-center leading-none text-[8px] bg-accent-selection/20 hover:bg-accent-selection/40 text-accent-selection z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnhideAfter?.();
          }}
        >
          ▾
        </button>
      )}
    </div>
  );
});
