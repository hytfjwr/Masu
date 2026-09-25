import { memo, useCallback, useMemo, useState } from 'react';
import { colIndexToLetter, parseCellKey } from '../../utils/coordinates';

interface ParsedRange {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

interface RemoveDuplicatesDialogProps {
  visible: boolean;
  onClose: () => void;
  defaultRangeText: string;
  getCellText: (col: number, row: number) => string;
  onConfirm: (range: ParsedRange, hasHeader: boolean, checkCols: number[]) => void;
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

// Note: relies on being conditionally mounted at the call site (e.g. `{visible && <RemoveDuplicatesDialog .../>}`)
// so that opening the dialog again always starts from a fresh default (a new mount), rather than
// resetting existing state from a `visible` prop change inside an effect.
export const RemoveDuplicatesDialog = memo(function RemoveDuplicatesDialog({
  visible,
  onClose,
  defaultRangeText,
  getCellText,
  onConfirm,
}: RemoveDuplicatesDialogProps) {
  const [rangeText, setRangeText] = useState(defaultRangeText);
  const [hasHeader, setHasHeader] = useState(true);
  const [checkedCols, setCheckedCols] = useState<Set<number>>(() => {
    const parsed = parseRangeText(defaultRangeText);
    const all = new Set<number>();
    if (parsed) for (let c = parsed.startCol; c <= parsed.endCol; c++) all.add(c);
    return all;
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

  const toggleCol = useCallback((col: number) => {
    setCheckedCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }, []);

  const selectAllCols = useCallback(() => {
    setCheckedCols(new Set(columnOptions.map((o) => o.col)));
  }, [columnOptions]);

  const deselectAllCols = useCallback(() => {
    setCheckedCols(new Set());
  }, []);

  const handleConfirm = useCallback(() => {
    const parsed = parseRangeText(rangeText);
    if (!parsed) {
      setError('範囲の形式が正しくありません（例: A1:D10）');
      return;
    }
    if (checkedCols.size === 0) {
      setError('対象列を1つ以上選択してください');
      return;
    }
    onConfirm(
      parsed,
      hasHeader,
      Array.from(checkedCols).sort((a, b) => a - b),
    );
    onClose();
  }, [rangeText, hasHeader, checkedCols, onConfirm, onClose]);

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
        className="glass-panel rounded-2xl w-[380px] flex flex-col animate-dialog-spring"
        data-testid="remove-duplicates-dialog"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-grid-line">
          <h2 className="text-sm font-semibold text-text-primary">重複を削除</h2>
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
              data-testid="remove-duplicates-range-input"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            データにヘッダー行が含まれている
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-primary/80">対象列</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-[10px] text-accent-selection hover:underline"
                  onClick={selectAllCols}
                >
                  すべて選択
                </button>
                <span className="text-[10px] text-text-primary/30">|</span>
                <button
                  type="button"
                  className="text-[10px] text-accent-selection hover:underline"
                  onClick={deselectAllCols}
                >
                  すべて解除
                </button>
              </div>
            </div>
            <div className="border border-grid-line rounded max-h-[160px] overflow-y-auto">
              {columnOptions.map((o) => (
                <label
                  key={o.col}
                  className="flex items-center gap-2 px-2 py-1 text-xs text-text-primary hover:bg-accent-selection/10 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checkedCols.has(o.col)}
                    onChange={() => toggleCol(o.col)}
                    className="w-3 h-3"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

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
            data-testid="remove-duplicates-confirm"
          >
            重複を削除
          </button>
        </div>
      </div>
    </div>
  );
});
