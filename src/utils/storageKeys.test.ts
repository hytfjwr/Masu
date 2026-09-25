import { describe, it, expect } from 'vitest';
import { migrateLegacyStorageKeys, STORAGE_KEYS } from './storageKeys';

/** Minimal in-memory Storage. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, String(v));
    },
  };
}

describe('migrateLegacyStorageKeys', () => {
  it('moves settings from the old sheetcraft- keys to tabula- keys and removes the old ones', () => {
    const storage = memoryStorage({ 'sheetcraft-theme': 'dark', 'sheetcraft-zoom': '125' });
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem(STORAGE_KEYS.theme)).toBe('dark');
    expect(storage.getItem(STORAGE_KEYS.zoom)).toBe('125');
    expect(storage.getItem('sheetcraft-theme')).toBeNull();
    expect(storage.getItem('sheetcraft-zoom')).toBeNull();
  });

  it('keeps a value already saved under the new key', () => {
    const storage = memoryStorage({ 'sheetcraft-theme': 'dark', [STORAGE_KEYS.theme]: 'light' });
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem(STORAGE_KEYS.theme)).toBe('light');
    expect(storage.getItem('sheetcraft-theme')).toBeNull();
  });

  it('ignores storage that throws (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => migrateLegacyStorageKeys(broken)).not.toThrow();
  });
});
