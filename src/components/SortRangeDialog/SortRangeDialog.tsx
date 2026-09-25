import { memo, useCallback, useMemo, useState } from 'react';
import type { SortKey } from '../../types/grid';
import { colIndexToLetter, parseCellKey } from '../../utils/coordinates';

interface ParsedRange {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

interface SortRangeDialogProps {
  visible: boolean;
  onClose: () => void;
  /** Range text (e.g. "A1:D10") the dialog is prefilled with — the current selection, by default. */
  defaultRangeText: string;
  /** Display text of a cell, used to label sort-key columns by their header when "has header row" is checked. */
  getCellText: (col: number, row: number) => string;
  onConfirm: (range: ParsedRange, keys: SortKey[]) => void;
}

function parseRangeText(text: string): ParsedRange | null {
  const parts = text.trim().toUpperCase().split(':');
  if (parts.length !== 2) return null;
  try {
    const a = parseCellKey(parts[0]);
    const b = parseCellKey(parts[1]);
    return {
      startCol: Math.min(a.col, b.col),
      endCol: Math.max(a.col, b.col),
      startRow: Math.min(a.row, b.row),
      endRow: Math.max(a.row, b.row),
    };
  } catch {
    return null;
  }
}

// Note: relies on being conditionally mounted at the call site (e.g. `{visible && <SortRangeDialog .../>}`)
// so that opening the dialog again always starts from a fresh default (a new mount), rather than
// resetting existing state from a `visible` prop change inside an effect.
export const SortRangeDialog = memo(function SortRangeDialog({
  visible,
  onClose,
  defaultRangeText,
  getCellText,
  onConfirm,
}: SortRangeDialogProps) {
  const [rangeText, setRangeText] = useState(defaultRangeText);
  const [hasHeader, setHasHeader] = useState(true);
  const [keys, setKeys] = useState<SortKey[]>(() => {
    const parsed = parseRangeText(defaultRangeText);
    return [{ col: parsed ? parsed.startCol : 0, ascending: true }];
  });
  const [error, setError] = useState('');

  const parsedRange = useMemo(() => parseRangeText(rangeText), [rangeText]);

  const columnOptions = useMemo(() => {
    if (!parsedRange) return [];
    const headerRow = parsedRange.startRow;
    const options: Array<{ col: number; label: string }> = [];
    for (let c = parsedRange.startCol; c <= parsedRange.endCol; c++) {
      const headerText = hasHeader ? getCellText(c, headerRow).trim() : '';
      options.push({ col: c, label: headerText || `列 ${colIndexToLetter(c)}` });
    }
    return options;
  }, [parsedRange, hasHeader, getCellText]);

  const handleAddKey = useCallback(() => {
    const usedCols = new Set(keys.map((k) => k.col));
    const next = columnOptions.find((o) => !usedCols.has(o.col)) ?? columnOptions[0];
    if (!next) return;
    setKeys((prev) => [...prev, { col: next.col, ascending: true }]);
  }, [keys, columnOptions]);

  const handleRemoveKey = useCallback((idx: number) => {
    setKeys((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleKeyColChange = useCallback((idx: number, col: number) => {
    setKeys((prev) => prev.map((k, i) => (i === idx ? { ...k, col } : k)));
  }, []);

  const handleKeyDirectionChange = useCallback((idx: number, ascending: boolean) => {
    setKeys((prev) => prev.map((k, i) => (i === idx ? { ...k, ascending } : k)));
  }, []);

  const handleConfirm = useCallback(() => {
    const parsed = parseRangeText(rangeText);
    if (!parsed) {
      setError('範囲の形式が正しくありません（例: A1:D10）');
      return;
    }
    const sortStartRow = hasHeader ? parsed.startRow + 1 : parsed.startRow;
    if (sortStartRow > parsed.endRow) {
      setError('並べ替え対象の行がありません');
      return;
    }
    onConfirm({ ...parsed, startRow: sortStartRow }, keys);
    onClose();
  }, [rangeText, hasHeader, keys, onConfirm, onClose]);

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="glass-panel rounded-2xl w-[420px] flex flex-col animate-dialog-spring"
        data-testid="sort-range-dialog"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-grid-line">
          <h2 className="text-sm font-semibold text-text-primary">範囲を並べ替え</h2>
          <button
            onClick={onClose}
            className="text-text-primary hover:text-error text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-text-primary/80 block mb-0.5">対象範囲</label>
            <input
              type="text"
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
              className="w-full h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
              placeholder="例: A1:D10"
              data-testid="sort-range-input"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="w-3.5 h-3.5"
              data-testid="sort-range-has-header"
            />
            データにヘッダー行が含まれている
          </label>

          <div className="space-y-2">
            {keys.map((key, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-text-primary/60 w-16 shrink-0">
                  {idx === 0 ? '並べ替え' : 'その他'}
                </span>
                <select
                  value={key.col}
                  onChange={(e) => handleKeyColChange(idx, Number(e.target.value))}
                  className="flex-1 h-7 px-1.5 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                  data-testid={`sort-key-col-${idx}`}
                >
                  {columnOptions.map((o) => (
                    <option key={o.col} value={o.col}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={key.ascending ? 'asc' : 'desc'}
                  onChange={(e) => handleKeyDirectionChange(idx, e.target.value === 'asc')}
                  className="h-7 px-1.5 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                >
                  <option value="asc">A→Z</option>
                  <option value="desc">Z→A</option>
                </select>
                {keys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveKey(idx)}
                    className="text-text-primary/50 hover:text-error text-sm leading-none px-1"
                    title="この基準を削除"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddKey}
            disabled={keys.length >= columnOptions.length}
            className="text-xs text-accent-selection hover:underline disabled:opacity-30 disabled:no-underline"
          >
            + 別の並べ替え基準の列を追加
          </button>

          {error && <div className="text-xs text-error">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-grid-line">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs bg-ui-bg border border-grid-line rounded hover:bg-header-bg"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1 text-xs bg-accent-selection text-white border border-accent-selection rounded hover:opacity-90"
            data-testid="sort-range-confirm"
          >
            並べ替え
          </button>
        </div>
      </div>
    </div>
  );
});
