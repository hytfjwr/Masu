import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';

interface DocumentTitleProps {
  title: string;
  onChange: (title: string) => void;
}

/**
 * Google Sheets-style editable document title: click to turn into an input,
 * Enter/blur commits, Esc cancels. Shown as "Untitled spreadsheet" when empty.
 */
export const DocumentTitle = memo(function DocumentTitle({ title, onChange }: DocumentTitleProps) {
  const { t } = useI18n();
  const untitled = t('common.untitledSpreadsheet');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setDraft(title);
    setEditing(true);
  }, [title]);

  const commit = useCallback(() => {
    onChange(draft.trim());
    setEditing(false);
  }, [draft, onChange]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  // useEffect required: focus and select the input as soon as editing starts
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder={untitled}
        className="h-7 px-2 -ml-2 text-[15px] font-medium tracking-tight bg-grid-bg text-text-primary border border-accent-selection rounded-lg outline-none w-64"
        data-testid="document-title-input"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title={title || untitled}
      className="h-7 max-w-[280px] px-2 -ml-2 text-[15px] font-medium tracking-tight text-text-primary rounded-lg hover:bg-grid-line/60 transition-colors duration-150 truncate text-left select-none"
      data-testid="document-title-button"
    >
      {title || untitled}
    </button>
  );
});
