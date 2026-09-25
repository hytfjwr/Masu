import { memo, useMemo } from 'react';
import type { SaveStatus as SaveStatusType } from '../../hooks/useAutosave';

interface SaveStatusProps {
  status: SaveStatusType;
  lastSavedAt: number | null;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export const SaveStatus = memo(function SaveStatus({ status, lastSavedAt }: SaveStatusProps) {
  const title = useMemo(
    () => (lastSavedAt !== null ? `最終保存: ${formatTime(lastSavedAt)}` : undefined),
    [lastSavedAt],
  );

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-primary/60 px-1.5 whitespace-nowrap select-none animate-fade-in">
        <svg className="save-spinner" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
          <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="var(--color-accent-selection)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        保存中…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="text-xs text-error px-1.5 whitespace-nowrap select-none">
        保存できませんでした
      </span>
    );
  }

  // Keyed by save time so the checkmark re-draws on every save
  return (
    <span
      key={lastSavedAt ?? 0}
      className="flex items-center gap-1.5 text-xs text-text-primary/60 px-1.5 whitespace-nowrap select-none animate-fade-in"
      title={title}
    >
      <svg className="save-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <circle cx="6" cy="6" r="5.5" fill="color-mix(in srgb, var(--color-accent-formula) 18%, transparent)" />
        <path d="M3.4 6.2l1.8 1.8 3.4-3.6" fill="none" stroke="var(--color-accent-formula)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      すべての変更を保存しました
    </span>
  );
});
