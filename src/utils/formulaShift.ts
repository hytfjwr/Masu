import { colIndexToLetter, colLetterToIndex } from './coordinates';

/**
 * A single cell/range/col/row reference found while lexically scanning a formula.
 * `start`/`end` cover the full matched span, including any sheet-name prefix.
 */
export interface RefToken {
  start: number;
  end: number;
  /** e.g. 'Sheet2!' or "'My Sheet'!", empty string when there is no sheet qualifier */
  sheetPrefix: string;
  kind: 'cell' | 'range' | 'col' | 'row' | 'openRange';
  // cell: A1 / range: A1:B2 / col: A:C / row: 1:3 / openRange: A2:C (to the last row) (all 0-indexed)
  c1?: { col: number; colAbs: boolean };
  r1?: { row: number; rowAbs: boolean };
  c2?: { col: number; colAbs: boolean };
  r2?: { row: number; rowAbs: boolean };
}

/** Characters that make up a single identifier/reference "word" for boundary checks. */
const WORD_CHAR_RE = /[A-Za-z0-9_.]/;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR_RE.test(ch);
}

// Anchored (^) patterns tried in order at a given scan position.
const CELL_OR_RANGE_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?/;
const COL_RANGE_RE = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})/;
const ROW_RANGE_RE = /^(\$?)(\d+):(\$?)(\d+)/;
// Tail of an open-ended range after a cell ref: A2 + ':C' (column-only end, no row)
const OPEN_RANGE_TAIL_RE = /^:(\$?)([A-Za-z]{1,3})/;

const QUOTED_SHEET_RE = /^'(?:[^']|'')*'!/;
const UNQUOTED_SHEET_RE = /^[A-Za-z_\p{L}][\w.\p{L}]*!/u;

/** True if, skipping whitespace, `formula` has '(' at/after `pos` (i.e. this is a function call, not a reference). */
function isFollowedByParen(formula: string, pos: number): boolean {
  let j = pos;
  while (j < formula.length && /\s/.test(formula[j])) j++;
  return formula[j] === '(';
}

/**
 * Try to match a reference (cell/range/col/row) at `refPos`. If found, pushes a RefToken
 * spanning from `tokenStart` (start of any sheet prefix) to the end of the match.
 * Returns the length of the matched reference text (0 if nothing matched at refPos).
 * A match that turns out to be a function name (identifier directly followed by '(')
 * is "consumed" (its length is returned) but no token is pushed.
 */
function matchRefAt(
  formula: string,
  refPos: number,
  tokenStart: number,
  sheetPrefix: string,
  tokens: RefToken[],
): number {
  const rest = formula.slice(refPos);

  let m = CELL_OR_RANGE_RE.exec(rest);
  if (m) {
    const matchLen = m[0].length;
    if (isWordChar(rest[matchLen])) return 0;
    if (isFollowedByParen(formula, refPos + matchLen)) return matchLen;

    const c1 = { col: colLetterToIndex(m[2].toUpperCase()), colAbs: m[1] === '$' };
    const r1 = { row: parseInt(m[4], 10) - 1, rowAbs: m[3] === '$' };

    if (m[5] !== undefined) {
      const c2 = { col: colLetterToIndex(m[6].toUpperCase()), colAbs: m[5] === '$' };
      const r2 = { row: parseInt(m[8], 10) - 1, rowAbs: m[7] === '$' };
      tokens.push({ start: tokenStart, end: refPos + matchLen, sheetPrefix, kind: 'range', c1, r1, c2, r2 });
    } else {
      const tail = OPEN_RANGE_TAIL_RE.exec(rest.slice(matchLen));
      if (tail && !isWordChar(rest[matchLen + tail[0].length])) {
        const c2 = { col: colLetterToIndex(tail[2].toUpperCase()), colAbs: tail[1] === '$' };
        const fullLen = matchLen + tail[0].length;
        tokens.push({ start: tokenStart, end: refPos + fullLen, sheetPrefix, kind: 'openRange', c1, r1, c2 });
        return fullLen;
      }
      tokens.push({ start: tokenStart, end: refPos + matchLen, sheetPrefix, kind: 'cell', c1, r1 });
    }
    return matchLen;
  }

  m = COL_RANGE_RE.exec(rest);
  if (m) {
    const matchLen = m[0].length;
    if (isWordChar(rest[matchLen])) return 0;
    if (isFollowedByParen(formula, refPos + matchLen)) return matchLen;

    const c1 = { col: colLetterToIndex(m[2].toUpperCase()), colAbs: m[1] === '$' };
    const c2 = { col: colLetterToIndex(m[4].toUpperCase()), colAbs: m[3] === '$' };
    tokens.push({ start: tokenStart, end: refPos + matchLen, sheetPrefix, kind: 'col', c1, c2 });
    return matchLen;
  }

  m = ROW_RANGE_RE.exec(rest);
  if (m) {
    const matchLen = m[0].length;
    if (isWordChar(rest[matchLen])) return 0;
    if (isFollowedByParen(formula, refPos + matchLen)) return matchLen;

    const r1 = { row: parseInt(m[2], 10) - 1, rowAbs: m[1] === '$' };
    const r2 = { row: parseInt(m[4], 10) - 1, rowAbs: m[3] === '$' };
    tokens.push({ start: tokenStart, end: refPos + matchLen, sheetPrefix, kind: 'row', r1, r2 });
    return matchLen;
  }

  return 0;
}

/**
 * Lexically scan a formula string (without leading '=') for cell/range/col/row references.
 * Skips over "..." string literals and correctly attributes 'Sheet'! / Sheet! prefixes.
 * Identifiers immediately followed by '(' (optionally through whitespace) are treated as
 * function names, not references (e.g. `LOG10(`, `ATAN2(`).
 */
export function scanRefs(formula: string): RefToken[] {
  const tokens: RefToken[] = [];
  const len = formula.length;
  let i = 0;

  while (i < len) {
    const ch = formula[i];

    // Skip over "..." string literals ("" is an escaped quote)
    if (ch === '"') {
      i++;
      while (i < len) {
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Quoted sheet-name prefix: 'My Sheet'!
    if (ch === "'") {
      const m = QUOTED_SHEET_RE.exec(formula.slice(i));
      if (m) {
        const sheetPrefix = m[0];
        const afterSheet = i + sheetPrefix.length;
        const consumed = matchRefAt(formula, afterSheet, i, sheetPrefix, tokens);
        i = afterSheet + consumed;
        continue;
      }
      i++;
      continue;
    }

    if (!isWordChar(formula[i - 1])) {
      // Unquoted sheet-name prefix: Sheet2!
      const sm = UNQUOTED_SHEET_RE.exec(formula.slice(i));
      if (sm) {
        const sheetPrefix = sm[0];
        const afterSheet = i + sheetPrefix.length;
        const consumed = matchRefAt(formula, afterSheet, i, sheetPrefix, tokens);
        i = afterSheet + consumed;
        continue;
      }

      // Bare reference (no sheet prefix)
      const consumed = matchRefAt(formula, i, i, '', tokens);
      if (consumed > 0) {
        i += consumed;
        continue;
      }
    }

    i++;
  }

  return tokens;
}

/** Render a single RefToken shifted by colOffset/rowOffset, or '#REF!' if it goes out of bounds. */
function renderShiftedToken(token: RefToken, colOffset: number, rowOffset: number): string {
  switch (token.kind) {
    case 'cell': {
      const c1 = token.c1!;
      const r1 = token.r1!;
      const col = c1.colAbs ? c1.col : c1.col + colOffset;
      const row = r1.rowAbs ? r1.row : r1.row + rowOffset;
      if (col < 0 || row < 0) return '#REF!';
      return `${token.sheetPrefix}${c1.colAbs ? '$' : ''}${colIndexToLetter(col)}${r1.rowAbs ? '$' : ''}${row + 1}`;
    }
    case 'range': {
      const c1 = token.c1!;
      const r1 = token.r1!;
      const c2 = token.c2!;
      const r2 = token.r2!;
      const col1 = c1.colAbs ? c1.col : c1.col + colOffset;
      const row1 = r1.rowAbs ? r1.row : r1.row + rowOffset;
      const col2 = c2.colAbs ? c2.col : c2.col + colOffset;
      const row2 = r2.rowAbs ? r2.row : r2.row + rowOffset;
      if (col1 < 0 || row1 < 0 || col2 < 0 || row2 < 0) return '#REF!';
      const part1 = `${c1.colAbs ? '$' : ''}${colIndexToLetter(col1)}${r1.rowAbs ? '$' : ''}${row1 + 1}`;
      const part2 = `${c2.colAbs ? '$' : ''}${colIndexToLetter(col2)}${r2.rowAbs ? '$' : ''}${row2 + 1}`;
      return `${token.sheetPrefix}${part1}:${part2}`;
    }
    case 'col': {
      const c1 = token.c1!;
      const c2 = token.c2!;
      const col1 = c1.colAbs ? c1.col : c1.col + colOffset;
      const col2 = c2.colAbs ? c2.col : c2.col + colOffset;
      if (col1 < 0 || col2 < 0) return '#REF!';
      const part1 = `${c1.colAbs ? '$' : ''}${colIndexToLetter(col1)}`;
      const part2 = `${c2.colAbs ? '$' : ''}${colIndexToLetter(col2)}`;
      return `${token.sheetPrefix}${part1}:${part2}`;
    }
    case 'openRange': {
      const c1 = token.c1!;
      const r1 = token.r1!;
      const c2 = token.c2!;
      const col1 = c1.colAbs ? c1.col : c1.col + colOffset;
      const row1 = r1.rowAbs ? r1.row : r1.row + rowOffset;
      const col2 = c2.colAbs ? c2.col : c2.col + colOffset;
      if (col1 < 0 || row1 < 0 || col2 < 0) return '#REF!';
      return `${token.sheetPrefix}${c1.colAbs ? '$' : ''}${colIndexToLetter(col1)}${r1.rowAbs ? '$' : ''}${row1 + 1}:${c2.colAbs ? '$' : ''}${colIndexToLetter(col2)}`;
    }
    case 'row': {
      const r1 = token.r1!;
      const r2 = token.r2!;
      const row1 = r1.rowAbs ? r1.row : r1.row + rowOffset;
      const row2 = r2.rowAbs ? r2.row : r2.row + rowOffset;
      if (row1 < 0 || row2 < 0) return '#REF!';
      const part1 = `${r1.rowAbs ? '$' : ''}${row1 + 1}`;
      const part2 = `${r2.rowAbs ? '$' : ''}${row2 + 1}`;
      return `${token.sheetPrefix}${part1}:${part2}`;
    }
  }
}

/**
 * Shift all cell/range/col/row references in a formula string by a fixed column/row offset.
 * Used for fill-handle drag and cell-move/paste reference adjustment.
 * Respects `$` absolute markers and sheet-name prefixes; string literals are left untouched.
 * References that would fall outside the sheet (col < 0 or row < 0) become `#REF!`.
 */
export function shiftFormula(formula: string, colOffset: number, rowOffset: number): string {
  const tokens = scanRefs(formula);
  if (tokens.length === 0) return formula;

  let result = '';
  let lastEnd = 0;
  for (const token of tokens) {
    result += formula.slice(lastEnd, token.start);
    result += renderShiftedToken(token, colOffset, rowOffset);
    lastEnd = token.end;
  }
  result += formula.slice(lastEnd);
  return result;
}

// ============================================================
// Structural changes (row/column insert & delete)
// ============================================================

export interface StructureChange {
  type: 'column' | 'row';
  /** 0-indexed column/row being inserted (before) or deleted */
  index: number;
  operation: 'insert' | 'delete';
}

export interface StructureChangeOptions {
  /** Unqualified refs (A1) point at the changed sheet, i.e. the formula lives on that sheet (default true) */
  appliesToUnqualified?: boolean;
  /** Name of the changed sheet: qualified refs (Sheet1!A1 / 'My Sheet'!A1) naming it are updated too */
  targetSheetName?: string;
}

function prefixSheetName(prefix: string): string {
  const name = prefix.slice(0, -1); // drop '!'
  if (name.startsWith("'") && name.endsWith("'")) return name.slice(1, -1).replace(/''/g, "'");
  return name;
}

/**
 * Shift one axis span [a, b] (inclusive) for an insert/delete at `index`, Excel-style:
 * insert at/before the span moves it, inside it grows it; deleting inside shrinks it,
 * deleting the only row/column makes it null (#REF!). `b` may be null (open-ended).
 */
function shiftSpan(a: number, b: number | null, index: number, op: 'insert' | 'delete'): [number, number | null] | null {
  if (op === 'insert') {
    const na = a >= index ? a + 1 : a;
    const nb = b === null ? null : b >= index ? b + 1 : b;
    return [na, nb];
  }
  const end = b ?? Number.MAX_SAFE_INTEGER;
  if (index < a) return [a - 1, b === null ? null : b - 1];
  if (index > end) return [a, b];
  // index within [a, end]
  if (b !== null && a === b) return null;
  return [a, b === null ? null : b - 1];
}

/**
 * Update references in a formula (without leading '=') for a row/column insert or delete.
 * Unlike shiftFormula, absolute ($) references move too (like Excel), ranges grow/shrink,
 * and only references pointing at the changed sheet are touched.
 */
export function updateRefsForStructureChange(
  formula: string,
  change: StructureChange,
  options: StructureChangeOptions = {},
): { formula: string; hasRefError: boolean } {
  const { appliesToUnqualified = true, targetSheetName } = options;
  const tokens = scanRefs(formula);
  if (tokens.length === 0) return { formula, hasRefError: false };

  let hasRefError = false;
  let result = '';
  let lastEnd = 0;
  for (const token of tokens) {
    result += formula.slice(lastEnd, token.start);
    lastEnd = token.end;
    const original = formula.slice(token.start, token.end);

    const applies = token.sheetPrefix === ''
      ? appliesToUnqualified
      : targetSheetName !== undefined && prefixSheetName(token.sheetPrefix).toLowerCase() === targetSheetName.toLowerCase();
    if (!applies) {
      result += original;
      continue;
    }

    const next: RefToken = { ...token };
    let refError = false;
    if (change.type === 'column') {
      if (token.kind !== 'row') {
        const c1 = token.c1!;
        const c2 = token.c2 ?? token.c1!;
        const span = shiftSpan(c1.col, c2.col, change.index, change.operation);
        if (!span) refError = true;
        else {
          next.c1 = { ...c1, col: span[0] };
          if (token.c2) next.c2 = { ...token.c2, col: span[1]! };
        }
      }
    } else if (token.kind !== 'col') {
      const r1 = token.r1!;
      const openEnd = token.kind === 'openRange';
      const r2 = token.r2 ?? (openEnd ? null : token.r1!);
      const span = shiftSpan(r1.row, r2 === null ? null : r2.row, change.index, change.operation);
      if (!span) refError = true;
      else {
        next.r1 = { ...r1, row: span[0] };
        if (token.r2) next.r2 = { ...token.r2, row: span[1]! };
      }
    }

    if (refError) {
      hasRefError = true;
      result += '#REF!';
    } else {
      result += renderShiftedToken(next, 0, 0);
    }
  }
  result += formula.slice(lastEnd);
  return { formula: result, hasRefError };
}
