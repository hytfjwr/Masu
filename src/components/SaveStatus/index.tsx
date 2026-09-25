import { memo, useMemo } from 'react';
import type { SaveStatus as SaveStatusType } from '../../hooks/useAutosave';
import { useI18n } from '../../i18n/useI18n';

interface SaveStatusProps {
  status: SaveStatusType;
  lastSavedAt: number | null;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export const SaveStatus = memo(function SaveStatus({ status, lastSavedAt }: SaveStatusProps) {
  const { t } = useI18n();
  const title = useMemo(
    () =>
      lastSavedAt !== null
        ? t('chrome.saveStatus.lastSaved', { time: formatTime(lastSavedAt) })
        : undefined,
    [lastSavedAt, t],
  );

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-primary/60 px-1.5 whitespace-nowrap select-none animate-fade-in">
        <svg className="save-spinner" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle
            cx="6"
            cy="6"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="1.5"
          />
          <path
            d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5"
            fill="none"
            stroke="var(--color-accent-selection)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {t('chrome.saveStatus.saving')}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="text-xs text-error px-1.5 whitespace-nowrap select-none">
        {t('chrome.saveStatus.error')}
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
        <circle
          cx="6"
          cy="6"
          r="5.5"
          fill="color-mix(in srgb, var(--color-accent-formula) 18%, transparent)"
        />
        <path
          d="M3.4 6.2l1.8 1.8 3.4-3.6"
          fill="none"
          stroke="var(--color-accent-formula)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {t('chrome.saveStatus.saved')}
    </span>
  );
});
