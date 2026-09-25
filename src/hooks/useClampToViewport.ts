import { useLayoutEffect, type RefObject } from 'react';

const MARGIN = 4;

/**
 * Clamps a fixed-position element within the viewport before the browser paints.
 * Use for context menus positioned at cursor coordinates.
 */
export function useClampFixedToViewport(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y;

    if (left + width > vw - MARGIN) left = vw - width - MARGIN;
    if (top + height > vh - MARGIN) top = vh - height - MARGIN;
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = MARGIN;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [ref, x, y]);
}

/**
 * Clamps an absolute-position dropdown within the viewport using CSS transform.
 * Use for toolbar dropdowns anchored to a parent element.
 */
export function useClampDropdownToViewport(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !isOpen) return;

    el.style.transform = '';

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let tx = 0;
    let ty = 0;

    if (rect.right > vw - MARGIN) tx = -(rect.right - vw + MARGIN);
    if (rect.bottom > vh - MARGIN) ty = -(rect.bottom - vh + MARGIN);
    if (rect.left + tx < MARGIN) tx = MARGIN - rect.left;
    if (rect.top + ty < MARGIN) ty = MARGIN - rect.top;

    if (tx !== 0 || ty !== 0) {
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    }
  }, [ref, isOpen]);
}
