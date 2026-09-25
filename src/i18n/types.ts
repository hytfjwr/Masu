export type Locale = 'en' | 'ja';

/**
 * A translated string. `{name}` placeholders are filled from the params passed to `t`.
 * The plural form picks `one` / `other` by the `count` param (Intl.PluralRules of the locale).
 */
export type Message = string | { one: string; other: string };

/** One area's messages; every key carries both locales side by side. */
export type MessageTable = Record<string, Record<Locale, Message>>;
