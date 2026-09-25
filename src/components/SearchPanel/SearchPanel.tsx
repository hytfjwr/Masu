import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CellPosition, SheetData } from '../../types/grid';
import { parseCellKey } from '../../utils/coordinates';
import { findMatches, replaceInText } from '../../utils/findReplace';
import type { FindMatch, FindReplaceOptions, SearchableCell } from '../../utils/findReplace';

export type { FindMatch as SearchMatch };

const DEFAULT_OPTIONS: FindReplaceOptions = {
  caseSensitive: false,
  wholeCell: false,
  useRegex: false,
  searchFormulas: false,
};

interface SearchPanelProps {
  visible: boolean;
  /** Which input should receive focus when the panel opens: 'search' (Ctrl+F) or 'replace' (Ctrl+H). */
  initialFocus?: 'search' | 'replace';
  onClose: () => void;
  sheets: SheetData[];
  activeSheetId: string;
  onNavigateToCell: (sheetId: string, pos: CellPosition) => void;
  onReplaceOne: (sheetId: string, col: number, row: number, newValue: string) => void;
  /** Replace all matching cells across (possibly several) sheets, as a single undo step. */
  onReplaceAll: (bySheet: Map<string, Array<{ col: number; row: number; value: string }>>) => void;
  /** Hidden row indices (from filter), active sheet only. */
  hiddenRows?: Set<number>;
  /** Data version to trigger re-search */
  dataVersion?: number;
}

/** Build the ordered list of searchable cells for a sheet (reading order: top-left to bottom-right). */
function collectSheetCells(sheet: SheetData, hiddenRows?: Set<number>): SearchableCell[] {
  const entries: SearchableCell[] = [];
  for (const [key, cell] of sheet.cells) {
    let col: number, row: number;
    try {
      const parsed = parseCellKey(key);
      col = parsed.col;
      row = parsed.row;
    } catch {
      continue;
    }
    if (hiddenRows?.has(row)) continue;
    entries.push({
      sheetId: sheet.id,
      col,
      row,
      cellKey: key,
      displayValue: cell.displayValue,
      rawValue: cell.rawValue,
      isFormula: cell.formula !== undefined,
    });
  }
  entries.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
  return entries;
}

export const SearchPanel = memo(function SearchPanel({
  visible,
  initialFocus = 'search',
  onClose,
  sheets,
  activeSheetId,
  onNavigateToCell,
  onReplaceOne,
  onReplaceAll,
  hiddenRows,
  dataVersion,
}: SearchPanelProps) {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [options, setOptions] = useState<FindReplaceOptions>(DEFAULT_OPTIONS);
  const [allSheets, setAllSheets] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // useEffect required: focuses the search or replace input when the panel opens
  useEffect(() => {
    if (!visible) return;
    const target = initialFocus === 'replace' ? replaceInputRef.current : searchInputRef.current;
    target?.focus();
    target?.select();
  }, [visible, initialFocus]);

  // Searching every cell on each keystroke is deferred so typing in the box stays responsive
  const deferredSearchText = useDeferredValue(searchText);
  const matches = useMemo((): FindMatch[] => {
    if (!deferredSearchText) return [];
    const targetSheets = allSheets ? sheets : sheets.filter(s => s.id === activeSheetId);
    const cells = targetSheets.flatMap(s => collectSheetCells(s, s.id === activeSheetId ? hiddenRows : undefined));
    return findMatches(cells, deferredSearchText, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, activeSheetId, allSheets, hiddenRows, deferredSearchText, options, dataVersion]);

  // Identity of the result set by content: re-renders elsewhere (e.g. moving the active cell) can rebuild
  // `matches` with identical contents, which must not reset the current position.
  const matchesSignature = useMemo(() => matches.map((m) => `${m.sheetId}:${m.cellKey}`).join('|'), [matches]);
  const querySignature = `${deferredSearchText}\u0000${JSON.stringify(options)}\u0000${allSheets}`;
  const lastQueryRef = useRef<string | null>(null);

  // useEffect required: navigate to the first match when the query changes; when only the data changes,
  // keep the current position (clamped) instead of jumping back to the first match
  useEffect(() => {
    const queryChanged = lastQueryRef.current !== querySignature;
    lastQueryRef.current = querySignature;
    if (matches.length === 0) {
      setCurrentIndex(-1);
      return;
    }
    if (queryChanged) {
      setCurrentIndex(0);
      onNavigateToCell(matches[0].sheetId, { col: matches[0].col, row: matches[0].row });
    } else {
      setCurrentIndex((prev) => Math.min(Math.max(prev, 0), matches.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesSignature, querySignature]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIdx);
    onNavigateToCell(matches[nextIdx].sheetId, { col: matches[nextIdx].col, row: matches[nextIdx].row });
  }, [matches, currentIndex, onNavigateToCell]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prevIdx);
    onNavigateToCell(matches[prevIdx].sheetId, { col: matches[prevIdx].col, row: matches[prevIdx].row });
  }, [matches, currentIndex, onNavigateToCell]);

  const findCell = useCallback((sheetId: string, key: string) => {
    return sheets.find(s => s.id === sheetId)?.cells.get(key);
  }, [sheets]);

  const currentMatch = currentIndex >= 0 && currentIndex < matches.length ? matches[currentIndex] : undefined;
  const currentIsReplaceable = !!currentMatch && !(currentMatch.isFormula && !options.searchFormulas);

  const handleReplace = useCallback(() => {
    if (!currentMatch || !currentIsReplaceable) return;
    const cell = findCell(currentMatch.sheetId, currentMatch.cellKey);
    if (!cell) return;
    const newValue = replaceInText(cell.rawValue, searchText, replaceText, options);
    onReplaceOne(currentMatch.sheetId, currentMatch.col, currentMatch.row, newValue);
  }, [currentMatch, currentIsReplaceable, findCell, searchText, replaceText, options, onReplaceOne]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0 || !searchText) return;
    const bySheet = new Map<string, Array<{ col: number; row: number; value: string }>>();
    for (const match of matches) {
      if (match.isFormula && !options.searchFormulas) continue;
      const cell = findCell(match.sheetId, match.cellKey);
      if (!cell) continue;
      const newValue = replaceInText(cell.rawValue, searchText, replaceText, options);
      if (newValue === cell.rawValue) continue;
      const entries = bySheet.get(match.sheetId) ?? [];
      entries.push({ col: match.col, row: match.row, value: newValue });
      bySheet.set(match.sheetId, entries);
    }
    if (bySheet.size > 0) onReplaceAll(bySheet);
  }, [matches, searchText, replaceText, options, findCell, onReplaceAll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev(); else goNext();
    }
  }, [onClose, goNext, goPrev]);

  const toggleOption = (key: keyof FindReplaceOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!visible) return null;

  return (
    <div
      className="absolute top-0 right-4 z-40 glass-surface rounded-b-xl p-3 min-w-[360px] animate-slide-down-panel"
      data-testid="search-panel"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col gap-2">
        {/* Search row */}
        <div className="flex items-center gap-2">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none focus:border-accent-selection"
            data-testid="search-input"
          />
          <span className="text-[10px] text-text-primary/50 min-w-[60px] text-right whitespace-nowrap">
            {matches.length > 0 ? `${currentIndex + 1} / ${matches.length}` : searchText ? '0 件' : ''}
          </span>
          <button type="button" className="h-7 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30" onClick={goPrev} disabled={matches.length === 0} title="前を検索 (Shift+Enter)">▲</button>
          <button type="button" className="h-7 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30" onClick={goNext} disabled={matches.length === 0} title="次を検索 (Enter)">▼</button>
          <button type="button" className="h-7 px-2 text-xs text-text-primary/60 hover:text-text-primary" onClick={onClose} title="閉じる (Esc)">✕</button>
        </div>

        {/* Replace row */}
        <div className="flex items-center gap-2">
          <input
            ref={replaceInputRef}
            type="text"
            placeholder="置換..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="flex-1 h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none focus:border-accent-selection"
            data-testid="replace-input"
          />
          <button type="button" className="h-7 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30" onClick={handleReplace} disabled={!currentIsReplaceable} data-testid="replace-button">置換</button>
          <button type="button" className="h-7 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30" onClick={handleReplaceAll} disabled={matches.length === 0} data-testid="replace-all-button">すべて置換</button>
        </div>

        {/* Search scope */}
        <div className="flex items-center gap-3 text-[10px] text-text-primary/70">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="search-scope" checked={!allSheets} onChange={() => setAllSheets(false)} className="w-3 h-3" />
            このシート
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="search-scope" checked={allSheets} onChange={() => setAllSheets(true)} className="w-3 h-3" />
            すべてのシート
          </label>
          <button type="button" className="ml-auto text-accent-selection hover:underline" onClick={() => setShowOptions(o => !o)}>
            {showOptions ? 'オプションを隠す ▾' : 'オプション ▸'}
          </button>
        </div>

        {/* Options */}
        {showOptions && (
          <div className="flex flex-col gap-1 text-[10px] text-text-primary/80 border-t border-grid-line pt-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={options.caseSensitive} onChange={() => toggleOption('caseSensitive')} className="w-3 h-3" />
              大文字と小文字を区別する
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={options.wholeCell} onChange={() => toggleOption('wholeCell')} className="w-3 h-3" />
              セルの内容全体が一致
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={options.useRegex} onChange={() => toggleOption('useRegex')} className="w-3 h-3" />
              正規表現を使用した検索
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={options.searchFormulas} onChange={() => toggleOption('searchFormulas')} className="w-3 h-3" />
              数式内も検索
            </label>
          </div>
        )}
      </div>
    </div>
  );
});
