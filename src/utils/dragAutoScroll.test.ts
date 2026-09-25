import { describe, it, expect } from 'vite-plus/test';
import { AUTO_SCROLL_EDGE, clampDragPoint, computeAutoScrollDelta } from './dragAutoScroll';
import type { DragViewport } from './dragAutoScroll';

const base: DragViewport = {
  x: 400,
  y: 300,
  viewWidth: 800,
  viewHeight: 600,
  frozenWidth: 0,
  frozenHeight: 0,
  scrollLeft: 500,
  scrollTop: 500,
  maxScrollLeft: 5000,
  maxScrollTop: 5000,
  anchorInFrozenCols: false,
  anchorInFrozenRows: false,
  axis: 'both',
};

describe('computeAutoScrollDelta', () => {
  it('does not scroll while the pointer is well inside the viewport', () => {
    expect(computeAutoScrollDelta(base)).toEqual({ dx: 0, dy: 0 });
  });

  it('scrolls right/down near or beyond the far edges, faster further out', () => {
    const near = computeAutoScrollDelta({ ...base, x: 800 - AUTO_SCROLL_EDGE + 2, y: 610 });
    const far = computeAutoScrollDelta({ ...base, x: 950 });
    expect(near.dx).toBeGreaterThan(0);
    expect(near.dy).toBeGreaterThan(0);
    expect(far.dx).toBeGreaterThan(near.dx);
  });

  it('scrolls left/up near the start edges only when scrolled', () => {
    expect(computeAutoScrollDelta({ ...base, x: 5, y: 5 })).toEqual({
      dx: expect.any(Number),
      dy: expect.any(Number),
    });
    expect(computeAutoScrollDelta({ ...base, x: 5, y: 5 }).dx).toBeLessThan(0);
    expect(computeAutoScrollDelta({ ...base, x: -50, y: 300, scrollLeft: 0 }).dx).toBe(0);
  });

  it('treats the frozen pane boundary as the start edge', () => {
    // pointer over the frozen columns while scrolled → scroll back left
    expect(computeAutoScrollDelta({ ...base, frozenWidth: 200, x: 150 }).dx).toBeLessThan(0);
    // pointer just right of the frozen columns (within the edge band) → also scroll left
    expect(computeAutoScrollDelta({ ...base, frozenWidth: 200, x: 210 }).dx).toBeLessThan(0);
    // pointer well inside the unfrozen area → no scroll
    expect(computeAutoScrollDelta({ ...base, frozenWidth: 200, x: 300 }).dx).toBe(0);
  });

  it('does not scroll back when the drag started inside the frozen panes', () => {
    expect(
      computeAutoScrollDelta({ ...base, frozenHeight: 100, y: 50, anchorInFrozenRows: true }).dy,
    ).toBe(0);
  });

  it('respects the axis restriction and scroll limits', () => {
    expect(computeAutoScrollDelta({ ...base, x: 950, y: 700, axis: 'x' }).dy).toBe(0);
    expect(computeAutoScrollDelta({ ...base, x: 950, y: 700, axis: 'y' }).dx).toBe(0);
    expect(computeAutoScrollDelta({ ...base, x: 950, scrollLeft: 4998 }).dx).toBe(2);
  });
});

describe('clampDragPoint', () => {
  it('clamps a pointer outside the viewport to its edge', () => {
    expect(clampDragPoint({ ...base, x: 1200, y: -40 })).toEqual({ x: 799, y: 0 });
  });

  it('maps the frozen area to the first unfrozen column/row while scrolled', () => {
    expect(clampDragPoint({ ...base, frozenWidth: 200, frozenHeight: 48, x: 100, y: 10 })).toEqual({
      x: 200,
      y: 48,
    });
  });

  it('selects frozen cells normally when not scrolled or when the drag started in them', () => {
    expect(clampDragPoint({ ...base, frozenWidth: 200, x: 100, scrollLeft: 0 })).toEqual({
      x: 100,
      y: 300,
    });
    expect(clampDragPoint({ ...base, frozenWidth: 200, x: 100, anchorInFrozenCols: true })).toEqual(
      { x: 100, y: 300 },
    );
  });
});
