import { memo, useMemo, useState } from 'react';
import type { TFunction } from '../../../i18n';
import { useI18n } from '../../../i18n/useI18n';
import type { CellData } from '../../../types/grid';
import { cellKey, parseCellKey } from '../../../utils/coordinates';
import type { DevToolsHost } from '../types';
import { splitGlobalKey } from './dependencyGraph';

/** Human name of a CellData.computed value's type. */
function typeOf(cell: CellData | undefined, t: TFunction): string {
  if (!cell) return t('devtools.inspectorTool.type.empty');
  if (cell.error) return t('devtools.inspectorTool.type.error');
  const v = cell.computed;
  if (v === undefined || v === null || v === '')
    return cell.rawValue === ''
      ? t('devtools.inspectorTool.type.empty')
      : t('devtools.inspectorTool.type.text');
  if (typeof v === 'number') return t('devtools.inspectorTool.type.number');
  if (typeof v === 'boolean') return t('devtools.inspectorTool.type.boolean');
  if (typeof v === 'string') return t('devtools.inspectorTool.type.text');
  return typeof v;
}

/** JSON with keys / strings / numbers / literals wrapped for coloring. */
function HighlightedJson({ value }: { value: unknown }) {
  const text =
    JSON.stringify(value, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2) ??
    'undefined';
  const parts: React.ReactNode[] = [];
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|\b(true|false|null)\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] && m[2])
      parts.push(
        <span key={i++} className="json-key">
          {m[1]}
        </span>,
        m[2],
      );
    else if (m[1])
      parts.push(
        <span key={i++} className="json-string">
          {m[1]}
        </span>,
      );
    else if (m[3])
      parts.push(
        <span key={i++} className="json-number">
          {m[3]}
        </span>,
      );
    else
      parts.push(
        <span key={i++} className="json-literal">
          {m[4]}
        </span>,
      );
    last = re.lastIndex;
  }
  parts.push(text.slice(last));
  return <pre className="json-view">{parts}</pre>;
}

/**
 * Developer tools "セル" tab: the selected cell's raw CellData as the engine stores it, its value
 * type, spill / syntax-error details, and its direct precedents and dependents.
 */
export const InspectorTool = memo(function InspectorTool({ host }: { host: DevToolsHost }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const key = cellKey(host.activeCell.col, host.activeCell.row);
  const gKey = `${host.activeSheetId}:${key}`;
  const cell = host.getCell(host.activeSheetId, key);
  const deps = useMemo(
    () => host.getDependencyInfo(host.activeSheetId, key),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [host.activeSheetId, key, host.version],
  );

  const label = (g: string) => {
    const parts = splitGlobalKey(g);
    if (!parts) return g;
    return parts.sheetId === host.activeSheetId
      ? parts.key
      : `${host.sheets.find((s) => s.id === parts.sheetId)?.name ?? '?'}!${parts.key}`;
  };
  const goTo = (g: string) => {
    const parts = splitGlobalKey(g);
    if (!parts) return;
    const { col, row } = parseCellKey(parts.key);
    host.goToCell(parts.sheetId, col, row);
  };

  const copy = () => {
    navigator.clipboard?.writeText(JSON.stringify(cell ?? null, null, 2)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };

  return (
    <div className="devtools-tool inspector-tool">
      <div className="devtools-toolbar">
        <span className="ast-viz-origin">{key}</span>
        <code className="devtools-muted">{gKey}</code>
        <button
          type="button"
          className="devtools-button devtools-push"
          onClick={copy}
          disabled={!cell}
        >
          {copied ? t('devtools.inspectorTool.copied') : t('devtools.inspectorTool.copyJson')}
        </button>
      </div>
      <div className="inspector-body">
        <div className="profiler-cards">
          <div className="devtools-card">
            <span>{t('devtools.inspectorTool.type')}</span>
            <strong>{typeOf(cell, t)}</strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.inspectorTool.formula')}</span>
            <strong>
              {cell?.formula !== undefined
                ? t('devtools.inspectorTool.yes')
                : t('devtools.inspectorTool.no')}
            </strong>
          </div>
          <div className="devtools-card">
            <span>{t('devtools.inspectorTool.spill')}</span>
            <strong>
              {cell?.spillExtent
                ? `${cell.spillExtent.rows}×${cell.spillExtent.cols}`
                : cell?.spillSource
                  ? t('devtools.inspectorTool.spillReceiver')
                  : t('devtools.inspectorTool.spillNone')}
            </strong>
            {cell?.spillSource && (
              <em>{t('devtools.inspectorTool.spillSource', { source: cell.spillSource })}</em>
            )}
          </div>
          <div className="devtools-card">
            <span>
              {t('devtools.inspectorTool.precedents')} / {t('devtools.inspectorTool.dependents')}
            </span>
            <strong>
              {deps.precedents.length + deps.rangePrecedents.length} / {deps.dependents.length}
            </strong>
          </div>
        </div>
        {cell?.parseError && (
          <div className="ast-viz-error">
            <span>⚠ {cell.parseError.message}</span>
            <span className="ast-viz-error-where">
              {cell.parseError.start}–{cell.parseError.end}
            </span>
          </div>
        )}
        {(deps.precedents.length > 0 ||
          deps.rangePrecedents.length > 0 ||
          deps.dependents.length > 0) && (
          <div className="inspector-links">
            {deps.precedents.length + deps.rangePrecedents.length > 0 && (
              <div>
                <h4>{t('devtools.inspectorTool.precedents')}</h4>
                {deps.precedents.map((g) => (
                  <button key={g} type="button" className="devtools-chip" onClick={() => goTo(g)}>
                    {label(g)}
                  </button>
                ))}
                {deps.rangePrecedents.map((r, i) => (
                  <span key={i} className="devtools-chip" data-static>
                    {cellKey(r.startCol, r.startRow)}:
                    {r.endCol !== null && r.endRow !== null ? cellKey(r.endCol, r.endRow) : '…'}
                  </span>
                ))}
              </div>
            )}
            {deps.dependents.length > 0 && (
              <div>
                <h4>{t('devtools.inspectorTool.dependents')}</h4>
                {deps.dependents.slice(0, 40).map((g) => (
                  <button key={g} type="button" className="devtools-chip" onClick={() => goTo(g)}>
                    {label(g)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <h4 className="inspector-heading">CellData</h4>
        {cell ? (
          <HighlightedJson value={cell} />
        ) : (
          <div className="devtools-muted inspector-empty">
            {t('devtools.inspectorTool.cellDataEmpty')}
          </div>
        )}
      </div>
    </div>
  );
});
