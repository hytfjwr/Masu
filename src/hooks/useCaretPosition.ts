import { useEffect, useState } from 'react';

/**
 * Tracks the caret (selectionStart) of a text input/textarea while `active`: typing, clicking and
 * arrow-key moves all update it (the caret can move without the value changing).
 */
export function useCaretPosition(
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  active: boolean,
): number | null {
  const [caret, setCaret] = useState<number | null>(null);

  // useEffect required: subscribes to DOM selection/input events on the editor element
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    // Deferred to the next frame on purpose: a synchronous setState here (a native listener that
    // runs before React's own onChange) makes React re-render the controlled editor with its old
    // value mid-keystroke, which swallows the typed character.
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCaret(el.selectionStart));
    };
    const events = ['input', 'keyup', 'click', 'select', 'selectionchange', 'focus'] as const;
    for (const type of events) el.addEventListener(type, update);
    document.addEventListener('selectionchange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      for (const type of events) el.removeEventListener(type, update);
      document.removeEventListener('selectionchange', update);
    };
  }, [ref, active]);

  return active ? caret : null;
}
