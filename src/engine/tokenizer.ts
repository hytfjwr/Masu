import { type Token, TokenType } from './types';
import { FormulaSyntaxError } from './syntaxError';
import { t } from '../i18n';

/** Known error literal codes, checked case-insensitively against a `#`-prefixed prefix of the input. */
const ERROR_CODES = [
  '#DIV/0!',
  '#VALUE!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#NULL!',
  '#ERROR!',
  '#SPILL!',
  '#CALC!',
  '#REF!',
];

/** Column-full / row-full-start / end-open range: `A:C`, `A2:C`. Column letters limited to 3 chars. */
const COL_OPEN_RANGE_RE = /^([A-Za-z]{1,3})(\d+)?:([A-Za-z]{1,3})(?![A-Za-z0-9_(!])/;
/** Row-full range: `1:3`. */
const ROW_OPEN_RANGE_RE = /^(\d+):(\d+)(?![\d.A-Za-z])/;

function matchColOpenRange(
  rest: string,
): { normalized: string; length: number; hasStartRow: boolean } | null {
  const m = COL_OPEN_RANGE_RE.exec(rest);
  if (!m) return null;
  const [full, colStart, rowStart, colEnd] = m;
  const normalized = rowStart
    ? `${colStart.toUpperCase()}${rowStart}:${colEnd.toUpperCase()}`
    : `${colStart.toUpperCase()}:${colEnd.toUpperCase()}`;
  return { normalized, length: full.length, hasStartRow: !!rowStart };
}

function matchRowOpenRange(rest: string): { normalized: string; length: number } | null {
  const m = ROW_OPEN_RANGE_RE.exec(rest);
  if (!m) return null;
  return { normalized: `${m[1]}:${m[2]}`, length: m[0].length };
}

/** Character range of a token in the tokenized text (end exclusive). */
export interface TokenSpan {
  start: number;
  end: number;
}

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  '+': TokenType.Plus,
  '-': TokenType.Minus,
  '*': TokenType.Multiply,
  '/': TokenType.Divide,
  '&': TokenType.Ampersand,
  '^': TokenType.Caret,
  '%': TokenType.Percent,
  '{': TokenType.LeftBrace,
  '}': TokenType.RightBrace,
  ';': TokenType.Semicolon,
  '(': TokenType.LeftParen,
  ')': TokenType.RightParen,
  ',': TokenType.Comma,
  ':': TokenType.Colon,
  '=': TokenType.Equal,
};

/**
 * Tokenize a formula string (without the leading '=') into a list of tokens.
 */
export function tokenize(formula: string): Token[] {
  return tokenizeWithSpans(formula).tokens;
}

/**
 * Tokenize and also report each token's character range (`spans[i]` belongs to `tokens[i]`; the
 * trailing EOF token gets an empty span at the end). Throws FormulaSyntaxError with the offending
 * range on invalid input.
 */
export function tokenizeWithSpans(formula: string): { tokens: Token[]; spans: TokenSpan[] } {
  const tokens: Token[] = [];
  const spans: TokenSpan[] = [];
  let pos = 0;
  /** Push a token that started at `start` and ends at the current position. */
  const emit = (type: TokenType, value: string, start: number) => {
    tokens.push({ type, value });
    spans.push({ start, end: pos });
  };
  /** Read the alphanumeric run of a cell reference (after `Sheet!` or `:`). */
  const readRefChars = (): string => {
    let ref = '';
    while (pos < formula.length && isAlphaNumeric(formula[pos])) {
      ref += formula[pos];
      pos++;
    }
    return ref;
  };
  /**
   * After `SheetName!` (at `pos`): a column/row-wide range, a cell, or a cell range. `start` is
   * where the whole reference (including the sheet name) began.
   */
  const readSheetQualifiedRef = (sheetName: string, start: number) => {
    const restAfterBang = formula.slice(pos);
    const colOpen = matchColOpenRange(restAfterBang);
    if (colOpen) {
      pos += colOpen.length;
      emit(TokenType.SheetOpenRangeRef, `${sheetName}!${colOpen.normalized}`, start);
      return;
    }
    const rowOpen = matchRowOpenRange(restAfterBang);
    if (rowOpen) {
      pos += rowOpen.length;
      emit(TokenType.SheetOpenRangeRef, `${sheetName}!${rowOpen.normalized}`, start);
      return;
    }

    const refStart = pos;
    const cellRef = readRefChars();
    const upperRef = cellRef.toUpperCase();
    if (!isCellRef(upperRef)) {
      throw new FormulaSyntaxError(
        cellRef
          ? t('engine.tokenizer.invalidCellRefAfterSheet', { ref: cellRef })
          : t('engine.tokenizer.missingCellRefAfterSheet'),
        refStart,
        Math.max(pos, refStart + 1),
      );
    }

    // Range: Sheet!A1:B3
    if (pos < formula.length && formula[pos] === ':') {
      pos++; // skip ':'
      const endStart = pos;
      const endRef = readRefChars();
      const upperEnd = endRef.toUpperCase();
      if (!isCellRef(upperEnd)) {
        throw new FormulaSyntaxError(
          endRef
            ? t('engine.tokenizer.invalidRangeEnd', { ref: endRef })
            : t('engine.tokenizer.missingRangeEndCellRef'),
          endStart,
          Math.max(pos, endStart + 1),
        );
      }
      emit(TokenType.SheetRangeRef, `${sheetName}!${upperRef}:${upperEnd}`, start);
    } else {
      emit(TokenType.SheetCellRef, `${sheetName}!${upperRef}`, start);
    }
  };

  while (pos < formula.length) {
    const ch = formula[pos];
    const start = pos;

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    // Quoted sheet name reference: 'Sheet Name'!A1 (with '' as an escaped literal ')
    if (ch === "'") {
      pos++; // skip opening quote
      let sheetName = '';
      let closed = false;
      while (pos < formula.length) {
        if (formula[pos] === "'") {
          if (formula[pos + 1] === "'") {
            sheetName += "'";
            pos += 2;
            continue;
          }
          closed = true;
          break;
        }
        sheetName += formula[pos];
        pos++;
      }
      if (!closed) {
        throw new FormulaSyntaxError(
          t('engine.tokenizer.unclosedSheetName'),
          start,
          formula.length,
        );
      }
      pos++; // skip closing quote

      // Must be followed by '!'
      if (pos >= formula.length || formula[pos] !== '!') {
        throw new FormulaSyntaxError(t('engine.tokenizer.missingBangAfterSheetName'), start, pos);
      }
      pos++; // skip '!'
      readSheetQualifiedRef(sheetName, start);
      continue;
    }

    // String literal (with "" as an escaped literal ")
    if (ch === '"') {
      pos++; // skip opening quote
      let str = '';
      let closed = false;
      while (pos < formula.length) {
        if (formula[pos] === '"') {
          if (formula[pos + 1] === '"') {
            str += '"';
            pos += 2;
            continue;
          }
          closed = true;
          break;
        }
        str += formula[pos];
        pos++;
      }
      if (!closed) {
        throw new FormulaSyntaxError(t('engine.tokenizer.unclosedString'), start, formula.length);
      }
      pos++; // skip closing quote
      emit(TokenType.String, str, start);
      continue;
    }

    // Error literal: #N/A, #DIV/0!, etc.
    if (ch === '#') {
      const rest = formula.slice(pos);
      const found = ERROR_CODES.find((code) => rest.slice(0, code.length).toUpperCase() === code);
      if (found) {
        pos += found.length;
        emit(TokenType.ErrorLiteral, found, start);
        continue;
      }
      let unknownEnd = pos + 1;
      while (unknownEnd < formula.length && /[A-Za-z0-9/!?]/.test(formula[unknownEnd]))
        unknownEnd++;
      throw new FormulaSyntaxError(
        t('engine.tokenizer.unknownErrorLiteral', { text: formula.slice(pos, unknownEnd) }),
        start,
        unknownEnd,
      );
    }

    // Row-full range (1:3) — must be checked before number literals
    if (isDigit(ch)) {
      const rowOpen = matchRowOpenRange(formula.slice(pos));
      if (rowOpen) {
        pos += rowOpen.length;
        emit(TokenType.RowRangeRef, rowOpen.normalized, start);
        continue;
      }
    }

    // Number literal (including decimals and exponents: 1e5, 1.5E-3, 2e+10)
    if (isDigit(ch) || (ch === '.' && pos + 1 < formula.length && isDigit(formula[pos + 1]))) {
      let num = '';
      while (pos < formula.length && (isDigit(formula[pos]) || formula[pos] === '.')) {
        num += formula[pos];
        pos++;
      }
      if (pos < formula.length && (formula[pos] === 'e' || formula[pos] === 'E')) {
        let peek = pos + 1;
        let sign = '';
        if (peek < formula.length && (formula[peek] === '+' || formula[peek] === '-')) {
          sign = formula[peek];
          peek++;
        }
        if (peek < formula.length && isDigit(formula[peek])) {
          let expDigits = '';
          while (peek < formula.length && isDigit(formula[peek])) {
            expDigits += formula[peek];
            peek++;
          }
          num += formula[pos] + sign + expDigits;
          pos = peek;
        }
      }
      emit(TokenType.Number, num, start);
      continue;
    }

    // Comparison operators (two-character forms first)
    if (ch === '>' || ch === '<') {
      const next = formula[pos + 1];
      if (next === '=') {
        pos += 2;
        emit(ch === '>' ? TokenType.GreaterEqual : TokenType.LessEqual, ch + '=', start);
      } else if (ch === '<' && next === '>') {
        pos += 2;
        emit(TokenType.NotEqual, '<>', start);
      } else {
        pos++;
        emit(ch === '>' ? TokenType.GreaterThan : TokenType.LessThan, ch, start);
      }
      continue;
    }

    // Operators and punctuation
    const single = SINGLE_CHAR_TOKENS[ch];
    if (single) {
      pos++;
      emit(single, ch, start);
      continue;
    }

    // Identifiers: cell references (A1, AA1), boolean literals (TRUE/FALSE), function names (SUM),
    // sheet references (Sheet2!A1), column/row-wide references (A:C, 1:3, A2:C), or named range
    // references (e.g. 月次売上)
    if (isIdentStart(ch)) {
      // Column-full / end-open range: A:C, A2:C — must be checked before consuming a full identifier
      const colOpen = matchColOpenRange(formula.slice(pos));
      if (colOpen) {
        pos += colOpen.length;
        emit(
          colOpen.hasStartRow ? TokenType.OpenRangeRef : TokenType.ColRangeRef,
          colOpen.normalized,
          start,
        );
        continue;
      }

      let ident = '';
      while (
        pos < formula.length &&
        (isIdentPart(formula[pos]) ||
          // Dotted names (STDEV.S, NORM.S.DIST, named ranges like Sales.Q1): '.' must be followed by an ident char
          (formula[pos] === '.' && pos + 1 < formula.length && isIdentPart(formula[pos + 1])))
      ) {
        ident += formula[pos];
        pos++;
      }

      // Sheet reference: SheetName!CellRef
      if (pos < formula.length && formula[pos] === '!') {
        pos++; // skip '!'
        readSheetQualifiedRef(ident, start);
        continue;
      }

      const upper = ident.toUpperCase();

      // Function call (followed by '(', possibly after spaces) — checked first so TRUE() / FALSE() are calls
      let peek = pos;
      while (peek < formula.length && (formula[peek] === ' ' || formula[peek] === '\t')) {
        peek++;
      }
      if (peek < formula.length && formula[peek] === '(') {
        emit(TokenType.FunctionName, upper, start);
        continue;
      }

      // Boolean literals
      if (upper === 'TRUE' || upper === 'FALSE') {
        emit(TokenType.Boolean, upper, start);
        continue;
      }

      // Cell reference: one or more letters followed by digits (e.g., A1, Z100, AA1, AZ100)
      if (isCellRef(upper)) {
        emit(TokenType.CellRef, upper, start);
        continue;
      }

      // Named range reference (any other identifier)
      emit(TokenType.NamedRef, ident, start);
      continue;
    }

    throw new FormulaSyntaxError(
      t('engine.tokenizer.invalidCharacter', { char: ch }),
      start,
      start + 1,
    );
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  spans.push({ start: formula.length, end: formula.length });
  return { tokens, spans };
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isAlphaNumeric(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

/** Unicode-aware identifier start: letters (including CJK/Japanese) or underscore */
const identStartRegex = /[\p{L}_]/u;

function isIdentStart(ch: string): boolean {
  return identStartRegex.test(ch);
}

/** Unicode-aware identifier continuation: letters, digits, or underscore */
const identPartRegex = /[\p{L}\p{N}_]/u;

function isIdentPart(ch: string): boolean {
  return identPartRegex.test(ch);
}

/** Check if a string is a valid cell reference (one or more letters + digits, e.g. A1, AA1, AZ100) */
function isCellRef(s: string): boolean {
  return /^[A-Z]+\d+$/.test(s) && parseInt(s.replace(/^[A-Z]+/, ''), 10) >= 1;
}
