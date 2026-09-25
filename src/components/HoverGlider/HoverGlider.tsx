import { memo, useEffect, useRef } from 'react';

interface HoverGliderProps {
  /** Which descendants of the parent the highlight tracks. */
  selector?: string;
}

/**
 * One shared hover highlight for a row of controls: rendered as the first child of a container
 * marked `data-hover-glide` (see index.css), it slides and resizes to whichever matching control
 * the pointer is over, instead of each control flashing its own hover background.
 */
export const HoverGlider = memo(function HoverGlider({ selector = 'button:not(:disabled)' }: HoverGliderProps) {
  const ref = useRef<HTMLDivElement>(null);

  // useEffect required: pointer listeners + DOM measurement on the host container
  useEffect(() => {
    const glider = ref.current;
    const host = glider?.parentElement;
    if (!glider || !host) return;

    const hide = () => glider.removeAttribute('data-visible');
    const handleOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>(selector);
      // Popovers opened from the row (color picker, menus…) have their own hover styling
      if (!target || !host.contains(target) || target.closest('[data-dropdown], [data-context-menu]')) {
        hide();
        return;
      }
      const hostRect = host.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      // Rects are in (zoomed) screen px; the glider lives in the host's scrollable content box
      const left = r.left - hostRect.left - host.clientLeft + host.scrollLeft;
      const top = r.top - hostRect.top - host.clientTop + host.scrollTop;
      const appearing = !glider.hasAttribute('data-visible');
      // Appear in place (no slide from the last position), then glide between controls
      if (appearing) glider.setAttribute('data-snap', '');
      glider.style.transform = `translate(${left}px, ${top}px)`;
      glider.style.width = `${r.width}px`;
      glider.style.height = `${r.height}px`;
      if (appearing) {
        void glider.offsetWidth; // commit the snapped position before re-enabling transitions
        glider.removeAttribute('data-snap');
      }
      glider.setAttribute('data-visible', '');
    };

    host.addEventListener('pointerover', handleOver);
    host.addEventListener('pointerleave', hide);
    host.addEventListener('scroll', hide, { passive: true });
    return () => {
      host.removeEventListener('pointerover', handleOver);
      host.removeEventListener('pointerleave', hide);
      host.removeEventListener('scroll', hide);
    };
  }, [selector]);

  return <div ref={ref} aria-hidden className="hover-glider" />;
});
