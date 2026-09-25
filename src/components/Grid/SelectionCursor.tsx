import { useState } from 'react';

export interface CursorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Jumps longer than this (content px, Manhattan) snap instead of gliding across the sheet. */
const GLIDE_MAX_DISTANCE = 1600;

/**
 * Animated selection outline drawn in the scrollable pane's content space: it glides (transform +
 * size transition) from the previous rect to the new one instead of jumping cell to cell. Because it
 * lives inside the scrolled content, native scrolling moves it with no JS and frozen panes cover it.
 */
export function SelectionCursor({
  rect,
  variant,
}: {
  rect: CursorRect;
  variant: 'active' | 'range';
}) {
  // Previous rect, tracked during render so a far jump (Ctrl+End, Name box, …) can snap.
  const [prev, setPrev] = useState(rect);
  const [snap, setSnap] = useState(false);
  if (
    prev.left !== rect.left ||
    prev.top !== rect.top ||
    prev.width !== rect.width ||
    prev.height !== rect.height
  ) {
    const distance = Math.abs(rect.left - prev.left) + Math.abs(rect.top - prev.top);
    setPrev(rect);
    setSnap(distance > GLIDE_MAX_DISTANCE);
  }

  return (
    <div
      aria-hidden
      data-selection-cursor={variant}
      className={snap ? 'selection-cursor selection-cursor-snap' : 'selection-cursor'}
      style={{
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
