import type {
  ASTNode,
  BinaryOperator,
  CellValueResolver,
  EvalValue,
  EvaluateOptions,
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionReturnValue,
  LambdaValue,
  NamedRangeResolver,
  OpenRangeNode,
  RangeExpander,
  RangeRefNode,
  SheetNameResolver,
  SheetRangeRefNode,
  SpillResult,
} from './types';
import { isFormulaError, isLambdaValue, isSpillResult, makeError } from './types';
import { getFunctionRegistry } from './functions';
import { colIndexToLetter, parseCellKey } from '../utils/coordinates';
import { compareValues, toNumber, toText } from './coerce';
import { argToGrid, rangeCacheKey } from './functions/helpers';

export { toNumber } from './coerce';

const MAX_EVAL_DEPTH = 1000;

/**
 * Evaluate an AST node and return a FormulaResult or SpillResult.
 * Top-level FunctionCall / range / array-literal nodes may return SpillResult.
 */
export function evaluate(
  node: ASTNode,
  resolve: CellValueResolver,
  expandRange: RangeExpander,
  resolveSheetName?: SheetNameResolver,
  resolveNamedRange?: NamedRangeResolver,
  setHyperlinkMeta?: (url: string, label: string) => void,
  options?: EvaluateOptions,
): FormulaResult | SpillResult {
  const ctx: FunctionContext = {
    resolve,
    expandRange,
    resolveSheetName,
    resolveNamedRange,
    setHyperlinkMeta,
    getSheetBounds: options?.getSheetBounds,
    currentCell: options?.currentCell,
    rangeCache: options?.rangeCache ?? new Map(),
    callCache: options?.callCache ?? new Map(),
    passStats: options?.passStats,
  };

  let depth = 0;
  const evalNodeFn = (n: ASTNode, scope?: Map<string, EvalValue>): EvalValue => {
    depth++;
    if (depth > MAX_EVAL_DEPTH) {
      depth--;
      return makeError('#CALC!');
    }
    const savedScope = ctx.scope;
    if (scope !== undefined) ctx.scope = scope;
    try {
      return evalNodeInner(n, ctx);
    } finally {
      ctx.scope = savedScope;
      depth--;
    }
  };
  ctx.evalNode = evalNodeFn;
  ctx.callLambda = (fn: LambdaValue, args: EvalValue[]): EvalValue => {
    if (args.length !== fn.params.length) return makeError('#VALUE!');
    const newScope = new Map(fn.closure);
    for (let i = 0; i < fn.params.length; i++) newScope.set(fn.params[i], args[i]);
    return ctx.evalNode!(fn.body, newScope);
  };

  const result = evalNodeFn(node);
  return normalizeTopLevel(result);
}

function normalizeTopLevel(v: EvalValue): FormulaResult | SpillResult {
  if (isLambdaValue(v)) return makeError('#CALC!');
  if (isSpillResult(v) && v.values.length === 1 && v.values[0].length === 1) {
    return v.values[0][0];
  }
  return v;
}

// ============================================================
// Range shape resolution (shared by standalone range evaluation
// and function-argument conversion)
// ============================================================

/**
 * Build a range argument whose `keys` are generated only when first read: with the range cache most
 * large ranges (e.g. A:A) are served without ever materializing thousands of key strings.
 */
function makeRangeArg(
  startRow: number,
  startCol: number,
  rows: number,
  cols: number,
  sheetId: string | undefined,
  makeKeys: () => string[],
): Extract<FunctionArgValue, { kind: 'range' }> {
  const arg = { kind: 'range', rows, cols, startRow, startCol, sheetId } as Extract<
    FunctionArgValue,
    { kind: 'range' }
  >;
  Object.defineProperty(arg, 'keys', {
    configurable: true,
    enumerable: true,
    get() {
      const keys = makeKeys();
      Object.defineProperty(arg, 'keys', { value: keys, enumerable: true, configurable: true });
      return keys;
    },
  });
  return arg;
}

function gridKeys(
  startRow: number,
  startCol: number,
  rows: number,
  cols: number,
  sheetId?: string,
): string[] {
  const keys: string[] = [];
  const prefix = sheetId ? `${sheetId}:` : '';
  const letters: string[] = [];
  for (let c = 0; c < cols; c++) letters.push(colIndexToLetter(startCol + c));
  for (let r = 0; r < rows; r++) {
    const rowNum = startRow + r + 1;
    for (let c = 0; c < cols; c++) keys.push(`${prefix}${letters[c]}${rowNum}`);
  }
  return keys;
}

function resolveRangeShape(
  node: RangeRefNode | SheetRangeRefNode | OpenRangeNode,
  ctx: FunctionContext,
): Extract<FunctionArgValue, { kind: 'range' }> | FormulaError {
  if (node.kind === 'RangeRef' || node.kind === 'SheetRangeRef') {
    let sheetId: string | undefined;
    if (node.kind === 'SheetRangeRef') {
      if (!ctx.resolveSheetName) return makeError('#REF!');
      sheetId = ctx.resolveSheetName(node.sheetName);
      if (!sheetId) return makeError('#REF!');
    }
    const s = parseCellKey(node.start);
    const e = parseCellKey(node.end);
    const startRow = Math.min(s.row, e.row);
    const startCol = Math.min(s.col, e.col);
    const rows = Math.abs(e.row - s.row) + 1;
    const cols = Math.abs(e.col - s.col) + 1;
    const sid = sheetId;
    const start = node.start;
    const end = node.end;
    return makeRangeArg(startRow, startCol, rows, cols, sid, () => {
      const local = ctx.expandRange(start, end);
      return sid ? local.map((k) => `${sid}:${k}`) : local;
    });
  }

  // OpenRange: column-wide / row-wide / end-open reference
  let sheetId: string | undefined;
  if (node.sheetName) {
    if (!ctx.resolveSheetName) return makeError('#REF!');
    const resolved = ctx.resolveSheetName(node.sheetName);
    if (!resolved) return makeError('#REF!');
    sheetId = resolved;
  }
  const bounds = ctx.getSheetBounds ? ctx.getSheetBounds(sheetId) : { rows: 1000, cols: 26 };
  const endCol =
    node.endCol !== null ? node.endCol : bounds.cols > 0 ? bounds.cols - 1 : node.startCol;
  const endRow =
    node.endRow !== null ? node.endRow : bounds.rows > 0 ? bounds.rows - 1 : node.startRow;
  const rows = Math.max(0, endRow - node.startRow + 1);
  const cols = Math.max(0, endCol - node.startCol + 1);
  const { startRow, startCol } = node;
  return makeRangeArg(startRow, startCol, rows, cols, sheetId, () =>
    gridKeys(startRow, startCol, rows, cols, sheetId),
  );
}

/** Reshape a flat row-major key list into a 2D grid of resolved values. */
function keysToGrid(keys: string[], cols: number, resolve: CellValueResolver): FormulaResult[][] {
  if (cols === 0) return [[]];
  const rows = Math.ceil(keys.length / cols);
  const grid: FormulaResult[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < cols; c++) row.push(resolve(keys[r * cols + c]));
    grid.push(row);
  }
  return grid;
}

/** Compute the rectangular shape (and detected sheetId) of a named range from its resolved keys. */
function computeRangeShape(
  keys: string[],
): { startCol: number; startRow: number; rows: number; cols: number; sheetId?: string } | null {
  if (keys.length === 0) return null;
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  let sheetId: string | undefined;
  for (const k of keys) {
    let local = k;
    if (k.includes(':')) {
      const idx = k.indexOf(':');
      sheetId = k.slice(0, idx);
      local = k.slice(idx + 1);
    }
    const { col, row } = parseCellKey(local);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  return {
    startCol: minCol,
    startRow: minRow,
    cols: maxCol - minCol + 1,
    rows: maxRow - minRow + 1,
    sheetId,
  };
}

// ============================================================
// Node evaluation
// ============================================================

function evalNodeInner(node: ASTNode, ctx: FunctionContext): EvalValue {
  switch (node.kind) {
    case 'NumberLiteral':
      return node.value;

    case 'StringLiteral':
      return node.value;

    case 'BooleanLiteral':
      return node.value;

    case 'ErrorLiteral':
      return makeError(node.code);

    case 'EmptyArg':
      return '';

    case 'CellRef':
      return ctx.resolve(node.key);

    case 'SheetCellRef': {
      if (!ctx.resolveSheetName) return makeError('#REF!');
      const sheetId = ctx.resolveSheetName(node.sheetName);
      if (!sheetId) return makeError('#REF!');
      return ctx.resolve(`${sheetId}:${node.key}`);
    }

    case 'RangeRef':
    case 'SheetRangeRef':
    case 'OpenRange': {
      const shape = resolveRangeShape(node, ctx);
      if (isFormulaError(shape)) return shape;
      return { type: 'spill', values: argToGrid(shape, ctx) };
    }

    case 'ArrayLiteral': {
      const values = node.rows.map((row) =>
        row.map((cell) => evalNodeInner(cell, ctx) as FormulaResult),
      );
      return { type: 'spill', values };
    }

    case 'NamedRef': {
      const upperName = node.name.toUpperCase();
      if (ctx.scope && ctx.scope.has(upperName)) {
        return ctx.scope.get(upperName)!;
      }
      if (!ctx.resolveNamedRange) return makeError('#NAME?');
      const resolved = ctx.resolveNamedRange(node.name);
      if (!resolved) return makeError('#NAME?');
      if (resolved.keys.length === 1) {
        return ctx.resolve(resolved.keys[0]);
      }
      const shape = computeRangeShape(resolved.keys);
      if (!shape) return makeError('#NAME?');
      return { type: 'spill', values: keysToGrid(resolved.keys, shape.cols, ctx.resolve) };
    }

    case 'UnaryOp': {
      const val = ctx.evalNode!(node.operand);
      if (isLambdaValue(val)) return makeError('#VALUE!');
      return mapUnary(node.op, val);
    }

    case 'BinaryOp': {
      const leftVal = ctx.evalNode!(node.left);
      const rightVal = ctx.evalNode!(node.right);
      if (isLambdaValue(leftVal) || isLambdaValue(rightVal)) return makeError('#VALUE!');
      return evalBinaryOp(node.op, leftVal, rightVal);
    }

    case 'FunctionCall':
      return evalFunctionCall(node.name, node.args, ctx);
  }
}

function mapUnary(op: '-' | '+' | '%', val: EvalValue): EvalValue {
  if (isSpillResult(val)) {
    return {
      type: 'spill',
      values: val.values.map((row) => row.map((v) => applyUnaryScalar(op, v))),
    };
  }
  return applyUnaryScalar(op, val as FormulaResult);
}

function applyUnaryScalar(op: '-' | '+' | '%', v: FormulaResult): FormulaResult {
  if (isFormulaError(v)) return v;
  const n = toNumber(v);
  if (isFormulaError(n)) return n;
  if (op === '+') return n;
  if (op === '-') return -n;
  return n / 100;
}

function applyBinaryScalar(op: BinaryOperator, a: FormulaResult, b: FormulaResult): FormulaResult {
  if (isFormulaError(a)) return a;
  if (isFormulaError(b)) return b;

  if (op === '&') {
    const at = toText(a);
    if (isFormulaError(at)) return at;
    const bt = toText(b);
    if (isFormulaError(bt)) return bt;
    return at + bt;
  }

  if (op === '>' || op === '<' || op === '>=' || op === '<=' || op === '=' || op === '<>') {
    const cmp = compareValues(a, b);
    switch (op) {
      case '>':
        return cmp > 0;
      case '<':
        return cmp < 0;
      case '>=':
        return cmp >= 0;
      case '<=':
        return cmp <= 0;
      case '=':
        return cmp === 0;
      case '<>':
        return cmp !== 0;
    }
  }

  const an = toNumber(a);
  if (isFormulaError(an)) return an;
  const bn = toNumber(b);
  if (isFormulaError(bn)) return bn;

  switch (op) {
    case '+':
      return an + bn;
    case '-':
      return an - bn;
    case '*':
      return an * bn;
    case '/':
      if (bn === 0) return makeError('#DIV/0!');
      return an / bn;
    case '^': {
      if (an === 0 && bn === 0) return makeError('#NUM!');
      if (an < 0 && !Number.isInteger(bn)) return makeError('#NUM!');
      const result = Math.pow(an, bn);
      if (!isFinite(result)) return makeError('#NUM!');
      return result;
    }
    default:
      return makeError('#VALUE!');
  }
}

interface Shape2D {
  rows: number;
  cols: number;
  get: (r: number, c: number) => FormulaResult;
}

function toShape(v: EvalValue): Shape2D {
  if (isSpillResult(v)) {
    const rows = v.values.length;
    const cols = rows > 0 ? v.values[0].length : 0;
    return { rows, cols, get: (r, c) => v.values[r][c] };
  }
  return { rows: 1, cols: 1, get: () => v as FormulaResult };
}

function pickFromShape(shape: Shape2D, r: number, c: number): FormulaResult {
  let rr: number;
  if (shape.rows === 1) {
    rr = 0;
  } else {
    if (r >= shape.rows) return makeError('#N/A');
    rr = r;
  }
  let cc: number;
  if (shape.cols === 1) {
    cc = 0;
  } else {
    if (c >= shape.cols) return makeError('#N/A');
    cc = c;
  }
  return shape.get(rr, cc);
}

function broadcast2(
  a: EvalValue,
  b: EvalValue,
  fn: (x: FormulaResult, y: FormulaResult) => FormulaResult,
): SpillResult {
  const A = toShape(a);
  const B = toShape(b);
  const rows = Math.max(A.rows, B.rows);
  const cols = Math.max(A.cols, B.cols);
  const values: FormulaResult[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(fn(pickFromShape(A, r, c), pickFromShape(B, r, c)));
    }
    values.push(row);
  }
  return { type: 'spill', values };
}

function evalBinaryOp(op: BinaryOperator, leftVal: EvalValue, rightVal: EvalValue): EvalValue {
  if (isSpillResult(leftVal) || isSpillResult(rightVal)) {
    return broadcast2(leftVal, rightVal, (a, b) => applyBinaryScalar(op, a, b));
  }
  return applyBinaryScalar(op, leftVal as FormulaResult, rightVal as FormulaResult);
}

// ============================================================
// Function argument conversion
// ============================================================

function toArg(argNode: ASTNode, ctx: FunctionContext): FunctionArgValue | FormulaError {
  switch (argNode.kind) {
    case 'EmptyArg':
      return { kind: 'omitted' };

    // A bare cell reference is passed as a 1x1 range so reference-taking functions (OFFSET, ROW, ...)
    // keep its position, and aggregates treat it like Excel does (text in a referenced cell is ignored)
    case 'CellRef': {
      const { col, row } = parseCellKey(argNode.key);
      return { kind: 'range', keys: [argNode.key], rows: 1, cols: 1, startRow: row, startCol: col };
    }
    case 'SheetCellRef': {
      if (!ctx.resolveSheetName) return makeError('#REF!');
      const sheetId = ctx.resolveSheetName(argNode.sheetName);
      if (!sheetId) return makeError('#REF!');
      const { col, row } = parseCellKey(argNode.key);
      return {
        kind: 'range',
        keys: [`${sheetId}:${argNode.key}`],
        rows: 1,
        cols: 1,
        startRow: row,
        startCol: col,
        sheetId,
      };
    }

    case 'RangeRef':
    case 'SheetRangeRef':
    case 'OpenRange': {
      const shape = resolveRangeShape(argNode, ctx);
      if (isFormulaError(shape)) return shape;
      return shape;
    }

    case 'NamedRef': {
      const upperName = argNode.name.toUpperCase();
      if (ctx.scope && ctx.scope.has(upperName)) {
        return classifyEvalValue(ctx.scope.get(upperName)!);
      }
      if (!ctx.resolveNamedRange) return makeError('#NAME?');
      const resolved = ctx.resolveNamedRange(argNode.name);
      if (!resolved) return makeError('#NAME?');
      const shape = computeRangeShape(resolved.keys);
      if (!shape) return makeError('#NAME?');
      return {
        kind: 'range',
        keys: resolved.keys,
        rows: shape.rows,
        cols: shape.cols,
        startRow: shape.startRow,
        startCol: shape.startCol,
        sheetId: resolved.sheetId,
      };
    }

    default: {
      const v = ctx.evalNode!(argNode);
      return classifyEvalValue(v);
    }
  }
}

function classifyEvalValue(v: EvalValue): FunctionArgValue {
  if (isLambdaValue(v)) return { kind: 'lambda', lambda: v };
  if (isSpillResult(v)) {
    if (v.values.length === 1 && v.values[0].length === 1) {
      return { kind: 'value', value: v.values[0][0] };
    }
    return { kind: 'array', values: v.values };
  }
  return { kind: 'value', value: v };
}

// ============================================================
// Function call evaluation, incl. lift (scalar broadcast) handling
// ============================================================

function argShapeForLift(arg: FunctionArgValue): { rows: number; cols: number } | null {
  if (arg.kind === 'range') {
    if (arg.rows === 1 && arg.cols === 1) return null;
    return { rows: arg.rows, cols: arg.cols };
  }
  if (arg.kind === 'array') {
    const rows = arg.values.length;
    const cols = rows > 0 ? arg.values[0].length : 0;
    if (rows === 1 && cols === 1) return null;
    return { rows, cols };
  }
  return null;
}

function argElementAt(
  arg: FunctionArgValue,
  r: number,
  c: number,
  ctx: FunctionContext,
): FunctionArgValue {
  if (arg.kind === 'range') {
    const rr = arg.rows === 1 ? 0 : r;
    const cc = arg.cols === 1 ? 0 : c;
    if (rr >= arg.rows || cc >= arg.cols) return { kind: 'value', value: makeError('#N/A') };
    return { kind: 'value', value: ctx.resolve(arg.keys[rr * arg.cols + cc]) };
  }
  if (arg.kind === 'array') {
    const rows = arg.values.length;
    const cols = rows > 0 ? arg.values[0].length : 0;
    const rr = rows === 1 ? 0 : r;
    const cc = cols === 1 ? 0 : c;
    if (rr >= rows || cc >= cols) return { kind: 'value', value: makeError('#N/A') };
    return { kind: 'value', value: arg.values[rr][cc] };
  }
  return arg;
}

function normalizeImplResult(result: FunctionReturnValue): FormulaResult | SpillResult {
  if (isSpillResult(result) && result.values.length === 1 && result.values[0].length === 1) {
    return result.values[0][0];
  }
  return result;
}

function evalLifted(
  args: FunctionArgValue[],
  liftExclude: number[] | undefined,
  ctx: FunctionContext,
  impl: (args: FunctionArgValue[], ctx: FunctionContext) => FunctionReturnValue,
): FunctionReturnValue {
  const exclude = new Set(liftExclude ?? []);
  let rows = 1;
  let cols = 1;
  let any = false;
  args.forEach((arg, i) => {
    if (exclude.has(i)) return;
    const shape = argShapeForLift(arg);
    if (shape) {
      any = true;
      rows = Math.max(rows, shape.rows);
      cols = Math.max(cols, shape.cols);
    }
  });

  if (!any) {
    return normalizeImplResult(impl(args, ctx));
  }

  const values: FormulaResult[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < cols; c++) {
      const cellArgs = args.map((arg, i) => (exclude.has(i) ? arg : argElementAt(arg, r, c, ctx)));
      const cellResult = impl(cellArgs, ctx);
      row.push(
        isSpillResult(cellResult)
          ? (cellResult.values[0]?.[0] ?? makeError('#VALUE!'))
          : cellResult,
      );
    }
    values.push(row);
  }
  return { type: 'spill', values };
}

function evalFunctionCall(name: string, argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
  const registry = getFunctionRegistry();
  const fn = registry.get(name);

  if (!fn) {
    if (ctx.scope && ctx.scope.has(name)) {
      const v = ctx.scope.get(name)!;
      if (isLambdaValue(v)) {
        const argVals = argNodes.map((a) => ctx.evalNode!(a));
        return ctx.callLambda!(v, argVals);
      }
    }
    return makeError('#NAME?');
  }

  if (fn.special) {
    return fn.special(argNodes, ctx);
  }

  const args: FunctionArgValue[] = [];
  for (const argNode of argNodes) {
    const converted = toArg(argNode, ctx);
    if (isFormulaError(converted)) return converted;
    args.push(converted);
  }

  const memoKey = fn.volatile || NON_MEMOIZABLE.has(name) ? null : callMemoKey(name, args, ctx);
  if (memoKey !== null) {
    const hit = ctx.callCache!.get(memoKey);
    if (hit !== undefined) {
      if (ctx.passStats) ctx.passStats.callHits++;
      return hit;
    }
  }

  const result = fn.lift
    ? evalLifted(args, fn.liftExclude, ctx, fn.impl)
    : normalizeImplResult(fn.impl(args, ctx));
  if (memoKey !== null) {
    ctx.callCache!.set(memoKey, result);
    if (ctx.passStats) ctx.passStats.callMisses++;
  }
  return result;
}

/** Functions with side effects that must run for every calling cell (special forms and volatiles are excluded separately). */
export const NON_MEMOIZABLE: ReadonlySet<string> = new Set(['HYPERLINK']);

/** Ranges up to this size are keyed by their resolved values; larger ones by geometry (see rangeCacheKey). */
const MEMO_INLINE_RANGE_MAX = 16;

/**
 * Memo key for a pure function call, or null when the call must not be memoized (no cache, or an
 * argument without a cheap stable identity such as a computed array or a lambda).
 */
function callMemoKey(name: string, args: FunctionArgValue[], ctx: FunctionContext): string | null {
  if (!ctx.callCache) return null;
  let key = name;
  for (const arg of args) {
    switch (arg.kind) {
      case 'value': {
        const v = arg.value;
        key += isFormulaError(v)
          ? `|e${v.code}`
          : `|${typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's'}${String(v)}`;
        break;
      }
      case 'omitted':
        key += '|o';
        break;
      case 'range': {
        if (arg.rows * arg.cols >= MEMO_INLINE_RANGE_MAX) {
          key += `|R${rangeCacheKey(arg, ctx)}`;
        } else {
          key += '|r' + arg.rows + 'x' + arg.cols;
          for (const row of argToGrid(arg, ctx)) {
            for (const v of row)
              key += isFormulaError(v)
                ? `,e${v.code}`
                : `,${typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's'}${String(v)}`;
          }
        }
        break;
      }
      default:
        return null; // array / lambda
    }
  }
  return key;
}

// ============================================================
// Dependency extraction
// ============================================================

export interface RangeRefInfo {
  sheetId?: string; // undefined = the sheet the formula lives on
  startCol: number;
  startRow: number;
  endCol: number | null;
  endRow: number | null; // null = to the end of the used range
}

export interface ExtractedReferences {
  cells: string[];
  ranges: RangeRefInfo[];
  volatile: boolean;
}

/**
 * Extract all cell/range references (and volatility) from an AST, without expanding ranges.
 */
export function extractReferences(
  node: ASTNode,
  resolveSheetName?: SheetNameResolver,
  resolveNamedRange?: NamedRangeResolver,
): ExtractedReferences {
  const cells = new Set<string>();
  const ranges: RangeRefInfo[] = [];
  let volatile = false;
  const registry = getFunctionRegistry();

  function visit(n: ASTNode): void {
    switch (n.kind) {
      case 'CellRef':
        cells.add(n.key);
        break;
      case 'SheetCellRef': {
        if (resolveSheetName) {
          const sheetId = resolveSheetName(n.sheetName);
          if (sheetId) cells.add(`${sheetId}:${n.key}`);
        }
        break;
      }
      case 'RangeRef': {
        const s = parseCellKey(n.start);
        const e = parseCellKey(n.end);
        ranges.push({
          startCol: Math.min(s.col, e.col),
          startRow: Math.min(s.row, e.row),
          endCol: Math.max(s.col, e.col),
          endRow: Math.max(s.row, e.row),
        });
        break;
      }
      case 'SheetRangeRef': {
        if (resolveSheetName) {
          const sheetId = resolveSheetName(n.sheetName);
          if (sheetId) {
            const s = parseCellKey(n.start);
            const e = parseCellKey(n.end);
            ranges.push({
              sheetId,
              startCol: Math.min(s.col, e.col),
              startRow: Math.min(s.row, e.row),
              endCol: Math.max(s.col, e.col),
              endRow: Math.max(s.row, e.row),
            });
          }
        }
        break;
      }
      case 'OpenRange': {
        let sheetId: string | undefined;
        if (n.sheetName) {
          if (!resolveSheetName) break;
          const resolved = resolveSheetName(n.sheetName);
          if (!resolved) break;
          sheetId = resolved;
        }
        ranges.push({
          sheetId,
          startCol: n.startCol,
          startRow: n.startRow,
          endCol: n.endCol,
          endRow: n.endRow,
        });
        break;
      }
      case 'NamedRef': {
        if (resolveNamedRange) {
          const resolved = resolveNamedRange(n.name);
          if (resolved) {
            const shape = computeRangeShape(resolved.keys);
            if (shape) {
              ranges.push({
                sheetId: shape.sheetId,
                startCol: shape.startCol,
                startRow: shape.startRow,
                endCol: shape.startCol + shape.cols - 1,
                endRow: shape.startRow + shape.rows - 1,
              });
            }
          }
        }
        break;
      }
      case 'BinaryOp':
        visit(n.left);
        visit(n.right);
        break;
      case 'UnaryOp':
        visit(n.operand);
        break;
      case 'ArrayLiteral':
        for (const row of n.rows) {
          for (const el of row) visit(el);
        }
        break;
      case 'FunctionCall': {
        const fn = registry.get(n.name);
        if (fn?.volatile) volatile = true;
        for (const arg of n.args) visit(arg);
        break;
      }
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'ErrorLiteral':
      case 'EmptyArg':
        break;
    }
  }

  visit(node);
  return { cells: Array.from(cells), ranges, volatile };
}

/**
 * Extract all cell reference keys from an AST (for dependency tracking).
 * Returns both local and global (sheetId:cellKey) references, with range
 * references expanded into individual cell keys via expandRange (open-ended
 * ranges are ignored, since they have no fixed extent).
 */
export function extractDependencies(
  node: ASTNode,
  expandRange: RangeExpander,
  resolveSheetName?: SheetNameResolver,
  resolveNamedRange?: NamedRangeResolver,
): string[] {
  const refs = extractReferences(node, resolveSheetName, resolveNamedRange);
  const deps = new Set<string>(refs.cells);
  for (const r of refs.ranges) {
    if (r.endCol === null || r.endRow === null) continue;
    const startKey = `${colIndexToLetter(r.startCol)}${r.startRow + 1}`;
    const endKey = `${colIndexToLetter(r.endCol)}${r.endRow + 1}`;
    const keys = expandRange(startKey, endKey);
    for (const k of keys) {
      deps.add(r.sheetId ? `${r.sheetId}:${k}` : k);
    }
  }
  return Array.from(deps);
}
