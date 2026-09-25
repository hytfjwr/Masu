/**
 * Pure find/replace logic shared by the Search & Replace panel.
 * Mirrors Google Sheets' "Find and replace" option set.
 */

export interface FindReplaceOptions {
  /** "大文字と小文字を区別する" */
  caseSensitive: boolean;
  /** "セルの内容全体が一致" */
  wholeCell: boolean;
  /** "正規表現を使用した検索" */
  useRegex: boolean;
  /** "数式内も検索": ON searches rawValue (formula text included), OFF searches the display value. */
  searchFormulas: boolean;
}

export interface SearchableCell {
  sheetId: string;
  col: number;
  row: number;
  cellKey: string;
  /** Formatted/computed text shown in the cell. */
  displayValue: string;
  /** Raw user input (formula text for formula cells, e.g. "=SUM(A1:A2)"). */
  rawValue: string;
  isFormula: boolean;
}

export interface FindMatch {
  sheetId: string;
  col: number;
  row: number;
  cellKey: string;
  /** Cell is a formula and `searchFormulas` was OFF (so it's excluded from replace targets). */
  isFormula: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the RegExp used for both matching and replacing, honoring all four options. */
function buildRegex(query: string, options: FindReplaceOptions): RegExp {
  let source = options.useRegex ? query : escapeRegExp(query);
  if (options.wholeCell) source = `^(?:${source})$`;
  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(source, flags);
}

/** Text a cell is searched against, per the "search formulas" option. */
function searchTarget(
  cell: Pick<SearchableCell, 'displayValue' | 'rawValue'>,
  options: FindReplaceOptions,
): string {
  return options.searchFormulas ? cell.rawValue : cell.displayValue;
}

/**
 * Find every cell whose search target matches `query`, in the given cell order
 * (callers are expected to pass cells pre-sorted in reading order, sheet by sheet).
 * Returns an empty array for an empty query or an invalid regex.
 */
export function findMatches(
  cells: SearchableCell[],
  query: string,
  options: FindReplaceOptions,
): FindMatch[] {
  if (query === '') return [];

  let re: RegExp;
  try {
    re = buildRegex(query, options);
  } catch {
    return [];
  }

  const results: FindMatch[] = [];
  for (const cell of cells) {
    re.lastIndex = 0;
    if (re.test(searchTarget(cell, options))) {
      results.push({
        sheetId: cell.sheetId,
        col: cell.col,
        row: cell.row,
        cellKey: cell.cellKey,
        isFormula: cell.isFormula,
      });
    }
  }
  return results;
}

/**
 * Replace every match of `query` in `text` with `replacement`. In regex mode, `$1`-style
 * back-references in `replacement` are honored (native to RegExp-based String.replace).
 * Returns `text` unchanged for an empty query or an invalid regex.
 */
export function replaceInText(
  text: string,
  query: string,
  replacement: string,
  options: FindReplaceOptions,
): string {
  if (query === '') return text;
  let re: RegExp;
  try {
    re = buildRegex(query, options);
  } catch {
    return text;
  }
  return text.replace(re, replacement);
}
