import { memo, useMemo, useState } from 'react';
import type { TFunction } from '../../../i18n';
import { useI18n } from '../../../i18n/useI18n';
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

const time = (at: number | null) =>
  at === null ? '—' : new Date(at).toLocaleTimeString(undefined, { hour12: false });

function relative(t: TFunction, at: number | null, now: number): string {
  if (at === null) return t('devtools.historyTool.initialState');
  const s = Math.round((now - at) / 1000);
  if (s < 5) return t('devtools.historyTool.justNow');
  if (s < 60) return t('devtools.historyTool.secondsAgo', { count: s });
  if (s < 3600) return t('devtools.historyTool.minutesAgo', { count: Math.floor(s / 60) });
  return t('devtools.historyTool.hoursAgo', { count: Math.floor(s / 3600) });
}

/**
 * Developer tools "履歴" tab: the undo timeline (oldest → newest, current highlighted) with what each
 * step changed; the slider or a row click time-travels there in one restore (like repeated
 * undo/redo — nothing is lost, you can travel back).
 */
export const HistoryTool = memo(function HistoryTool({ host }: { host: DevToolsHost }) {
  const { t } = useI18n();
  const timeline = host.historyTimeline;
  const currentIndex = timeline.findIndex((e) => e.current);
  const now = useMemo(
    () => Date.now(),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
    return timeline
      .map((entry, i) => {
        if (i === 0) return { entry, i, summary: t('devtools.historyTool.origin') };
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
      })
      .reverse();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, host.version, t]);

  return (
    <div className="devtools-tool history-tool">
      <div className="devtools-toolbar">
        <span className="devtools-muted">
          {t('devtools.historyTool.status', {
            count: timeline.length,
            undo: currentIndex,
            redo: timeline.length - 1 - currentIndex,
          })}
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
          aria-label={t('devtools.historyTool.timeTravel')}
        />
        <div className="history-scrubber-labels">
          <span>{t('devtools.historyTool.oldest')}</span>
          <span>
            {pending !== null && pending !== currentIndex
              ? t('devtools.historyTool.moveTo', { index: pending })
              : `#${currentIndex} / ${timeline.length - 1}`}
          </span>
          <span>{t('devtools.historyTool.newest')}</span>
        </div>
      </div>
      {timeline.length < 2 ? (
        <div className="ast-viz-empty">{t('devtools.historyTool.empty')}</div>
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
                <span className="history-time" title={time(entry.time)}>
                  {entry.current ? t('devtools.historyTool.current') : relative(t, entry.time, now)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
});
