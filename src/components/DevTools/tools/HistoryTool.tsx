import { memo, useMemo, useState } from 'react';
import type { SheetData } from '../../../types/grid';
import type { DevToolsHost } from '../types';
import { describeDiff, diffWorkbooks } from './historyDiff';

/**
 * Change summaries between two *stored* undo snapshots. Stored snapshots are never mutated, so a
 * pair's summary is computed once; only transitions touching the live workbook are redone per edit.
 */
const summaryCache = new WeakMap<object, WeakMap<object, string>>();

function cachedSummary(before: { sheets: SheetData[] }, after: { sheets: SheetData[] }): string {
  let inner = summaryCache.get(before);
  if (!inner) {
    inner = new WeakMap();
    summaryCache.set(before, inner);
  }
  let summary = inner.get(after);
  if (summary === undefined) {
    summary = describeDiff(diffWorkbooks(before.sheets, after.sheets));
    inner.set(after, summary);
  }
  return summary;
}

const time = (t: number | null) => (t === null ? '—' : new Date(t).toLocaleTimeString(undefined, { hour12: false }));

function relative(t: number | null, now: number): string {
  if (t === null) return '最初の状態';
  const s = Math.round((now - t) / 1000);
  if (s < 5) return 'たった今';
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  return `${Math.floor(s / 3600)} 時間前`;
}

/**
 * Developer tools "履歴" tab: the undo timeline (oldest → newest, current highlighted) with what each
 * step changed; the slider or a row click time-travels there in one restore (like repeated
 * undo/redo — nothing is lost, you can travel back).
 */
export const HistoryTool = memo(function HistoryTool({ host }: { host: DevToolsHost }) {
  const timeline = host.historyTimeline;
  const currentIndex = timeline.findIndex((e) => e.current);
  const now = useMemo(
    () => Date.now(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeline],
  );

  // Slider position while dragging: previewed (row highlighted), jumped to on release
  const [pending, setPending] = useState<number | null>(null);
  const commitPending = () => {
    if (pending !== null && pending !== currentIndex) host.jumpToHistory(pending);
    setPending(null);
  };

  // What changed going from state i-1 to state i (newest first for display)
  const rows = useMemo(() => {
    return timeline.map((entry, i) => {
      if (i === 0) return { entry, i, summary: '履歴の起点' };
      const prevSnap = i - 1 === currentIndex ? null : host.getHistorySnapshot(i - 1);
      const curSnap = i === currentIndex ? null : host.getHistorySnapshot(i);
      let summary = '—';
      if (prevSnap && curSnap) summary = cachedSummary(prevSnap, curSnap);
      else if (prevSnap || curSnap) {
        // One side is the live workbook (mutated in place): always recompute
        const prev = prevSnap?.sheets ?? host.sheets;
        const cur = curSnap?.sheets ?? host.sheets;
        summary = describeDiff(diffWorkbooks(prev, cur));
      }
      return { entry, i, summary };
    }).reverse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, host.version]);

  return (
    <div className="devtools-tool history-tool">
      <div className="devtools-toolbar">
        <span className="devtools-muted">
          {timeline.length} 状態（Undo {currentIndex} ・ Redo {timeline.length - 1 - currentIndex}）・ 最大 100 件
        </span>
      </div>
      <div className="history-scrubber">
        <input
          type="range"
          min={0}
          max={Math.max(0, timeline.length - 1)}
          value={pending ?? currentIndex}
          disabled={timeline.length < 2}
          // Restoring a workbook is expensive: preview while dragging, jump once on release
          onChange={(e) => setPending(Number(e.target.value))}
          onPointerUp={commitPending}
          onKeyUp={commitPending}
          onBlur={commitPending}
          aria-label="履歴のタイムトラベル"
        />
        <div className="history-scrubber-labels">
          <span>最古</span>
          <span>{pending !== null && pending !== currentIndex ? `#${pending} へ移動（離すと移動）` : `#${currentIndex} / ${timeline.length - 1}`}</span>
          <span>最新</span>
        </div>
      </div>
      {timeline.length < 2 ? (
        <div className="ast-viz-empty">操作すると、ここに履歴が並びます</div>
      ) : (
        <ol className="history-list">
          {rows.map(({ entry, i, summary }) => (
            <li key={i}>
              <button
                type="button"
                className="history-row"
                data-current={entry.current || undefined}
                data-pending={(pending !== null && pending === i && !entry.current) || undefined}
                data-future={i > currentIndex || undefined}
                onClick={() => host.jumpToHistory(i)}
              >
                <span className="history-index">#{i}</span>
                <span className="history-summary">{summary}</span>
                <span className="history-time" title={time(entry.time)}>{entry.current ? '現在' : relative(entry.time, now)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
});
