import { memo } from 'react';
import { LOCALES, LOCALE_NAMES } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

/** Short label on each segment; the full name is in the tooltip. */
const LOCALE_SHORT = { en: 'EN', ja: 'JA' } as const;

/** Segmented English / Japanese switch, styled like ThemeToggle. */
export const LanguageToggle = memo(function LanguageToggle() {
  const { t, locale, setLocale } = useI18n();
  const index = Math.max(0, LOCALES.indexOf(locale));

  return (
    <div
      className="theme-segment"
      role="radiogroup"
      aria-label={t('common.language')}
      data-testid="language-toggle"
    >
      <span
        aria-hidden
        className="theme-segment-thumb"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={value === locale}
          aria-label={LOCALE_NAMES[value]}
          title={t('common.languageOption', { name: LOCALE_NAMES[value] })}
          lang={value}
          className="theme-segment-option text-[10px] font-semibold tracking-wide"
          onClick={() => setLocale(value)}
        >
          {LOCALE_SHORT[value]}
        </button>
      ))}
    </div>
  );
});
