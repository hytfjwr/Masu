import { memo, useState, useSyncExternalStore } from 'react';
import { recalcProfiler, type RecalcPassRecord } from '../../../engine/recalcProfiler';
import type { DevToolsHost } from '../types';
import { splitGlobalKey } from './dependencyGraph';
import { parseCellKey } from '../../../utils/coordinates';

const ms = (v: number) => (v >= 100 ? `${v.toFixed(0)} ms` : v >= 10 ? `${v.toFixed(1)} ms` : `${v.toFixed(2)} ms`);
const pct = (hits: number, misses: number) => (hits + misses === 0 ? '—' : `${Math.round((hits / (hits + misses)) * 100)}%`);

/**
 * Developer tools "プロファイラ" tab: records recalculation passes (duration, evaluations, cache hit
 * rates, slowest cells, evaluation order) while recording is on, and can paint a timing heatmap
 * over the grid. Recording costs nothing while off.
 */
export const ProfilerTool = memo(function ProfilerTool({ host }: { host: DevToolsHost }) {
  useSyncExternalStore(recalcProfiler.subscribe, recalcProfiler.getVersion);
  const records = recalcProfiler.getRecords();
  const recording = recalcProfiler.enabled;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected: RecalcPassRecord | undefined = records.find((r) => r.id === selectedId) ?? records[0];

  const label = (g: string) => {
    const parts = splitGlobalKey(g);
    if (!parts) return g;
    if (parts.sheetId === host.activeSheetId) return parts.key;
    return `${host.sheets.find((s) => s.id === parts.sheetId)?.name ?? '?'}!${parts.key}`;
  };
  const jump = (g: string) => {
    const parts = splitGlobalKey(g);
    if (!parts) return;
    const { col, row } = parseCellKey(parts.key);
    host.goToCell(parts.sheetId, col, row);
  };

  const maxDuration = Math.max(0.01, ...records.map((r) => r.durationMs));

  return (
    <div className="devtools-tool profiler-tool">
      <div className="devtools-toolbar">
        <button
          type="button"
          className="devtools-button"
          data-recording={recording || undefined}
          onClick={() => recalcProfiler.setEnabled(!recording)}
        >
          <span className="profiler-dot" />
          {recording ? '記録中' : '記録を開始'}
        </button>
        <button type="button" className="devtools-button" onClick={() => recalcProfiler.clear()} disabled={records.length === 0}>
          クリア
        </button>
        <label className="devtools-switch">
          <input type="checkbox" checked={host.heatmap} onChange={(e) => host.setHeatmap(e.target.checked)} />
          <span />
          グリッドにヒートマップ
        </label>
        <span className="devtools-muted devtools-push">{records.length} パス</span>
      </div>

      {records.length === 0 ? (
        <div className="ast-viz-empty">
          {recording ? 'セルを編集すると、再計算がここに記録されます' : '「記録を開始」を押してからセルを編集すると、再計算を計測します'}
        </div>
      ) : (
        <div className="profiler-body">
          {/* Timeline of passes (newest right) */}
          <div className="profiler-timeline" role="listbox" aria-label="再計算パス">
            {records.slice().reverse().map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={r.id === selected?.id}
                className="profiler-bar"
                data-kind={r.kind}
                title={`#${r.id} ${r.kind === 'all' ? '全体' : '差分'} ${ms(r.durationMs)} / ${r.evaluations} 評価`}
                style={{ height: `${Math.max(6, (r.durationMs / maxDuration) * 100)}%` }}
                onClick={() => setSelectedId(r.id)}
              />
            ))}
          </div>

          {selected && (
            <>
              <div className="profiler-cards">
                <div className="devtools-card"><span>所要時間</span><strong>{ms(selected.durationMs)}</strong></div>
                <div className="devtools-card"><span>評価した数式</span><strong>{selected.evaluations.toLocaleString()}</strong></div>
                <div className="devtools-card">
                  <span>1 数式あたり</span>
                  <strong>{selected.evaluations ? `${((selected.durationMs / selected.evaluations) * 1000).toFixed(1)} µs` : '—'}</strong>
                </div>
                <div className="devtools-card"><span>関数キャッシュ</span><strong>{pct(selected.stats.callHits, selected.stats.callMisses)}</strong><em>{selected.stats.callHits} ヒット</em></div>
                <div className="devtools-card"><span>範囲キャッシュ</span><strong>{pct(selected.stats.rangeHits, selected.stats.rangeMisses)}</strong><em>{selected.stats.rangeHits} ヒット</em></div>
                <div className="devtools-card"><span>種類</span><strong>{selected.kind === 'all' ? '全体' : '差分'}</strong><em>{selected.iterations} 反復</em></div>
              </div>

              <div className="profiler-columns">
                <section>
                  <h4>遅い数式</h4>
                  <ol className="profiler-slowest">
                    {selected.slowest.map((s) => (
                      <li key={s.key}>
                        <button type="button" onClick={() => jump(s.key)}>
                          <code>{label(s.key)}</code>
                          <span className="profiler-meter"><i style={{ width: `${(s.ms / (selected.slowest[0]?.ms || 1)) * 100}%` }} /></span>
                          <span className="profiler-ms">{ms(s.ms)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h4>評価順（トポロジカル順）</h4>
                  <div className="profiler-order">
                    {selected.order.slice(0, 80).map((g, i) => (
                      <button key={`${g}-${i}`} type="button" onClick={() => jump(g)} style={{ ['--i' as string]: i }}>
                        {label(g)}
                      </button>
                    ))}
                    {selected.evaluations > 80 && <span className="devtools-muted">…ほか {selected.evaluations - 80}</span>}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
