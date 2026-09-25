import type {
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionReturnValue,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { formatNumberForText, textToNumber } from '../coerce';

/**
 * Convert a function argument into a 2D grid of resolved values.
 * range: resolved cell values arranged rows x cols. array: its values as-is.
 * value: a 1x1 grid. omitted: a 1x1 grid containing ''. lambda: a 1x1 grid containing #VALUE!.
 */
/** Ranges smaller than this are resolved directly (caching them costs more than it saves). */
const RANGE_CACHE_MIN_CELLS = 16;

// ============================================================
// Exact-match lookup index (VLOOKUP / MATCH with exact matching)
// ============================================================

/** Below this many entries a linear scan is as fast as building an index. */
const EXACT_INDEX_MIN = 32;
const columnIndexes = new WeakMap<FormulaResult[][], Map<number, Map<string, number>>>();
const listIndexes = new WeakMap<FormulaResult[], Map<string, number>>();

/**
 * Normalized key for exact-match lookups. Equivalent to the lookup functions' comparison
 * (numbers by value, everything else case-insensitively as text), so an index hit is exactly the
 * first row a linear scan would find. Errors never match (null).
 */
export function exactMatchKey(v: FormulaResult): string | null {
  return isFormulaError(v) ? null : String(v).toLowerCase();
}

function buildIndex(values: Iterable<FormulaResult>): Map<string, number> {
  const index = new Map<string, number>();
  let i = 0;
  for (const v of values) {
    const k = exactMatchKey(v);
    if (k !== null && !index.has(k)) index.set(k, i);
    i++;
  }
  return index;
}

/**
 * key → first row index for column `col` of a cached (frozen) grid, built once and reused while the
 * grid is cached (one recalculation pass). null when the grid is not cached or too small to be worth it.
 */
export function exactMatchIndexForColumn(
  grid: FormulaResult[][],
  col: number,
): Map<string, number> | null {
  if (grid.length < EXACT_INDEX_MIN || !Object.isFrozen(grid)) return null;
  let byCol = columnIndexes.get(grid);
  if (!byCol) columnIndexes.set(grid, (byCol = new Map()));
  let index = byCol.get(col);
  if (!index) {
    index = buildIndex(grid.map((row) => row[col]));
    byCol.set(col, index);
  }
  return index;
}

/** Same as exactMatchIndexForColumn for a cached (frozen) flat list from argToFlat. */
export function exactMatchIndexForList(list: FormulaResult[]): Map<string, number> | null {
  if (list.length < EXACT_INDEX_MIN || !Object.isFrozen(list)) return null;
  let index = listIndexes.get(list);
  if (!index) {
    index = buildIndex(list);
    listIndexes.set(list, index);
  }
  return index;
}

/** Identity of a range's contents within one recalculation pass (sheet + geometry). */
export function rangeCacheKey(
  arg: Extract<FunctionArgValue, { kind: 'range' }>,
  ctx: FunctionContext,
): string {
  return `${arg.sheetId ?? ctx.currentCell?.sheetId ?? ''}|${arg.startRow}|${arg.startCol}|${arg.rows}|${arg.cols}`;
}

/** Resolve a range argument to a grid, reusing ctx.rangeCache for large ranges. The result may be frozen. */
function resolveRangeGrid(
  arg: Extract<FunctionArgValue, { kind: 'range' }>,
  ctx: FunctionContext,
): FormulaResult[][] {
  const cache = arg.rows * arg.cols >= RANGE_CACHE_MIN_CELLS ? ctx.rangeCache : undefined;
  const cacheKey = cache ? rangeCacheKey(arg, ctx) : '';
  if (cache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      if (ctx.passStats) ctx.passStats.rangeHits++;
      return hit;
    }
    if (ctx.passStats) ctx.passStats.rangeMisses++;
  }
  const keys = arg.keys;
  const grid: FormulaResult[][] = [];
  for (let r = 0; r < arg.rows; r++) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < arg.cols; c++) {
      row.push(ctx.resolve(keys[r * arg.cols + c]));
    }
    grid.push(row);
  }
  if (cache) {
    for (const row of grid) Object.freeze(row);
    Object.freeze(grid);
    cache.set(cacheKey, grid);
  }
  return grid;
}

export function argToGrid(arg: FunctionArgValue, ctx: FunctionContext): FormulaResult[][] {
  if (arg.kind === 'range') return resolveRangeGrid(arg, ctx);
  if (arg.kind === 'array') return arg.values;
  if (arg.kind === 'value') return [[arg.value]];
  if (arg.kind === 'omitted') return [['']];
  return [[makeError('#VALUE!')]]; // lambda
}

/** Flattened versions of cached (frozen) range grids, so repeated SUM(A:A)-style reads don't re-copy */
const flatOfCachedGrid = new WeakMap<FormulaResult[][], FormulaResult[]>();

/** Convert a function argument into a flat, row-major list of resolved values (treat as read-only). */
export function argToFlat(arg: FunctionArgValue, ctx: FunctionContext): FormulaResult[] {
  const grid = argToGrid(arg, ctx);
  if (!Object.isFrozen(grid)) return grid.flat();
  let flat = flatOfCachedGrid.get(grid);
  if (!flat) {
    flat = Object.freeze(grid.flat()) as FormulaResult[];
    flatOfCachedGrid.set(grid, flat);
  }
  return flat;
}

/** Dimensions of a function argument (range/array shape; scalar/omitted/lambda are 1x1). */
export function argDims(arg: FunctionArgValue): { rows: number; cols: number } {
  if (arg.kind === 'range') return { rows: arg.rows, cols: arg.cols };
  if (arg.kind === 'array') {
    const rows = arg.values.length;
    return { rows, cols: rows > 0 ? arg.values[0].length : 0 };
  }
  return { rows: 1, cols: 1 };
}

/** Whether an argument represents more than one cell/element (a range larger than 1x1, or a non-1x1 array). */
export function isMultiValued(arg: FunctionArgValue): boolean {
  if (arg.kind === 'range') return arg.rows * arg.cols > 1;
  if (arg.kind === 'array') {
    const rows = arg.values.length;
    const cols = rows > 0 ? arg.values[0].length : 0;
    return !(rows === 1 && cols === 1);
  }
  return false;
}

/** Wrap a 2D grid as a function return value, collapsing a 1x1 grid to a scalar. */
export function makeSpill(values: FormulaResult[][]): FunctionReturnValue {
  if (values.length === 1 && values[0].length === 1) return values[0][0];
  return { type: 'spill', values };
}

/**
 * Resolve function arguments into numeric values.
 * For range/array arguments, resolves/flattens each cell and extracts numeric values.
 * Options:
 * - skipNonNumeric: skip text and logical values in ranges/arrays (for SUM, AVERAGE, etc.)
 * - strictScalar: requires all args to be scalar values, and they must be numeric. A 1x1 range/array
 *   (e.g. a bare cell reference, which arrives as a 1x1 range) counts as a scalar.
 */
export function resolveNumericArgs(
  args: FunctionArgValue[],
  ctx: FunctionContext,
  options: { skipNonNumeric?: boolean; strictScalar?: boolean } = {},
): number[] | FormulaError {
  const result: number[] = [];

  for (const arg of args) {
    if (arg.kind === 'lambda') return makeError('#VALUE!');
    if ((arg.kind === 'range' || arg.kind === 'array') && !options.strictScalar) {
      for (const val of argToFlat(arg, ctx)) {
        if (isFormulaError(val)) return val;
        if (typeof val === 'number') {
          result.push(val);
        } else if (typeof val === 'boolean') {
          // Like text, logical values in a reference or array are ignored (a literal TRUE still counts)
          if (options.skipNonNumeric) continue;
          result.push(val ? 1 : 0);
        } else if (typeof val === 'string') {
          if (val === '') continue; // Skip empty cells
          if (options.skipNonNumeric) continue; // Skip text in ranges
          const num = Number(val);
          if (isNaN(num)) continue;
          result.push(num);
        }
      }
      continue;
    }
    // Scalar value (omitted = an empty value; under strictScalar a 1x1 range/array is its single value)
    if (isMultiValued(arg)) return makeError('#VALUE!');
    const num = scalarToNumber(resolveScalar(arg, ctx));
    if (isFormulaError(num)) return num;
    result.push(num);
  }

  return result;
}

/** A scalar as a number the way scalar numeric parameters read it ('' = 0, text via textToNumber). */
function scalarToNumber(val: FormulaResult): number | FormulaError {
  if (isFormulaError(val)) return val;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  return textToNumber(val);
}

/**
 * Resolve all arguments into raw FormulaResult values (preserving types).
 * Expands ranges/arrays into individual values.
 */
export function resolveNumericValues(
  args: FunctionArgValue[],
  ctx: FunctionContext,
): FormulaResult[] | FormulaError {
  const result: FormulaResult[] = [];

  for (const arg of args) {
    if (arg.kind === 'range' || arg.kind === 'array') {
      for (const val of argToFlat(arg, ctx)) {
        if (isFormulaError(val)) return val;
        result.push(val);
      }
    } else if (arg.kind === 'lambda') {
      return makeError('#VALUE!');
    } else {
      const val: FormulaResult = arg.kind === 'omitted' ? '' : arg.value;
      if (isFormulaError(val)) return val;
      result.push(val);
    }
  }

  return result;
}

/**
 * Resolve a single scalar argument to its value.
 * A range with exactly one cell, or a 1x1 array, resolves to that value; anything larger is #VALUE!.
 */
export function resolveScalar(arg: FunctionArgValue, ctx: FunctionContext): FormulaResult {
  if (arg.kind === 'range') {
    if (arg.rows === 1 && arg.cols === 1) {
      return ctx.resolve(arg.keys[0]);
    }
    return makeError('#VALUE!');
  }
  if (arg.kind === 'array') {
    if (arg.values.length === 1 && arg.values[0].length === 1) {
      return arg.values[0][0];
    }
    return makeError('#VALUE!');
  }
  if (arg.kind === 'omitted') return '';
  if (arg.kind === 'lambda') return makeError('#VALUE!');
  return arg.value;
}

/**
 * Resolve a single argument to a string value.
 */
export function resolveString(arg: FunctionArgValue, ctx: FunctionContext): string | FormulaError {
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return formatNumberForText(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return makeError('#VALUE!');
}

/**
 * Resolve a single argument to a number.
 */
export function resolveNumber(arg: FunctionArgValue, ctx: FunctionContext): number | FormulaError {
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string') return textToNumber(val);
  return makeError('#VALUE!');
}

// ============================================================
// COUNTIF/SUMIF-style criteria matching
// ============================================================

function coerceToNumberForCriteria(val: FormulaResult): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string' && val !== '' && !isNaN(Number(val))) return Number(val);
  return null;
}

function toComparableString(val: FormulaResult): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return String(val);
}

function escapeRegExpChar(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a case-insensitive matcher supporting COUNTIF/SUMIF-style wildcards:
 * `*` (any run of characters), `?` (single character), and the escapes `~*`, `~?`, `~~`
 * for matching those characters literally.
 */
export function buildWildcardMatcher(pattern: string): (s: string) => boolean {
  let regexStr = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (
      c === '~' &&
      i + 1 < pattern.length &&
      (pattern[i + 1] === '*' || pattern[i + 1] === '?' || pattern[i + 1] === '~')
    ) {
      regexStr += escapeRegExpChar(pattern[i + 1]);
      i++;
      continue;
    }
    if (c === '*') {
      regexStr += '.*';
      continue;
    }
    if (c === '?') {
      regexStr += '.';
      continue;
    }
    regexStr += escapeRegExpChar(c);
  }
  const re = new RegExp(`^${regexStr}$`, 'i');
  return (s: string) => re.test(s);
}

/**
 * Parse a COUNTIF/SUMIF-style criteria value into a predicate.
 * - number/boolean criteria match that exact value.
 * - string criteria may start with a comparison operator (>=, <=, <>, >, <, =); numeric
 *   comparisons are numeric, others compare text (with wildcard support for =/<>).
 * - "" matches empty cells, "<>" matches non-empty cells.
 * - Text equality/inequality comparisons support wildcards: `*`, `?`, `~*`, `~?`, `~~`.
 */
export function parseCriteria(criteria: FormulaResult): (val: FormulaResult) => boolean {
  if (isFormulaError(criteria)) return () => false;

  if (typeof criteria === 'number') {
    return (val: FormulaResult) => {
      if (isFormulaError(val)) return false;
      const numVal = coerceToNumberForCriteria(val);
      return numVal !== null && numVal === criteria;
    };
  }

  if (typeof criteria === 'boolean') {
    return (val: FormulaResult) =>
      !isFormulaError(val) && typeof val === 'boolean' && val === criteria;
  }

  if (criteria === '') {
    return (val: FormulaResult) => !isFormulaError(val) && val === '';
  }

  const match = /^(>=|<=|<>|>|<|=)(.*)$/.exec(criteria);
  if (match) {
    const [, op, rawTarget] = match;

    if (op === '<>' && rawTarget === '') {
      return (val: FormulaResult) => !isFormulaError(val) && val !== '';
    }

    const targetNum = Number(rawTarget);
    const isNumericTarget = rawTarget !== '' && !isNaN(targetNum);

    if (op === '=' || op === '<>') {
      const matcher = buildWildcardMatcher(rawTarget);
      return (val: FormulaResult) => {
        if (isFormulaError(val)) return false;
        let matched: boolean;
        if (isNumericTarget) {
          const numVal = coerceToNumberForCriteria(val);
          matched = numVal !== null && numVal === targetNum;
        } else {
          matched = matcher(toComparableString(val));
        }
        return op === '=' ? matched : !matched;
      };
    }

    // >, <, >=, <=  (numeric only)
    return (val: FormulaResult) => {
      if (isFormulaError(val) || !isNumericTarget) return false;
      const numVal = coerceToNumberForCriteria(val);
      if (numVal === null) return false;
      switch (op) {
        case '>':
          return numVal > targetNum;
        case '<':
          return numVal < targetNum;
        case '>=':
          return numVal >= targetNum;
        case '<=':
          return numVal <= targetNum;
        default:
          return false;
      }
    };
  }

  // No comparator prefix: exact match (numeric if possible, else wildcard text match)
  const numCriteria = Number(criteria);
  if (criteria !== '' && !isNaN(numCriteria)) {
    return (val: FormulaResult) => {
      if (isFormulaError(val)) return false;
      const numVal = coerceToNumberForCriteria(val);
      return numVal !== null && numVal === numCriteria;
    };
  }

  const matcher = buildWildcardMatcher(criteria);
  return (val: FormulaResult) => !isFormulaError(val) && matcher(toComparableString(val));
}
