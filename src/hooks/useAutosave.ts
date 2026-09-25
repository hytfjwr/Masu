import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clearAutosave, isAutosaveAvailable, loadAutosave, saveAutosave } from '../io/autosave';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveParams {
  version: number; // useGridData の version（変更検知）
  sizeVersion: number; // useColumnRowSizes の sizeVersion（列幅変更も保存対象）
  serialize: () => string; // 現在のワークブックをネイティブ形式（.tabula.json）の JSON 文字列に
  restore: (json: string) => void; // JSON 文字列からワークブックを復元
}

interface UseAutosaveReturn {
  status: SaveStatus;
  lastSavedAt: number | null;
  restored: boolean;
}

const DEBOUNCE_MS = 1000;
const IDLE_TIMEOUT_MS = 2000;

export function useAutosave({
  version,
  sizeVersion,
  serialize,
  restore,
}: UseAutosaveParams): UseAutosaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Without IndexedDB there is nothing to restore, so start out restored
  const [restored, setRestored] = useState(() => !isAutosaveAvailable());

  const serializeRef = useRef(serialize);
  const restoreRef = useRef(restore);
  // useEffect required: keep the latest serialize/restore without widening effect dependencies;
  // layout effect so they are current before any passive effect or timer reads them
  useLayoutEffect(() => {
    serializeRef.current = serialize;
    restoreRef.current = restore;
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A save is scheduled for the next idle period (after the debounce) */
  const idlePendingRef = useRef(false);

  const performSave = useCallback(() => {
    if (!isAutosaveAvailable()) return;
    setStatus('saving');
    saveAutosave(serializeRef.current())
      .then((savedAt) => {
        setStatus('saved');
        setLastSavedAt(savedAt);
      })
      .catch((err) => {
        console.warn('Failed to save autosave data', err);
        setStatus('error');
      });
  }, []);

  // useEffect required: one-time restore from IndexedDB on mount
  useEffect(() => {
    if (!isAutosaveAvailable()) return;
    let cancelled = false;
    (async () => {
      try {
        const record = await loadAutosave();
        if (cancelled) return;
        if (record) {
          try {
            restoreRef.current(record.json);
          } catch (err) {
            console.warn('Failed to restore autosave data, clearing it', err);
            await clearAutosave().catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn('Failed to load autosave data', err);
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // useEffect required: debounced save to IndexedDB whenever workbook/size version changes.
  // After the debounce, serialization (the expensive part) waits for an idle period so it never
  // competes with typing/scrolling; IDLE_TIMEOUT_MS bounds how long it can be postponed.
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => {
      debounceTimerRef.current = null;
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      idlePendingRef.current = true;
      const run = () => {
        if (!idlePendingRef.current) return; // already flushed (tab hidden/closed)
        idlePendingRef.current = false;
        performSave();
      };
      if (ric) ric(run, { timeout: IDLE_TIMEOUT_MS });
      else run();
    }, DEBOUNCE_MS);
    debounceTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (debounceTimerRef.current === timer) debounceTimerRef.current = null;
    };
  }, [restored, version, sizeVersion, performSave]);

  const flushPending = useCallback(() => {
    const hadTimer = debounceTimerRef.current !== null;
    if (!hadTimer && !idlePendingRef.current) return;
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    idlePendingRef.current = false;
    performSave();
  }, [performSave]);

  // useEffect required: flush a pending debounced save immediately on tab close/hide
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    window.addEventListener('beforeunload', flushPending);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushPending]);

  return { status, lastSavedAt, restored };
}
