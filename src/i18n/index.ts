import { STORAGE_KEYS } from '../utils/storageKeys';
import { messages, type MessageKey } from './messages';
import type { Locale, Message } from './types';

export type { Locale } from './types';
export type { MessageKey } from './messages';

export const LOCALES: readonly Locale[] = ['en', 'ja'];

/** Display name of each locale, written in that locale (shown in the language switch). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ja: '日本語' };

export type TranslateParams = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: TranslateParams) => string;

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Saved choice first, then the browser language (Japanese for any `ja*`, English otherwise). */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.locale);
    if (isLocale(saved)) return saved;
  } catch {
    // storage unavailable: fall back to the browser language
  }
  const languages =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const lang of languages) {
    if (!lang) continue;
    const base = lang.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

let currentLocale: Locale = detectLocale();
const listeners = new Set<() => void>();

function syncDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale;
}
syncDocumentLang();

export function getLocale(): Locale {
  return currentLocale;
}

/** Switch the UI language, remember it, and notify subscribers (useI18n re-renders). */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEYS.locale, locale);
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
  syncDocumentLang();
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

function selectForm(locale: Locale, message: Message, params?: TranslateParams): string {
  if (typeof message === 'string') return message;
  const count = Number(params?.count ?? 0);
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === 'one' ? message.one : message.other;
}

export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const text = selectForm(locale, messages[key][locale], params);
  if (!params) return text;
  // Unknown placeholders stay as-is so a missing param is visible rather than silently blank
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Translate in the current locale. For code outside React (utils, engine errors, toasts built in
 * hooks); the string is fixed at call time. Components use `useI18n().t` so they re-render on switch.
 */
export const t: TFunction = (key, params) => translate(currentLocale, key, params);
