import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { computeAutoScrollDelta } from '../utils/dragAutoScroll';
import type { DragAxis } from '../utils/dragAutoScroll';

export interface DragAutoScrollOptions {
  axis: DragAxis;
  anchorInFrozenCols: boolean;
  anchorInFrozenRows: boolean;
  /** Called after each auto-scroll step so the caller can re-hit-test the (unmoved) pointer */
  onScrolled: () => void;
}

interface Params {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  zoomFactor: number;
  /** Current frozen pane size in logical px (read every frame) */
  getFrozenSize: () => { width: number; height: number };
}

/**
 * Keeps scrolling the grid while a drag holds the pointer near/beyond the viewport edge. The loop runs
 * one step per animation frame, so the selection keeps growing even when the mouse stops moving.
 */
export function useDragAutoScroll({ scrollContainerRef, zoomFactor, getFrozenSize }: Params) {
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const optionsRef = useRef<DragAutoScrollOptions | null>(null);
  const rafRef = useRef(0);
  const zoomRef = useRef(zoomFactor);
  const frozenRef = useRef(getFrozenSize);
  // The loop body lives in a ref so each frame can schedule the next one without a self-referencing callback
  const stepRef = useRef<() => void>(() => {});

  // useEffect required: keep the animation-frame loop's inputs (zoom, frozen size, loop body) current
  // without restarting a running drag; layout effect so they are updated before the next frame
  useLayoutEffect(() => {
    zoomRef.current = zoomFactor;
    frozenRef.current = getFrozenSize;
  });

  const step = useCallback(() => {
    rafRef.current = 0;
    const el = scrollContainerRef.current;
    const pointer = pointerRef.current;
    const opts = optionsRef.current;
    if (!el || !pointer || !opts) return;

    const rect = el.getBoundingClientRect();
    const zoom = zoomRef.current;
    const frozen = frozenRef.current();
    const { dx, dy } = computeAutoScrollDelta({
      x: (pointer.x - rect.left) / zoom,
      y: (pointer.y - rect.top) / zoom,
      viewWidth: el.clientWidth,
      viewHeight: el.clientHeight,
      frozenWidth: frozen.width,
      frozenHeight: frozen.height,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      maxScrollLeft: el.scrollWidth - el.clientWidth,
      maxScrollTop: el.scrollHeight - el.clientHeight,
      anchorInFrozenCols: opts.anchorInFrozenCols,
      anchorInFrozenRows: opts.anchorInFrozenRows,
      axis: opts.axis,
    });

    if (dx !== 0 || dy !== 0) {
      el.scrollLeft += dx;
      el.scrollTop += dy;
      opts.onScrolled();
    }
    // Keep polling while the drag is active: the pointer may sit still beyond the edge
    rafRef.current = requestAnimationFrame(() => stepRef.current());
  }, [scrollContainerRef]);

  // useEffect required: publish the latest loop body to the ref used by scheduled frames
  useLayoutEffect(() => {
    stepRef.current = step;
  }, [step]);

  /** Record the latest pointer position of an active drag (starts the loop on first call). */
  const track = useCallback((clientX: number, clientY: number, options: DragAutoScrollOptions) => {
    pointerRef.current = { x: clientX, y: clientY };
    optionsRef.current = options;
    if (rafRef.current === 0) rafRef.current = requestAnimationFrame(() => stepRef.current());
  }, []);

  /** End the drag's auto-scroll. */
  const stop = useCallback(() => {
    if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    pointerRef.current = null;
    optionsRef.current = null;
  }, []);

  // useEffect required: cancel a running animation-frame loop when the grid unmounts
  useEffect(() => stop, [stop]);

  return { track, stop };
}
