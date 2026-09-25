/**
 * Array functions that return SpillResult for spill behavior.
 * UNIQUE, SORT, FILTER, SEQUENCE
 */

import type {
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
  FunctionReturnValue,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { argToFlat, argToGrid, isMultiValued, makeSpill, resolveNumber, resolveScalar } from './helpers';
import { compareValues, toBoolean, toNumber } from '../coerce';

function transpose(grid: FormulaResult[][]): FormulaResult[][] {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const result: FormulaResult[][] = [];
  for (let c = 0; c < cols; c++) {
    const row: FormulaResult[] = [];
    for (let r = 0; r < rows; r++) row.push(grid[r][c]);
    result.push(row);
  }
  return result;
}

function argToBoolean(arg: FunctionArgValue, ctx: FunctionContext) {
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  return toBoolean(val);
}

/** Case-insensitive row/column key for uniqueness comparisons. */
function lineKey(line: FormulaResult[]): string {
  return line
    .map(v => (isFormulaError(v) ? `E:${v.code}` : typeof v === 'string' ? `S:${v.toLowerCase()}` : `V:${String(v)}`))
    .join('\u0000');
}

// ============================================================
// UNIQUE
// ============================================================
const UNIQUE: FunctionMeta = {
  name: 'UNIQUE',
  signature: 'UNIQUE(array, [by_col], [exactly_once])',
  description: '重複を除外した一意の値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');

    let grid = argToGrid(args[0], ctx);

    let byCol = false;
    if (args.length >= 2) {
      const b = argToBoolean(args[1], ctx);
      if (isFormulaError(b)) return b;
      byCol = b;
    }
    let exactlyOnce = false;
    if (args.length >= 3) {
      const b = argToBoolean(args[2], ctx);
      if (isFormulaError(b)) return b;
      exactlyOnce = b;
    }

    if (byCol) grid = transpose(grid);

    const counts = new Map<string, number>();
    for (const line of grid) {
      const k = lineKey(line);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const seen = new Set<string>();
    const resultLines: FormulaResult[][] = [];
    for (const line of grid) {
      const k = lineKey(line);
      if (seen.has(k)) continue;
      if (exactlyOnce && counts.get(k) !== 1) continue;
      seen.add(k);
      resultLines.push(line);
    }

    if (resultLines.length === 0) return makeError('#N/A');

    return makeSpill(byCol ? transpose(resultLines) : resultLines);
  },
};

// ============================================================
// SORT
// ============================================================
const SORT_FN: FunctionMeta = {
  name: 'SORT',
  signature: 'SORT(array, [sort_index], [sort_order], [by_col])',
  description: '範囲をソートした結果を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 4) return makeError('#VALUE!');

    let grid = argToGrid(args[0], ctx);

    let byCol = false;
    if (args.length >= 4) {
      const b = argToBoolean(args[3], ctx);
      if (isFormulaError(b)) return b;
      byCol = b;
    }
    if (byCol) grid = transpose(grid);

    const cols = grid[0]?.length ?? 0;

    let sortIndices: number[] = [1];
    if (args.length >= 2) {
      const idxArg = args[1];
      if (isMultiValued(idxArg)) {
        sortIndices = [];
        for (const v of argToFlat(idxArg, ctx)) {
          const n = toNumber(v);
          if (isFormulaError(n)) return n;
          sortIndices.push(Math.trunc(n));
        }
      } else {
        const n = resolveNumber(idxArg, ctx);
        if (isFormulaError(n)) return n;
        sortIndices = [Math.trunc(n)];
      }
    }
    for (const si of sortIndices) {
      if (si < 1 || si > cols) return makeError('#VALUE!');
    }

    let sortOrders: number[] = sortIndices.map(() => 1);
    if (args.length >= 3) {
      const ordArg = args[2];
      if (isMultiValued(ordArg)) {
        sortOrders = [];
        for (const v of argToFlat(ordArg, ctx)) {
          const n = toNumber(v);
          if (isFormulaError(n)) return n;
          sortOrders.push(Math.trunc(n));
        }
      } else {
        const n = resolveNumber(ordArg, ctx);
        if (isFormulaError(n)) return n;
        sortOrders = sortIndices.map(() => Math.trunc(n));
      }
      if (sortOrders.length !== sortIndices.length) return makeError('#VALUE!');
    }

    const sorted = [...grid].sort((a, b) => {
      for (let k = 0; k < sortIndices.length; k++) {
        const si = sortIndices[k] - 1;
        const cmp = compareValues(a[si], b[si]);
        if (cmp !== 0) return sortOrders[k] === -1 ? -cmp : cmp;
      }
      return 0;
    });

    return makeSpill(byCol ? transpose(sorted) : sorted);
  },
};

// ============================================================
// FILTER
// ============================================================
const FILTER_FN: FunctionMeta = {
  name: 'FILTER',
  signature: 'FILTER(array, include, [if_empty])',
  description: '条件に一致する行を抽出します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const grid = argToGrid(args[0], ctx);
    const includeGrid = argToGrid(args[1], ctx);
    if (includeGrid.length !== grid.length) return makeError('#VALUE!');

    const filteredRows: FormulaResult[][] = [];
    for (let r = 0; r < grid.length; r++) {
      let keep = true;
      for (const incVal of includeGrid[r]) {
        const b = toBoolean(incVal);
        if (isFormulaError(b)) return b;
        if (!b) {
          keep = false;
          break;
        }
      }
      if (keep) filteredRows.push(grid[r]);
    }

    if (filteredRows.length === 0) {
      if (args.length === 3) return resolveScalar(args[2], ctx);
      return makeError('#N/A');
    }

    return makeSpill(filteredRows);
  },
};

// ============================================================
// SEQUENCE
// ============================================================
const SEQUENCE: FunctionMeta = {
  name: 'SEQUENCE',
  signature: 'SEQUENCE(rows, [columns], [start], [step])',
  description: '連番の配列を生成します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 4) return makeError('#VALUE!');

    const rowsVal = resolveNumber(args[0], ctx);
    if (isFormulaError(rowsVal)) return rowsVal;
    const rows = Math.trunc(rowsVal);
    if (rows < 1) return makeError('#VALUE!');

    let cols = 1;
    if (args.length >= 2) {
      const cv = resolveNumber(args[1], ctx);
      if (isFormulaError(cv)) return cv;
      cols = Math.trunc(cv);
      if (cols < 1) return makeError('#VALUE!');
    }

    let start = 1;
    if (args.length >= 3) {
      const sv = resolveNumber(args[2], ctx);
      if (isFormulaError(sv)) return sv;
      start = sv;
    }

    let step = 1;
    if (args.length >= 4) {
      const stv = resolveNumber(args[3], ctx);
      if (isFormulaError(stv)) return stv;
      step = stv;
    }

    const values: FormulaResult[][] = [];
    let current = start;
    for (let r = 0; r < rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(current);
        current += step;
      }
      values.push(row);
    }

    return makeSpill(values);
  },
};

// ============================================================
// TRANSPOSE
// ============================================================
const TRANSPOSE_FN: FunctionMeta = {
  name: 'TRANSPOSE',
  signature: 'TRANSPOSE(array)',
  description: '配列の行と列を入れ替えます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 1) return makeError('#VALUE!');
    return makeSpill(transpose(argToGrid(args[0], ctx)));
  },
};

// ============================================================
// SORTBY
// ============================================================
const SORTBY: FunctionMeta = {
  name: 'SORTBY',
  signature: 'SORTBY(array, by_array1, [sort_order1], [by_array2, sort_order2], ...)',
  description: '指定した配列の値に基づいて範囲を並べ替えます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2) return makeError('#VALUE!');

    const grid = argToGrid(args[0], ctx);
    const rows = grid.length;

    const byArrays: FormulaResult[][] = [];
    const orders: number[] = [];
    let i = 1;
    while (i < args.length) {
      const byGrid = argToGrid(args[i], ctx);
      const byRows = byGrid.length;
      const byCols = byGrid[0]?.length ?? 0;
      let flat: FormulaResult[];
      if (byCols === 1) flat = byGrid.map(r => r[0]);
      else if (byRows === 1) flat = byGrid[0];
      else return makeError('#VALUE!');
      if (flat.length !== rows) return makeError('#VALUE!');
      byArrays.push(flat);
      i++;

      let order = 1;
      if (i < args.length && !isMultiValued(args[i])) {
        const o = resolveNumber(args[i], ctx);
        if (isFormulaError(o)) return o;
        order = Math.trunc(o);
        i++;
      }
      orders.push(order);
    }

    const indices = grid.map((_, idx) => idx);
    indices.sort((a, b) => {
      for (let k = 0; k < byArrays.length; k++) {
        const cmp = compareValues(byArrays[k][a], byArrays[k][b]);
        if (cmp !== 0) return orders[k] === -1 ? -cmp : cmp;
      }
      return 0; // Array.prototype.sort is stable (ES2019+)
    });

    return makeSpill(indices.map(idx => grid[idx]));
  },
};

// ============================================================
// FLATTEN (Google Sheets)
// ============================================================
const FLATTEN: FunctionMeta = {
  name: 'FLATTEN',
  signature: 'FLATTEN(range1, [range2, ...])',
  description: '複数の範囲の要素を行優先で1列にまとめます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1) return makeError('#VALUE!');
    const values: FormulaResult[][] = [];
    for (const arg of args) {
      for (const v of argToFlat(arg, ctx)) values.push([v]);
    }
    if (values.length === 0) return makeError('#N/A');
    return makeSpill(values);
  },
};

/** Flatten a grid row-major (default) or column-major (scan_by_column = TRUE). */
function flattenGrid(grid: FormulaResult[][], byColumn: boolean): FormulaResult[] {
  if (!byColumn) return grid.flat();
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const result: FormulaResult[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) result.push(grid[r][c]);
  }
  return result;
}

/** Apply TOCOL/TOROW's `ignore` option: 0 none, 1 blanks, 2 errors, 3 both. */
function applyIgnore(values: FormulaResult[], ignore: number): FormulaResult[] {
  return values.filter(v => {
    if ((ignore === 1 || ignore === 3) && v === '') return false;
    if ((ignore === 2 || ignore === 3) && isFormulaError(v)) return false;
    return true;
  });
}

function parseToColRowArgs(
  args: FunctionArgValue[],
  ctx: FunctionContext,
): { ignore: number; byColumn: boolean } | FormulaError {
  let ignore = 0;
  if (args.length >= 2 && args[1].kind !== 'omitted') {
    const iv = resolveNumber(args[1], ctx);
    if (isFormulaError(iv)) return iv;
    ignore = Math.trunc(iv);
  }
  let byColumn = false;
  if (args.length >= 3 && args[2].kind !== 'omitted') {
    const b = argToBoolean(args[2], ctx);
    if (isFormulaError(b)) return b;
    byColumn = b;
  }
  return { ignore, byColumn };
}

// ============================================================
// TOCOL / TOROW
// ============================================================
const TOCOL: FunctionMeta = {
  name: 'TOCOL',
  signature: 'TOCOL(array, [ignore], [scan_by_column])',
  description: '配列を1列に変換します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');
    const opts = parseToColRowArgs(args, ctx);
    if (isFormulaError(opts)) return opts;

    const grid = argToGrid(args[0], ctx);
    const filtered = applyIgnore(flattenGrid(grid, opts.byColumn), opts.ignore);
    if (filtered.length === 0) return makeError('#N/A');
    return makeSpill(filtered.map(v => [v]));
  },
};

const TOROW: FunctionMeta = {
  name: 'TOROW',
  signature: 'TOROW(array, [ignore], [scan_by_column])',
  description: '配列を1行に変換します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');
    const opts = parseToColRowArgs(args, ctx);
    if (isFormulaError(opts)) return opts;

    const grid = argToGrid(args[0], ctx);
    const filtered = applyIgnore(flattenGrid(grid, opts.byColumn), opts.ignore);
    if (filtered.length === 0) return makeError('#N/A');
    return makeSpill([filtered]);
  },
};

// ============================================================
// CHOOSECOLS / CHOOSEROWS
// ============================================================
const CHOOSECOLS: FunctionMeta = {
  name: 'CHOOSECOLS',
  signature: 'CHOOSECOLS(array, col_num1, [col_num2, ...])',
  description: '指定した列番号の列を配列から抽出します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const cols = grid[0]?.length ?? 0;

    const colIndices: number[] = [];
    for (let i = 1; i < args.length; i++) {
      const n = resolveNumber(args[i], ctx);
      if (isFormulaError(n)) return n;
      let idx = Math.trunc(n);
      if (idx < 0) idx = cols + idx + 1;
      if (idx < 1 || idx > cols) return makeError('#VALUE!');
      colIndices.push(idx - 1);
    }

    return makeSpill(grid.map(row => colIndices.map(ci => row[ci])));
  },
};

const CHOOSEROWS: FunctionMeta = {
  name: 'CHOOSEROWS',
  signature: 'CHOOSEROWS(array, row_num1, [row_num2, ...])',
  description: '指定した行番号の行を配列から抽出します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const rows = grid.length;

    const rowIndices: number[] = [];
    for (let i = 1; i < args.length; i++) {
      const n = resolveNumber(args[i], ctx);
      if (isFormulaError(n)) return n;
      let idx = Math.trunc(n);
      if (idx < 0) idx = rows + idx + 1;
      if (idx < 1 || idx > rows) return makeError('#VALUE!');
      rowIndices.push(idx - 1);
    }

    return makeSpill(rowIndices.map(ri => grid[ri]));
  },
};

// ============================================================
// TAKE / DROP
// ============================================================
/** Resolve a TAKE/DROP rows/columns count argument; `null` means "omitted" (keep everything). */
function resolveTakeCount(arg: FunctionArgValue, ctx: FunctionContext): number | FormulaError | null {
  if (arg.kind === 'omitted') return null;
  const n = resolveNumber(arg, ctx);
  if (isFormulaError(n)) return n;
  return Math.trunc(n);
}

const TAKE: FunctionMeta = {
  name: 'TAKE',
  signature: 'TAKE(array, rows, [columns])',
  description: '配列の先頭または末尾から指定した行数・列数を取得します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const totalRows = grid.length;
    const totalCols = grid[0]?.length ?? 0;

    const rowsCount = resolveTakeCount(args[1], ctx);
    if (isFormulaError(rowsCount)) return rowsCount;
    const colsCount = args.length === 3 ? resolveTakeCount(args[2], ctx) : null;
    if (isFormulaError(colsCount)) return colsCount;

    let rowStart = 0;
    let rowEnd = totalRows;
    if (rowsCount !== null) {
      const n = Math.min(Math.abs(rowsCount), totalRows);
      if (rowsCount >= 0) { rowStart = 0; rowEnd = n; } else { rowStart = totalRows - n; rowEnd = totalRows; }
    }
    let colStart = 0;
    let colEnd = totalCols;
    if (colsCount !== null) {
      const n = Math.min(Math.abs(colsCount), totalCols);
      if (colsCount >= 0) { colStart = 0; colEnd = n; } else { colStart = totalCols - n; colEnd = totalCols; }
    }

    if (rowStart >= rowEnd || colStart >= colEnd) return makeError('#N/A');
    return makeSpill(grid.slice(rowStart, rowEnd).map(row => row.slice(colStart, colEnd)));
  },
};

const DROP: FunctionMeta = {
  name: 'DROP',
  signature: 'DROP(array, rows, [columns])',
  description: '配列の先頭または末尾から指定した行数・列数を除外します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const totalRows = grid.length;
    const totalCols = grid[0]?.length ?? 0;

    const rowsCount = resolveTakeCount(args[1], ctx);
    if (isFormulaError(rowsCount)) return rowsCount;
    const colsCount = args.length === 3 ? resolveTakeCount(args[2], ctx) : null;
    if (isFormulaError(colsCount)) return colsCount;

    let rowStart = 0;
    let rowEnd = totalRows;
    if (rowsCount !== null) {
      const n = Math.min(Math.abs(rowsCount), totalRows);
      if (rowsCount >= 0) rowStart = n; else rowEnd = totalRows - n;
    }
    let colStart = 0;
    let colEnd = totalCols;
    if (colsCount !== null) {
      const n = Math.min(Math.abs(colsCount), totalCols);
      if (colsCount >= 0) colStart = n; else colEnd = totalCols - n;
    }

    if (rowStart >= rowEnd || colStart >= colEnd) return makeError('#N/A');
    return makeSpill(grid.slice(rowStart, rowEnd).map(row => row.slice(colStart, colEnd)));
  },
};

// ============================================================
// HSTACK / VSTACK
// ============================================================
const HSTACK: FunctionMeta = {
  name: 'HSTACK',
  signature: 'HSTACK(array1, [array2, ...])',
  description: '複数の配列を左右に連結します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1) return makeError('#VALUE!');
    const grids = args.map(a => argToGrid(a, ctx));
    const maxRows = Math.max(...grids.map(g => g.length));

    const result: FormulaResult[][] = [];
    for (let r = 0; r < maxRows; r++) {
      const row: FormulaResult[] = [];
      for (const g of grids) {
        const cols = g[0]?.length ?? 0;
        if (r < g.length) {
          row.push(...g[r]);
        } else {
          for (let c = 0; c < cols; c++) row.push(makeError('#N/A'));
        }
      }
      result.push(row);
    }
    return makeSpill(result);
  },
};

const VSTACK: FunctionMeta = {
  name: 'VSTACK',
  signature: 'VSTACK(array1, [array2, ...])',
  description: '複数の配列を上下に連結します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1) return makeError('#VALUE!');
    const grids = args.map(a => argToGrid(a, ctx));
    const maxCols = Math.max(...grids.map(g => g[0]?.length ?? 0));

    const result: FormulaResult[][] = [];
    for (const g of grids) {
      const cols = g[0]?.length ?? 0;
      for (const row of g) {
        const newRow = row.slice();
        for (let c = cols; c < maxCols; c++) newRow.push(makeError('#N/A'));
        result.push(newRow);
      }
    }
    return makeSpill(result);
  },
};

// ============================================================
// WRAPROWS / WRAPCOLS
// ============================================================
const WRAPROWS: FunctionMeta = {
  name: 'WRAPROWS',
  signature: 'WRAPROWS(vector, wrap_count, [pad_with])',
  description: 'ベクトルを指定した列数で折り返し、行方向に並べた配列にします',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const flat = argToFlat(args[0], ctx);
    const wc = resolveNumber(args[1], ctx);
    if (isFormulaError(wc)) return wc;
    const wrapCount = Math.trunc(wc);
    if (wrapCount < 1) return makeError('#VALUE!');
    const pad: FormulaResult = args.length === 3 ? resolveScalar(args[2], ctx) : makeError('#N/A');

    const rows = Math.ceil(flat.length / wrapCount);
    const result: FormulaResult[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < wrapCount; c++) {
        const idx = r * wrapCount + c;
        row.push(idx < flat.length ? flat[idx] : pad);
      }
      result.push(row);
    }
    return makeSpill(result);
  },
};

const WRAPCOLS: FunctionMeta = {
  name: 'WRAPCOLS',
  signature: 'WRAPCOLS(vector, wrap_count, [pad_with])',
  description: 'ベクトルを指定した行数で折り返し、列方向に並べた配列にします',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const flat = argToFlat(args[0], ctx);
    const wc = resolveNumber(args[1], ctx);
    if (isFormulaError(wc)) return wc;
    const wrapCount = Math.trunc(wc);
    if (wrapCount < 1) return makeError('#VALUE!');
    const pad: FormulaResult = args.length === 3 ? resolveScalar(args[2], ctx) : makeError('#N/A');

    const cols = Math.ceil(flat.length / wrapCount);
    const result: FormulaResult[][] = [];
    for (let r = 0; r < wrapCount; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < cols; c++) {
        const idx = c * wrapCount + r;
        row.push(idx < flat.length ? flat[idx] : pad);
      }
      result.push(row);
    }
    return makeSpill(result);
  },
};

// ============================================================
// EXPAND
// ============================================================
const EXPAND: FunctionMeta = {
  name: 'EXPAND',
  signature: 'EXPAND(array, rows, [columns], [pad_with])',
  description: '配列を指定した行数・列数まで拡張します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 4) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const curRows = grid.length;
    const curCols = grid[0]?.length ?? 0;

    const rv = resolveNumber(args[1], ctx);
    if (isFormulaError(rv)) return rv;
    const newRows = Math.trunc(rv);
    if (newRows < curRows) return makeError('#VALUE!');

    let newCols = curCols;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const cv = resolveNumber(args[2], ctx);
      if (isFormulaError(cv)) return cv;
      newCols = Math.trunc(cv);
      if (newCols < curCols) return makeError('#VALUE!');
    }

    const pad: FormulaResult = args.length === 4 ? resolveScalar(args[3], ctx) : makeError('#N/A');

    const result: FormulaResult[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(r < curRows && c < curCols ? grid[r][c] : pad);
      }
      result.push(row);
    }
    return makeSpill(result);
  },
};

// ============================================================
// ARRAYFORMULA / ARRAY_CONSTRAIN (Google Sheets)
// ============================================================
const ARRAYFORMULA: FunctionMeta = {
  name: 'ARRAYFORMULA',
  signature: 'ARRAYFORMULA(array_formula)',
  description: '配列数式の結果をそのまま返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 1) return makeError('#VALUE!');
    const arg = args[0];
    if (arg.kind === 'range') return makeSpill(argToGrid(arg, ctx));
    if (arg.kind === 'array') return makeSpill(arg.values);
    if (arg.kind === 'value') return arg.value;
    if (arg.kind === 'omitted') return '';
    return makeError('#VALUE!'); // lambda
  },
};

const ARRAY_CONSTRAIN: FunctionMeta = {
  name: 'ARRAY_CONSTRAIN',
  signature: 'ARRAY_CONSTRAIN(input_range, num_rows, num_cols)',
  description: '配列を指定した行数・列数に切り詰めます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 3) return makeError('#VALUE!');
    const grid = argToGrid(args[0], ctx);
    const rv = resolveNumber(args[1], ctx);
    if (isFormulaError(rv)) return rv;
    const cv = resolveNumber(args[2], ctx);
    if (isFormulaError(cv)) return cv;
    const numRows = Math.max(1, Math.trunc(rv));
    const numCols = Math.max(1, Math.trunc(cv));
    return makeSpill(grid.slice(0, numRows).map(row => row.slice(0, numCols)));
  },
};

// ============================================================
// RANDARRAY
// ============================================================
const RANDARRAY: FunctionMeta = {
  name: 'RANDARRAY',
  signature: 'RANDARRAY([rows], [columns], [min], [max], [integer])',
  description: 'ランダムな数値の配列を生成します',
  volatile: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length > 5) return makeError('#VALUE!');

    let rows = 1;
    if (args.length >= 1 && args[0].kind !== 'omitted') {
      const r = resolveNumber(args[0], ctx);
      if (isFormulaError(r)) return r;
      rows = Math.trunc(r);
    }
    let cols = 1;
    if (args.length >= 2 && args[1].kind !== 'omitted') {
      const c = resolveNumber(args[1], ctx);
      if (isFormulaError(c)) return c;
      cols = Math.trunc(c);
    }
    if (rows < 1 || cols < 1) return makeError('#VALUE!');

    let min = 0;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const m = resolveNumber(args[2], ctx);
      if (isFormulaError(m)) return m;
      min = m;
    }
    let max = 1;
    if (args.length >= 4 && args[3].kind !== 'omitted') {
      const m = resolveNumber(args[3], ctx);
      if (isFormulaError(m)) return m;
      max = m;
    }
    if (max < min) return makeError('#VALUE!');

    let integer = false;
    if (args.length >= 5 && args[4].kind !== 'omitted') {
      const b = argToBoolean(args[4], ctx);
      if (isFormulaError(b)) return b;
      integer = b;
    }

    const values: FormulaResult[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < cols; c++) {
        const v = min + Math.random() * (max - min);
        row.push(integer ? Math.floor(v) : v);
      }
      values.push(row);
    }
    return makeSpill(values);
  },
};

// ============================================================
// MMULT
// ============================================================
const MMULT: FunctionMeta = {
  name: 'MMULT',
  signature: 'MMULT(array1, array2)',
  description: '2つの配列の行列積を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 2) return makeError('#VALUE!');
    const a = argToGrid(args[0], ctx);
    const b = argToGrid(args[1], ctx);
    const aRows = a.length;
    const aCols = a[0]?.length ?? 0;
    const bRows = b.length;
    const bCols = b[0]?.length ?? 0;
    if (aCols !== bRows) return makeError('#VALUE!');

    const aNum: number[][] = [];
    for (const row of a) {
      const nrow: number[] = [];
      for (const v of row) {
        if (typeof v !== 'number') return makeError('#VALUE!');
        nrow.push(v);
      }
      aNum.push(nrow);
    }
    const bNum: number[][] = [];
    for (const row of b) {
      const nrow: number[] = [];
      for (const v of row) {
        if (typeof v !== 'number') return makeError('#VALUE!');
        nrow.push(v);
      }
      bNum.push(nrow);
    }

    const result: FormulaResult[][] = [];
    for (let r = 0; r < aRows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < bCols; c++) {
        let sum = 0;
        for (let k = 0; k < aCols; k++) sum += aNum[r][k] * bNum[k][c];
        row.push(sum);
      }
      result.push(row);
    }
    return makeSpill(result);
  },
};

// ============================================================
// FREQUENCY
// ============================================================
const FREQUENCY: FunctionMeta = {
  name: 'FREQUENCY',
  signature: 'FREQUENCY(data_array, bins_array)',
  description: '指定した区間ごとにデータの度数を集計した縦配列を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 2) return makeError('#VALUE!');

    const dataRaw = argToFlat(args[0], ctx);
    const data: number[] = [];
    for (const v of dataRaw) {
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') data.push(v);
    }

    const binsRaw = argToFlat(args[1], ctx);
    const bins: number[] = [];
    for (const v of binsRaw) {
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') bins.push(v);
      else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) bins.push(Number(v));
    }
    const sortedBins = [...bins].sort((a, b) => a - b);

    const counts = new Array(sortedBins.length + 1).fill(0);
    for (const v of data) {
      let placed = false;
      for (let i = 0; i < sortedBins.length; i++) {
        if (v <= sortedBins[i]) {
          counts[i]++;
          placed = true;
          break;
        }
      }
      if (!placed) counts[counts.length - 1]++;
    }
    return makeSpill(counts.map(c => [c]));
  },
};

export const arrayFunctions: FunctionMeta[] = [
  UNIQUE, SORT_FN, FILTER_FN, SEQUENCE,
  TRANSPOSE_FN, SORTBY, FLATTEN, TOCOL, TOROW, CHOOSECOLS, CHOOSEROWS, TAKE, DROP,
  HSTACK, VSTACK, WRAPROWS, WRAPCOLS, EXPAND, ARRAYFORMULA, ARRAY_CONSTRAIN,
  RANDARRAY, MMULT, FREQUENCY,
];
