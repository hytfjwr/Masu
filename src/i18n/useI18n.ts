import { useCallback, useSyncExternalStore } from 'react';
import {
  getLocale,
  setLocale,
  subscribeLocale,
  translate,
  type Locale,
  type TFunction,
} from './index';

/**
 * Current locale and a `t` bound to it. `t` changes identity when the locale changes, so memoized
 * values that list it as a dependency are rebuilt on a language switch.
 */
export function useI18n(): { t: TFunction; locale: Locale; setLocale: (locale: Locale) => void } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  const t = useCallback<TFunction>((key, params) => translate(locale, key, params), [locale]);
  return { t, locale, setLocale };
}
