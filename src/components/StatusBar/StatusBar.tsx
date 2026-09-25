import { memo, useDeferredValue, useMemo } from 'react';
import type { CellData, CellPosition, SelectionRange } from '../../types/grid';
import { calcAggregates } from '../../utils/statusBarCalc';
import { useTweenedNumber } from '../../hooks/useTweenedNumber';
import { useI18n } from '../../i18n/useI18n';

interface StatusBarProps {
  activeCell: CellPosition;
  selectionRange: SelectionRange | null;
  getCellData?: (col: number, row: number) => CellData | undefined;
  /** Returns all cells of the active sheet (lets large selections aggregate in O(cells)) */
  getCells?: () => Map<string, CellData>;
  version?: number;
}

function getNormalizedRange(range: SelectionRange) {
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  return { minCol, maxCol, minRow, maxRow };
}

function formatAggregate(value: number | null): string {
  if (value === null) return '--';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const StatusBar = memo(function StatusBar({
  activeCell,
  selectionRange,
  getCellData,
  getCells,
  version,
}: StatusBarProps) {
  const { t } = useI18n();
  // Aggregates are secondary UI: compute them at lower priority so drag-selecting stays responsive
  const deferredRange = useDeferredValue(selectionRange);
  const deferredVersion = useDeferredValue(version);
  const selectionInfo = useMemo(() => {
    if (!selectionRange) {
      return { cellCount: 1, rowCount: 1, colCount: 1 };
    }
    const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(selectionRange);
    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    return { cellCount: rows * cols, rowCount: rows, colCount: cols };
  }, [selectionRange]);

  const aggregates = useMemo(() => {
    if (!deferredRange || !getCellData) return null;
    const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(deferredRange);
    const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    if (cellCount <= 1) return null;
    return calcAggregates(deferredRange, getCellData, getCells?.());
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredRange, getCellData, getCells, deferredVersion]);

  // Aggregates count up/down to their new values when the selection changes
  const sum = useTweenedNumber(aggregates?.sum ?? null);
  const average = useTweenedNumber(aggregates?.average ?? null);
  const count = useTweenedNumber(aggregates ? aggregates.count : null);
  const tweening = sum.tweening || average.tweening || count.tweening;

  return (
    <div
      className="flex items-center justify-between h-7 border-t border-grid-line bg-header-bg px-4 shrink-0"
      data-statusbar
      data-active-cell={`${activeCell.col},${activeCell.row}`}
      data-version={version}
    >
      <span data-status-ready className="text-[11px] text-text-primary/50 select-none">
        Ready
      </span>
      <div className="flex items-center gap-4">
        {selectionInfo.cellCount > 1 && (
          <>
            <span className="text-[11px] text-text-primary/60 select-none">
              {t('chrome.statusBar.cellCount', { count: selectionInfo.cellCount })}
            </span>
            <span className="text-[11px] text-text-primary/60 select-none">
              {selectionInfo.rowCount}R x {selectionInfo.colCount}C
            </span>
          </>
        )}
        {aggregates ? (
          <span
            className={`text-[11px] text-text-primary/60 select-none tabular-nums${tweening ? ' statusbar-tweening' : ''}`}
            data-testid="statusbar-aggregates"
          >
            {t('chrome.statusBar.sum')} {formatAggregate(sum.value)} &nbsp;{' '}
            {t('chrome.statusBar.average')} {formatAggregate(average.value)} &nbsp;{' '}
            {t('chrome.statusBar.count')} {Math.round(count.value ?? aggregates.count)}
          </span>
        ) : (
          <span className="text-[11px] text-text-primary/40 select-none">
            {t('chrome.statusBar.sum')} -- &nbsp; {t('chrome.statusBar.average')} -- &nbsp;{' '}
            {t('chrome.statusBar.count')} --
          </span>
        )}
      </div>
    </div>
  );
});
