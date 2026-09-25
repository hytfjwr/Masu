import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Base position/size of the active cell (the coordinate system CellEditor renders into). */
export interface CellEditorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CellEditorProps {
  /** false = navigation mode (invisible, but focused so it can catch direct typing/IME). */
  isEditing: boolean;
  /** Current edit text. Callers pass '' while !isEditing. */
  value: string;
  /** Fires on every keystroke while isEditing (controlled-input change). */
  onChange: (value: string) => void;
  /** Fires when a printable character is typed while !isEditing, with the textarea's full value. */
  onDirectInput: (value: string) => void;
  /** Fires when an IME composition starts while !isEditing. */
  onCompositionStart: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Font/color/alignment styling, matched to the active cell's CellStyle. */
  style?: React.CSSProperties;
  rect: CellEditorRect;
  /** wrapText cells grow height only; non-wrapText cells grow width to fit the content too. */
  wrapText?: boolean;
  /** Ignore all input (e.g. while the autosaved workbook is still being restored). Focus is kept. */
  readOnly?: boolean;
}

export const CellEditor = forwardRef<HTMLTextAreaElement, CellEditorProps>(function CellEditor(
  {
    isEditing,
    value,
    onChange,
    onDirectInput,
    onCompositionStart,
    onKeyDown,
    style,
    rect,
    wrapText,
    readOnly,
  },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  // Extra size beyond the cell's own rect, grown to fit the content while editing. Only read
  // while isEditing (see width/height below), so it's fine for this to still hold the previous
  // edit's grown size in navigation mode — the next edit's layout effect recomputes it before
  // paint anyway.
  const [grownSize, setGrownSize] = useState<{ width: number; height: number } | null>(null);

  // useLayoutEffect required: measures the textarea's natural content size (scrollWidth/
  // scrollHeight) after every value change and grows the editor to fit before paint.
  useLayoutEffect(() => {
    if (!isEditing) return;
    const ta = textareaRef.current;
    if (!ta) return;

    // Reset to the cell's base size first so scrollWidth/scrollHeight measure the natural
    // (unclamped) content size rather than the previously-grown size.
    ta.style.width = `${rect.width}px`;
    ta.style.height = `${rect.height}px`;

    let width = rect.width;
    if (!wrapText) {
      const maxWidth = Math.max(rect.width, window.innerWidth - rect.left - 8);
      width = Math.min(Math.max(rect.width, ta.scrollWidth + 2), maxWidth);
    }
    const height = Math.max(rect.height, ta.scrollHeight + 2);
    setGrownSize({ width, height });
  }, [isEditing, value, wrapText, rect.left, rect.width, rect.height]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (isEditing) onChange(next);
      else onDirectInput(next);
    },
    [isEditing, onChange, onDirectInput],
  );

  const handleCompositionStart = useCallback(() => {
    if (!isEditing) onCompositionStart();
  }, [isEditing, onCompositionStart]);

  const width = isEditing ? (grownSize?.width ?? rect.width) : rect.width;
  const height = isEditing ? (grownSize?.height ?? rect.height) : rect.height;

  return (
    <textarea
      ref={setRefs}
      data-cell-editor="true"
      value={value}
      readOnly={readOnly}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onKeyDown={readOnly ? undefined : onKeyDown}
      spellCheck={false}
      className={
        isEditing ? 'resize-none outline-none cell-editor-editing' : 'resize-none outline-none'
      }
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width,
        height,
        margin: 0,
        padding: '1px 3px',
        boxSizing: 'border-box',
        border: isEditing ? '2px solid var(--color-accent-selection)' : 'none',
        background: isEditing ? 'var(--color-grid-bg)' : 'transparent',
        opacity: isEditing ? 1 : 0,
        pointerEvents: isEditing ? 'auto' : 'none',
        zIndex: isEditing ? 6 : -1,
        whiteSpace: wrapText ? 'pre-wrap' : 'pre',
        overflowWrap: wrapText ? 'break-word' : 'normal',
        overflow: 'hidden',
        lineHeight: 1.4,
        fontSize: '13px',
        color: 'var(--color-text-primary)',
        ...style,
      }}
    />
  );
});
