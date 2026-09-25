// @vitest-environment happy-dom
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { setLocale } from '../../i18n';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  cleanup();
  setLocale('ja');
});

describe('LanguageToggle', () => {
  it('switches every mounted component, the html lang and the saved choice', () => {
    const { getByTestId, getByRole } = render(
      <>
        <LanguageToggle />
        <ThemeToggle theme="light" onThemeChange={() => {}} />
      </>,
    );
    const themeGroup = getByTestId('theme-toggle');
    expect(themeGroup.getAttribute('aria-label')).toBe('テーマ');
    expect(getByRole('radio', { name: '日本語' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(getByRole('radio', { name: 'English' }));

    expect(themeGroup.getAttribute('aria-label')).toBe('Theme');
    expect(getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(STORAGE_KEYS.locale)).toBe('en');
  });
});
