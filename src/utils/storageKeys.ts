/** Prefix of every localStorage key the app writes (was "tabula-" and, before that, "sheetcraft-"). */
export const STORAGE_PREFIX = 'masu-';
/** Pre-rename prefixes, newest first (the newer one wins when both are saved). */
const LEGACY_PREFIXES = ['tabula-', 'sheetcraft-'];

export const STORAGE_KEYS = {
  theme: `${STORAGE_PREFIX}theme`,
  zoom: `${STORAGE_PREFIX}zoom`,
  devtoolsTab: `${STORAGE_PREFIX}devtools-tab`,
  locale: `${STORAGE_PREFIX}locale`,
} as const;

/**
 * One-time move of settings saved under the old "tabula-" / "sheetcraft-" keys to the "masu-"
 * keys (an existing new key wins, then the newer old prefix). Old keys are removed afterwards. Safe to call on every start; storage
 * errors (private mode, disabled storage) are ignored.
 */
export function migrateLegacyStorageKeys(storage: Storage = localStorage): void {
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      for (const prefix of LEGACY_PREFIXES) {
        const legacyKey = prefix + key.slice(STORAGE_PREFIX.length);
        const legacy = storage.getItem(legacyKey);
        if (legacy === null) continue;
        if (storage.getItem(key) === null) storage.setItem(key, legacy);
        storage.removeItem(legacyKey);
      }
    }
  } catch {
    // storage unavailable: nothing to migrate
  }
}
