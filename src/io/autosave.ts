/**
 * Autosave persistence backed by IndexedDB (no external library).
 * Failures (private browsing, unsupported browser, etc.) reject the returned
 * promise so callers can swallow them.
 */

const DB_NAME = 'tabula';
/** Database the autosave lived in before the rename to Tabula (migrated on first load). */
const LEGACY_DB_NAME = 'sheetcraft';
const STORE = 'autosave';
const KEY = 'current';

export interface AutosaveRecord {
  json: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function isAutosaveAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });
  }
  return dbPromise;
}

function readRecord(db: IDBDatabase): Promise<AutosaveRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as AutosaveRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load autosave'));
  });
}

function writeRecord(db: IDBDatabase, record: AutosaveRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save autosave'));
  });
}

/**
 * The autosave record of the pre-rename database, or null. Never creates that database: when it
 * doesn't exist the upgrade is aborted (which fails the open) and null is returned.
 */
function readLegacyRecord(): Promise<AutosaveRecord | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        resolve(null);
        return;
      }
      readRecord(db)
        .then(resolve, () => resolve(null))
        .finally(() => db.close());
    };
  });
}

export async function loadAutosave(): Promise<AutosaveRecord | null> {
  const db = await openDb();
  const record = await readRecord(db);
  if (record) return record;

  // First start after the rename: carry the old autosave over (keeping its time), then drop the old DB
  const legacy = await readLegacyRecord();
  if (legacy) {
    await writeRecord(db, legacy);
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  }
  return legacy;
}

export async function saveAutosave(json: string): Promise<number> {
  const db = await openDb();
  const savedAt = Date.now();
  await writeRecord(db, { json, savedAt });
  return savedAt;
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear autosave'));
  });
}
