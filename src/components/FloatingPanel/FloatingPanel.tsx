import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const GAP = 4;
const MARGIN = 8;

interface FloatingPanelProps {
  /** The trigger the panel opens from (placed below it, flipped above when there's no room). */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Ref to the panel element (callers use it for click-outside checks). */
  panelRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
}

/**
 * Dropdown panel rendered into document.body with fixed positioning, so it's never clipped by an
 * `overflow` ancestor (the horizontally scrollable toolbar, scrolling side panels). Because it's
 * portaled, callers' click-outside handlers must treat clicks inside `panelRef` as inside.
 */
export function FloatingPanel({ anchorRef, panelRef, className, children }: FloatingPanelProps) {
  // useLayoutEffect required: measures the anchor/panel and positions the portaled panel before paint
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(MARGIN, Math.min(a.left, vw - MARGIN - p.width));
      let top = a.bottom + GAP;
      if (top + p.height > vh - MARGIN) top = Math.max(MARGIN, a.top - GAP - p.height);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, panelRef]);

  return createPortal(
    <div
      ref={panelRef}
      data-dropdown
      className={className}
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 60, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
