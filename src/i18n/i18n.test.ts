import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { getLocale, setLocale, subscribeLocale, t, translate, type MessageKey } from './index';
import { messageTables, messages } from './messages';
import type { Message } from './types';

function forms(message: Message): string[] {
  return typeof message === 'string' ? [message] : [message.one, message.other];
}

function placeholders(message: Message): string[] {
  const names = new Set<string>();
  for (const text of forms(message)) {
    for (const m of text.matchAll(/\{(\w+)\}/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('message tables', () => {
  it('defines each key in only one area', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [area, table] of Object.entries(messageTables)) {
      for (const key of Object.keys(table)) {
        const other = seen.get(key);
        if (other) duplicates.push(`${key} (${other}, ${area})`);
        seen.set(key, area);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('uses the same placeholders in English and Japanese', () => {
    const mismatched = Object.entries(messages)
      .filter(([, m]) => placeholders(m.en).join() !== placeholders(m.ja).join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('has no empty translations', () => {
    const empty = Object.entries(messages)
      .filter(([, m]) => [...forms(m.en), ...forms(m.ja)].some((s) => s.trim() === ''))
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('gives plural forms a {count} placeholder', () => {
    const missing = Object.entries(messages)
      .filter(([, m]) => [m.en, m.ja].some((f) => typeof f !== 'string'))
      .filter(([, m]) => !placeholders(m.en).includes('count'))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });
});

describe('translate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'common.languageOption', { name: 'English' })).toBe('Language: English');
    expect(translate('ja', 'common.languageOption')).toBe('言語: {name}');
  });

  it('picks the plural form by count', () => {
    const key = 'test.plural' as MessageKey;
    const table = messages as unknown as Record<string, Record<'en' | 'ja', Message>>;
    table[key] = { en: { one: '{count} row', other: '{count} rows' }, ja: '{count} 行' };
    try {
      expect(translate('en', key, { count: 1 })).toBe('1 row');
      expect(translate('en', key, { count: 3 })).toBe('3 rows');
      expect(translate('ja', key, { count: 1 })).toBe('1 行');
    } finally {
      delete table[key];
    }
  });
});

describe('locale switching', () => {
  afterEach(() => setLocale('ja'));

  it('notifies subscribers and switches t', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocale(listener);
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(listener).toHaveBeenCalledTimes(1);
    setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setLocale('ja');
    expect(t('common.cancel')).toBe('キャンセル');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
