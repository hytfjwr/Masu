import { memo } from 'react';
import type { ThemeMode } from '../../types/theme';
import type { ThemeRevealOrigin } from '../../hooks/useTheme';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

interface ThemeToggleProps {
  theme: ThemeMode;
  /** origin: center of the clicked segment, where the theme reveal animation starts */
  onThemeChange: (mode: ThemeMode, origin?: ThemeRevealOrigin) => void;
}

const SunIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" />
  </svg>
);

const MoonIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />
  </svg>
);

const AutoIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden
  >
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 2.2a5.8 5.8 0 0 1 0 11.6z" fill="currentColor" stroke="none" />
  </svg>
);

const THEME_OPTIONS: { value: ThemeMode; labelKey: MessageKey; icon: React.ReactNode }[] = [
  { value: 'light', labelKey: 'chrome.theme.light', icon: SunIcon },
  { value: 'dark', labelKey: 'chrome.theme.dark', icon: MoonIcon },
  { value: 'auto', labelKey: 'chrome.theme.auto', icon: AutoIcon },
];

/** Segmented light / dark / auto switch; the thumb slides to the selected mode. */
export const ThemeToggle = memo(function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  const { t } = useI18n();
  const index = Math.max(
    0,
    THEME_OPTIONS.findIndex((o) => o.value === theme),
  );

  return (
    <div
      className="theme-segment"
      role="radiogroup"
      aria-label={t('chrome.theme')}
      data-testid="theme-toggle"
    >
      <span
        aria-hidden
        className="theme-segment-thumb"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === theme}
          title={t('chrome.theme.option', { name: t(opt.labelKey) })}
          data-theme-option={opt.value}
          className="theme-segment-option"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onThemeChange(opt.value, {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            });
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
});
