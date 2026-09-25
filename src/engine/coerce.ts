/**
 * Type coercion helpers shared by the evaluator and built-in functions.
 * Mirrors Excel/Google Sheets coercion semantics.
 */
import type { FormulaError, FormulaResult, FormulaValue } from './types';
import { isFormulaError, makeError } from './types';

/**
 * Coerce a value to a number.
 * number -> itself, boolean -> 1/0, '' -> 0, error -> itself.
 * Strings are trimmed and parsed with Number(); if that fails, group separators
 * (',') are stripped and parsing is retried before giving up with #VALUE!.
 */
export function toNumber(v: FormulaResult): number | FormulaError {
  if (isFormulaError(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;

  const trimmed = v.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!isNaN(n)) return n;
  const n2 = Number(trimmed.replace(/,/g, ''));
  if (!isNaN(n2)) return n2;
  return makeError('#VALUE!');
}

/**
 * Coerce a value to a display string.
 * number -> formatNumberForText, boolean -> 'TRUE'/'FALSE', error -> itself.
 */
export function toText(v: FormulaResult): string | FormulaError {
  if (isFormulaError(v)) return v;
  if (typeof v === 'number') return formatNumberForText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Format a number for text concatenation: rounds to 15 significant digits to avoid
 * floating point artifacts (e.g. 0.1+0.2 -> '0.3'), while integers are stringified directly.
 */
export function formatNumberForText(n: number): string {
  if (!isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  const rounded = Number(n.toPrecision(15));
  return String(rounded);
}

/**
 * Coerce a value to a boolean.
 * boolean -> itself, number -> !== 0, '' -> false, 'TRUE'/'FALSE' (case-insensitive) -> boolean,
 * any other string -> #VALUE!, error -> itself.
 */
export function toBoolean(v: FormulaResult): boolean | FormulaError {
  if (isFormulaError(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === '') return false;
  const upper = v.toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return makeError('#VALUE!');
}

/**
 * Compare two values using Excel's ordering: number < string < boolean.
 * An empty string ('') is treated as 0 when compared against a number, and as
 * FALSE when compared against a boolean. String comparisons are case-insensitive
 * and do not use locale-aware collation.
 * Errors (not part of Excel's ordering) sort after all other values.
 */
export function compareValues(a: FormulaResult, b: FormulaResult): number {
  const aIsErr = isFormulaError(a);
  const bIsErr = isFormulaError(b);
  if (aIsErr || bIsErr) {
    if (aIsErr && bIsErr) return (a as FormulaError).code === (b as FormulaError).code ? 0 : 1;
    return aIsErr ? 1 : -1;
  }

  let av: FormulaValue = a;
  let bv: FormulaValue = b;

  if (av === '' && typeof bv === 'number') av = 0;
  else if (av === '' && typeof bv === 'boolean') av = false;
  if (bv === '' && typeof av === 'number') bv = 0;
  else if (bv === '' && typeof av === 'boolean') bv = false;

  const rank = (v: FormulaValue): number =>
    typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
  const ra = rank(av);
  const rb = rank(bv);
  if (ra !== rb) return ra < rb ? -1 : 1;

  if (typeof av === 'number' && typeof bv === 'number') {
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  if (typeof av === 'string' && typeof bv === 'string') {
    const la = av.toLowerCase();
    const lb = bv.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  }
  const ab = av as boolean;
  const bb = bv as boolean;
  if (ab === bb) return 0;
  return ab ? 1 : -1; // FALSE < TRUE
}

/** Whether two values are equal under Excel's comparison ordering. */
export function valuesEqual(a: FormulaResult, b: FormulaResult): boolean {
  if (isFormulaError(a) || isFormulaError(b)) return false;
  return compareValues(a, b) === 0;
}
