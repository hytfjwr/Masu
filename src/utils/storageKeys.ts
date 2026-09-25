/** Prefix of every localStorage key the app writes (was "sheetcraft-" before the rename to Tabula). */
export const STORAGE_PREFIX = 'tabula-';
const LEGACY_PREFIX = 'sheetcraft-';

export const STORAGE_KEYS = {
  theme: `${STORAGE_PREFIX}theme`,
  zoom: `${STORAGE_PREFIX}zoom`,
  devtoolsTab: `${STORAGE_PREFIX}devtools-tab`,
} as const;

/**
 * One-time move of settings saved under the old "sheetcraft-" keys to the "tabula-" keys (an
 * existing new key wins). Old keys are removed afterwards. Safe to call on every start; storage
 * errors (private mode, disabled storage) are ignored.
 */
export function migrateLegacyStorageKeys(storage: Storage = localStorage): void {
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      const legacyKey = LEGACY_PREFIX + key.slice(STORAGE_PREFIX.length);
      const legacy = storage.getItem(legacyKey);
      if (legacy === null) continue;
      if (storage.getItem(key) === null) storage.setItem(key, legacy);
      storage.removeItem(legacyKey);
    }
  } catch {
    // storage unavailable: nothing to migrate
  }
}
