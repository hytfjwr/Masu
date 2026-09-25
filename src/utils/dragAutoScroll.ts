/**
 * Edge auto-scroll while dragging (selection, fill handle, formula references, header ranges).
 * All values are logical (unzoomed) pixels relative to the scroll container's top-left corner.
 */

/** Distance from the edge of the scrollable (unfrozen) viewport where auto-scroll starts */
export const AUTO_SCROLL_EDGE = 24;
const MIN_SPEED = 4;
const MAX_SPEED = 48;

export type DragAxis = 'both' | 'x' | 'y';

export interface DragViewport {
  /** Pointer position (may be outside the container) */
  x: number;
  y: number;
  /** Visible content size of the scroll container (clientWidth / clientHeight) */
  viewWidth: number;
  viewHeight: number;
  /** Size of the frozen columns / rows pinned at the top-left of the viewport */
  frozenWidth: number;
  frozenHeight: number;
  scrollLeft: number;
  scrollTop: number;
  maxScrollLeft: number;
  maxScrollTop: number;
  /** The drag started inside the frozen columns / rows: entering them is plain selection, not a scroll request */
  anchorInFrozenCols: boolean;
  anchorInFrozenRows: boolean;
  axis: DragAxis;
}

function speed(overshoot: number): number {
  return Math.min(MAX_SPEED, MIN_SPEED + overshoot * 0.35);
}

/**
 * How far to scroll this frame. Scrolling starts when the pointer is within AUTO_SCROLL_EDGE of the
 * scrollable viewport's edge or beyond it, and speeds up with the distance. The start/top edge is the
 * boundary of the frozen panes (unless the drag started inside them), so dragging back over frozen
 * rows/columns scrolls the unfrozen area back into view.
 */
export function computeAutoScrollDelta(v: DragViewport): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;

  if (v.axis !== 'y') {
    const right = v.x - (v.viewWidth - AUTO_SCROLL_EDGE);
    const leftEdge = v.anchorInFrozenCols ? 0 : v.frozenWidth;
    const left = leftEdge + AUTO_SCROLL_EDGE - v.x;
    if (right > 0 && v.scrollLeft < v.maxScrollLeft) dx = Math.min(speed(right), v.maxScrollLeft - v.scrollLeft);
    else if (left > 0 && v.scrollLeft > 0 && !(v.anchorInFrozenCols && v.x < v.frozenWidth)) dx = -Math.min(speed(left), v.scrollLeft);
  }

  if (v.axis !== 'x') {
    const bottom = v.y - (v.viewHeight - AUTO_SCROLL_EDGE);
    const topEdge = v.anchorInFrozenRows ? 0 : v.frozenHeight;
    const top = topEdge + AUTO_SCROLL_EDGE - v.y;
    if (bottom > 0 && v.scrollTop < v.maxScrollTop) dy = Math.min(speed(bottom), v.maxScrollTop - v.scrollTop);
    else if (top > 0 && v.scrollTop > 0 && !(v.anchorInFrozenRows && v.y < v.frozenHeight)) dy = -Math.min(speed(top), v.scrollTop);
  }

  return { dx, dy };
}

/**
 * Map the pointer to the point that should be hit-tested while dragging: clamped into the visible
 * viewport (a pointer beyond the edge targets the last visible column/row), and — while the unfrozen
 * area is scrolled and the drag started outside the frozen panes — a pointer over the frozen panes
 * targets the first visible unfrozen column/row instead of the frozen cells underneath.
 */
export function clampDragPoint(v: Omit<DragViewport, 'maxScrollLeft' | 'maxScrollTop' | 'axis'>): { x: number; y: number } {
  let x = Math.min(Math.max(v.x, 0), Math.max(v.viewWidth - 1, 0));
  let y = Math.min(Math.max(v.y, 0), Math.max(v.viewHeight - 1, 0));
  if (!v.anchorInFrozenCols && v.scrollLeft > 0 && x < v.frozenWidth) x = v.frozenWidth;
  if (!v.anchorInFrozenRows && v.scrollTop > 0 && y < v.frozenHeight) y = v.frozenHeight;
  return { x, y };
}
