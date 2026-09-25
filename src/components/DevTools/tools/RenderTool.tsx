import { memo, useEffect, useState } from 'react';
import { renderStats } from '../../../devtools/renderStats';
import { useI18n } from '../../../i18n/useI18n';

const HISTORY = 60;

interface Sample {
  fps: number;
  commits: number;
}

interface DomInfo {
  cells: number;
  rows: [number, number] | null;
  cols: [number, number] | null;
}

function readDom(): DomInfo {
  const cells = document.querySelectorAll<HTMLElement>('[role="gridcell"]');
  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;
  for (const el of cells) {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return {
    cells: cells.length,
    rows: maxR >= 0 ? [minR, maxR] : null,
    cols: maxC >= 0 ? [minC, maxC] : null,
  };
}

/** Tiny area chart of the last HISTORY samples. */
function Spark({ values, max, className }: { values: number[]; max: number; className: string }) {
  const w = 240;
  const h = 44;
  const pts = values.map(
    (v, i) => `${(i / (HISTORY - 1)) * w},${h - (Math.min(v, max) / max) * (h - 4) - 2}`,
  );
  const offset = HISTORY - values.length;
  const shifted = pts.map((p, i) => {
    const [, y] = p.split(',');
    return `${((i + offset) / (HISTORY - 1)) * w},${y}`;
  });
  return (
    <svg
      className={`render-spark ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      {shifted.length > 1 && (
        <>
          <polygon points={`${shifted[0].split(',')[0]},${h} ${shifted.join(' ')} ${w},${h}`} />
          <polyline points={shifted.join(' ')} />
        </>
      )}
    </svg>
  );
}

/**
 * Developer tools "描画" tab: frame rate, Cell re-render rate, how many cells the virtualized grid
 * has mounted (and which window of rows/columns), long main-thread tasks, and an optional flash on
 * every re-rendered cell.
 */
export const RenderTool = memo(function RenderTool() {
  const { t } = useI18n();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [dom, setDom] = useState<DomInfo>({ cells: 0, rows: null, cols: null });
  const [longTasks, setLongTasks] = useState<{ count: number; last: number | null }>({
    count: 0,
    last: null,
  });
  const [flash, setFlash] = useState(renderStats.flash);

  // useEffect required: rAF frame counter + 1 s sampling timer (FPS, commits/s, mounted cells)
  useEffect(() => {
    let frames = 0;
    let raf = requestAnimationFrame(function tick() {
      frames++;
      raf = requestAnimationFrame(tick);
    });
    let lastCommits = renderStats.cellCommits;
    const timer = setInterval(() => {
      const commits = renderStats.cellCommits - lastCommits;
      lastCommits = renderStats.cellCommits;
      setSamples((prev) => [...prev, { fps: frames, commits }].slice(-HISTORY));
      frames = 0;
      setDom(readDom());
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  // useEffect required: PerformanceObserver for long tasks (Chromium only; silently absent elsewhere)
  useEffect(() => {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes?.includes('longtask')
    )
      return;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      setLongTasks((prev) => ({
        count: prev.count + entries.length,
        last: entries[entries.length - 1]?.duration ?? prev.last,
      }));
    });
    observer.observe({ type: 'longtask' });
    return () => observer.disconnect();
  }, []);

  // useEffect required: the flash switch lives in module state read by Cell; turn it off on leave
  useEffect(() => {
    renderStats.flash = flash;
  }, [flash]);
  useEffect(
    () => () => {
      renderStats.flash = false;
    },
    [],
  );

  const latest = samples[samples.length - 1];
  const fpsValues = samples.map((s) => s.fps);
  const commitValues = samples.map((s) => s.commits);
  const maxCommits = Math.max(20, ...commitValues);

  return (
    <div className="devtools-tool render-tool">
      <div className="devtools-toolbar">
        <label className="devtools-switch">
          <input type="checkbox" checked={flash} onChange={(e) => setFlash(e.target.checked)} />
          <span />
          {t('devtools.renderTool.flashRerenders')}
        </label>
        <span className="devtools-muted devtools-push">
          {t('devtools.renderTool.updateInterval')}
        </span>
      </div>
      <div className="render-body">
        <div className="render-panel">
          <div className="render-panel-head">
            <span>FPS</span>
            <strong data-warn={(latest && latest.fps < 45) || undefined}>
              {latest?.fps ?? '—'}
            </strong>
          </div>
          <Spark values={fpsValues} max={Math.max(60, ...fpsValues)} className="render-spark-fps" />
        </div>
        <div className="render-panel">
          <div className="render-panel-head">
            <span>{t('devtools.renderTool.cellRerendersPerSec')}</span>
            <strong>{latest?.commits ?? '—'}</strong>
          </div>
          <Spark values={commitValues} max={maxCommits} className="render-spark-commits" />
        </div>
        <div className="profiler-cards">
          <div className="devtools-card">
            <span>{t('devtools.renderTool.mountedCells')}</span>
            <strong>{dom.cells.toLocaleString()}</strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.renderTool.renderedRows')}</span>
            <strong>{dom.rows ? `${dom.rows[0] + 1}–${dom.rows[1] + 1}` : '—'}</strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.renderTool.renderedCols')}</span>
            <strong>{dom.cols ? `${dom.cols[0] + 1}–${dom.cols[1] + 1}` : '—'}</strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.renderTool.totalRerenders')}</span>
            <strong>{renderStats.cellCommits.toLocaleString()}</strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.renderTool.longTasks')}</span>
            <strong data-warn={longTasks.count > 0 || undefined}>{longTasks.count}</strong>
            {longTasks.last !== null && (
              <em>{t('devtools.renderTool.longTaskLast', { ms: Math.round(longTasks.last) })}</em>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
