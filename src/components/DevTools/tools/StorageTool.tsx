import { memo, useEffect, useState } from 'react';
import { clearAutosave, isAutosaveAvailable, loadAutosave, type AutosaveRecord } from '../../../io/autosave';
import type { DevToolsHost } from '../types';
import { STORAGE_PREFIX } from '../../../utils/storageKeys';

const bytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
const byteSize = (s: string) => new Blob([s]).size;

interface Summary {
  version?: unknown;
  sheets: Array<{ name: string; cells: number }>;
  namedRanges: number;
}

function summarize(json: string): Summary | null {
  try {
    const file = JSON.parse(json);
    const sheets = (file?.workbook?.sheets ?? []) as Array<{ name?: string; cells?: Record<string, unknown> }>;
    return {
      version: file?.version,
      sheets: sheets.map((s) => ({ name: s.name ?? '?', cells: Object.keys(s.cells ?? {}).length })),
      namedRanges: (file?.workbook?.namedRanges ?? []).length,
    };
  } catch {
    return null;
  }
}

/**
 * Developer tools "ストレージ" tab: the IndexedDB autosave record (size, time, contents), how that
 * compares with the live workbook, the browser storage quota and the app's localStorage keys.
 * The record can be downloaded or deleted.
 */
export const StorageTool = memo(function StorageTool({ host }: { host: DevToolsHost }) {
  const [record, setRecord] = useState<AutosaveRecord | null | 'loading' | 'error'>('loading');
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [liveSize, setLiveSize] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  // useEffect required: reads IndexedDB + the storage estimate (async browser APIs); re-read after saves
  useEffect(() => {
    let cancelled = false;
    if (!isAutosaveAvailable()) {
      setRecord('error');
      return;
    }
    loadAutosave().then(
      (r) => { if (!cancelled) setRecord(r); },
      () => { if (!cancelled) setRecord('error'); },
    );
    navigator.storage?.estimate?.().then((e) => { if (!cancelled) setEstimate(e); }, () => {});
    return () => {
      cancelled = true;
    };
  }, [host.autosave.lastSavedAt, reload]);

  const json = typeof record === 'object' && record ? record.json : null;
  const summary = json ? summarize(json) : null;

  const localKeys: Array<{ key: string; size: number }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) localKeys.push({ key, size: byteSize(localStorage.getItem(key) ?? '') });
    }
  } catch {
    // storage unavailable
  }

  const download = () => {
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabula-autosave-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = () => {
    if (!window.confirm('自動保存データを削除しますか？（次に編集したときに、また保存されます）')) return;
    clearAutosave().then(() => setReload((n) => n + 1), () => setRecord('error'));
  };

  return (
    <div className="devtools-tool storage-tool">
      <div className="devtools-toolbar">
        <span className="devtools-muted">IndexedDB「tabula / autosave」</span>
        <button type="button" className="devtools-button devtools-push" onClick={() => setReload((n) => n + 1)}>再読み込み</button>
        <button type="button" className="devtools-button" onClick={download} disabled={!json}>ダウンロード</button>
        <button type="button" className="devtools-button devtools-danger" onClick={remove} disabled={!json}>削除</button>
      </div>
      <div className="inspector-body">
        {record === 'loading' && <div className="devtools-muted">読み込み中…</div>}
        {record === 'error' && <div className="ast-viz-error"><span>⚠ IndexedDB を利用できません</span></div>}
        {record === null && <div className="devtools-muted">自動保存データはまだありません</div>}
        <div className="profiler-cards">
          <div className="devtools-card">
            <span>保存データ</span>
            <strong>{json ? bytes(byteSize(json)) : '—'}</strong>
            {typeof record === 'object' && record && <em>{new Date(record.savedAt).toLocaleString()}</em>}
          </div>
          <div className="devtools-card">
            <span>現在のブック</span>
            <strong>{liveSize !== null ? bytes(liveSize) : '—'}</strong>
            <button type="button" className="devtools-link" onClick={() => setLiveSize(byteSize(host.autosave.serialize()))}>計測する</button>
          </div>
          <div className="devtools-card">
            <span>自動保存の状態</span>
            <strong>{{ idle: '待機', saving: '保存中', saved: '保存済み', error: 'エラー' }[host.autosave.status]}</strong>
          </div>
          {estimate?.quota ? (
            <div className="devtools-card devtools-card-wide">
              <span>ブラウザのストレージ</span>
              <strong>{bytes(estimate.usage ?? 0)} / {bytes(estimate.quota)}</strong>
              <span className="profiler-meter"><i style={{ width: `${Math.min(100, ((estimate.usage ?? 0) / estimate.quota) * 100)}%` }} /></span>
            </div>
          ) : null}
        </div>

        {summary && (
          <>
            <h4 className="inspector-heading">中身（形式バージョン {String(summary.version ?? '?')}）</h4>
            <table className="storage-table">
              <thead><tr><th>シート</th><th>保存されたセル</th></tr></thead>
              <tbody>
                {summary.sheets.map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.cells.toLocaleString()}</td></tr>)}
              </tbody>
            </table>
            <p className="devtools-muted">名前付き範囲 {summary.namedRanges} 件</p>
          </>
        )}
        {json && (
          <details className="storage-raw">
            <summary>JSON を表示（先頭 6,000 文字）</summary>
            <pre className="json-view">{json.slice(0, 6000)}{json.length > 6000 ? '\n…' : ''}</pre>
          </details>
        )}

        <h4 className="inspector-heading">localStorage</h4>
        <table className="storage-table">
          <tbody>
            {localKeys.map((k) => <tr key={k.key}><td><code>{k.key}</code></td><td>{bytes(k.size)}</td></tr>)}
            {localKeys.length === 0 && <tr><td colSpan={2} className="devtools-muted">{STORAGE_PREFIX} で始まるキーはありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
});
