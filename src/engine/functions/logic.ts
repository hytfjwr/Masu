import type {
  ASTNode,
  EvalValue,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
  LambdaValue,
  SpillResult,
} from '../types';
import { isFormulaError, isLambdaValue, isSpillResult, makeError } from '../types';
import { toBoolean, toNumber, valuesEqual } from '../coerce';
import { argToFlat, resolveScalar } from './helpers';

// ============================================================
// Shared shape helpers for special forms (IF broadcast, MAP/REDUCE/etc.)
// ============================================================

interface Shape2D {
  rows: number;
  cols: number;
  at: (r: number, c: number) => FormulaResult;
}

function shapeOf(v: EvalValue): Shape2D {
  if (isSpillResult(v)) {
    const rows = v.values.length;
    const cols = rows > 0 ? v.values[0].length : 0;
    return { rows, cols, at: (r, c) => v.values[r][c] };
  }
  return { rows: 1, cols: 1, at: () => v as FormulaResult };
}

function pick(shape: Shape2D, r: number, c: number): FormulaResult {
  const rr = shape.rows === 1 ? 0 : r;
  const cc = shape.cols === 1 ? 0 : c;
  if (rr >= shape.rows || cc >= shape.cols) return makeError('#N/A');
  return shape.at(rr, cc);
}

/** Reduce a lambda/function call result down to a single scalar (top-left element for arrays). */
function asScalar(v: EvalValue): FormulaResult {
  if (isLambdaValue(v)) return makeError('#VALUE!');
  if (isSpillResult(v)) return v.values[0]?.[0] ?? makeError('#VALUE!');
  return v;
}

function broadcastIf(cond: SpillResult, thenVal: EvalValue, elseVal: EvalValue): SpillResult {
  const C = shapeOf(cond);
  const T = shapeOf(thenVal);
  const E = shapeOf(elseVal);
  const rows = Math.max(C.rows, T.rows, E.rows);
  const cols = Math.max(C.cols, T.cols, E.cols);
  const values: FormulaResult[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < cols; c++) {
      const cv = pick(C, r, c);
      if (isFormulaError(cv)) {
        row.push(cv);
        continue;
      }
      const b = toBoolean(cv);
      row.push(isFormulaError(b) ? b : b ? pick(T, r, c) : pick(E, r, c));
    }
    values.push(row);
  }
  return { type: 'spill', values };
}

// ============================================================
// IF
// ============================================================
const IF: FunctionMeta = {
  name: 'IF',
  signature: 'IF(logical_test, [value_if_true], [value_if_false])',
  description: '条件を判定し、真偽に応じて異なる値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 1 || argNodes.length > 3) return makeError('#VALUE!');
    const condVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(condVal)) return makeError('#VALUE!');

    const thenNode = argNodes[1];
    const elseNode = argNodes[2];

    if (isSpillResult(condVal)) {
      const thenVal: EvalValue =
        thenNode === undefined ? false : thenNode.kind === 'EmptyArg' ? 0 : ctx.evalNode!(thenNode);
      const elseVal: EvalValue =
        elseNode === undefined ? false : elseNode.kind === 'EmptyArg' ? 0 : ctx.evalNode!(elseNode);
      if (isLambdaValue(thenVal) || isLambdaValue(elseVal)) return makeError('#VALUE!');
      return broadcastIf(condVal, thenVal, elseVal);
    }

    const cond = toBoolean(condVal as FormulaResult);
    if (isFormulaError(cond)) return cond;

    if (cond) {
      if (thenNode === undefined) return false;
      if (thenNode.kind === 'EmptyArg') return 0;
      return ctx.evalNode!(thenNode);
    }
    if (elseNode === undefined) return false;
    if (elseNode.kind === 'EmptyArg') return 0;
    return ctx.evalNode!(elseNode);
  },
};

// ============================================================
// IFERROR / IFNA
// ============================================================
const IFERROR: FunctionMeta = {
  name: 'IFERROR',
  signature: 'IFERROR(value, value_if_error)',
  description: 'エラーの場合に代替値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 2) return makeError('#VALUE!');
    const val = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(val)) return makeError('#VALUE!');
    if (isSpillResult(val)) {
      if (!val.values.some((row) => row.some(isFormulaError))) return val;
      const fallback = asScalar(ctx.evalNode!(argNodes[1]));
      return {
        type: 'spill',
        values: val.values.map((row) => row.map((v) => (isFormulaError(v) ? fallback : v))),
      };
    }
    if (isFormulaError(val)) return ctx.evalNode!(argNodes[1]);
    return val;
  },
};

const IFNA: FunctionMeta = {
  name: 'IFNA',
  signature: 'IFNA(value, value_if_na)',
  description: '#N/A エラーの場合に代替値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 2) return makeError('#VALUE!');
    const val = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(val)) return makeError('#VALUE!');
    const isNA = (v: FormulaResult) => isFormulaError(v) && v.code === '#N/A';
    if (isSpillResult(val)) {
      if (!val.values.some((row) => row.some(isNA))) return val;
      const fallback = asScalar(ctx.evalNode!(argNodes[1]));
      return {
        type: 'spill',
        values: val.values.map((row) => row.map((v) => (isNA(v) ? fallback : v))),
      };
    }
    if (isNA(val as FormulaResult)) return ctx.evalNode!(argNodes[1]);
    return val;
  },
};

// ============================================================
// IFS
// ============================================================
const IFS: FunctionMeta = {
  name: 'IFS',
  signature: 'IFS(condition1, value1, [condition2, value2], ...)',
  description: '最初に真となる条件に対応する値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 2 || argNodes.length % 2 !== 0) return makeError('#VALUE!');
    for (let i = 0; i < argNodes.length; i += 2) {
      const condVal = ctx.evalNode!(argNodes[i]);
      if (isLambdaValue(condVal) || isSpillResult(condVal)) return makeError('#VALUE!');
      const cond = toBoolean(condVal);
      if (isFormulaError(cond)) return cond;
      if (cond) return ctx.evalNode!(argNodes[i + 1]);
    }
    return makeError('#N/A');
  },
};

// ============================================================
// SWITCH
// ============================================================
const SWITCH: FunctionMeta = {
  name: 'SWITCH',
  signature: 'SWITCH(expression, case1, value1, [case2, value2], ..., [default])',
  description: '式の値に一致するケースに対応する値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 2) return makeError('#VALUE!');
    const exprVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(exprVal) || isSpillResult(exprVal)) return makeError('#VALUE!');

    let i = 1;
    while (i + 1 < argNodes.length) {
      const caseVal = ctx.evalNode!(argNodes[i]);
      if (!isLambdaValue(caseVal) && !isSpillResult(caseVal) && valuesEqual(exprVal, caseVal)) {
        return ctx.evalNode!(argNodes[i + 1]);
      }
      i += 2;
    }
    if (i < argNodes.length) return ctx.evalNode!(argNodes[i]);
    return makeError('#N/A');
  },
};

// ============================================================
// CHOOSE
// ============================================================
const CHOOSE: FunctionMeta = {
  name: 'CHOOSE',
  signature: 'CHOOSE(index_num, value1, [value2], ...)',
  description: '指定した位置の値を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 2) return makeError('#VALUE!');
    const idxVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(idxVal) || isSpillResult(idxVal)) return makeError('#VALUE!');
    const n = toNumber(idxVal);
    if (isFormulaError(n)) return n;
    const idx = Math.trunc(n);
    if (idx < 1 || idx > argNodes.length - 1) return makeError('#VALUE!');
    return ctx.evalNode!(argNodes[idx]);
  },
};

// ============================================================
// LET
// ============================================================
const LET: FunctionMeta = {
  name: 'LET',
  signature: 'LET(name1, value1, [name2, value2, ...], calculation)',
  description: '中間計算に名前を付けて再利用します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 3 || argNodes.length % 2 === 0) return makeError('#VALUE!');
    let scope = new Map(ctx.scope ?? []);
    for (let i = 0; i + 1 < argNodes.length - 1; i += 2) {
      const nameNode = argNodes[i];
      if (nameNode.kind !== 'NamedRef') return makeError('#VALUE!');
      const name = nameNode.name.toUpperCase();
      const val = ctx.evalNode!(argNodes[i + 1], scope);
      scope = new Map(scope);
      scope.set(name, val);
    }
    const calc = argNodes[argNodes.length - 1];
    return ctx.evalNode!(calc, scope);
  },
};

// ============================================================
// LAMBDA
// ============================================================
const LAMBDA: FunctionMeta = {
  name: 'LAMBDA',
  signature: 'LAMBDA(param1, [param2, ...], body)',
  description: '再利用可能なカスタム関数を定義します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 1) return makeError('#VALUE!');
    const paramNodes = argNodes.slice(0, -1);
    const body = argNodes[argNodes.length - 1];
    const params: string[] = [];
    for (const pn of paramNodes) {
      if (pn.kind !== 'NamedRef') return makeError('#VALUE!');
      params.push(pn.name.toUpperCase());
    }
    const lambda: LambdaValue = { type: 'lambda', params, body, closure: new Map(ctx.scope ?? []) };
    return lambda;
  },
};

// ============================================================
// MAP
// ============================================================
const MAP: FunctionMeta = {
  name: 'MAP',
  signature: 'MAP(array1, [array2, ...], lambda)',
  description: '配列の各要素にラムダ関数を適用します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length < 2) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[argNodes.length - 1]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const arrays = argNodes.slice(0, -1).map((n) => ctx.evalNode!(n));
    if (arrays.some(isLambdaValue)) return makeError('#VALUE!');
    const shapes = arrays.map(shapeOf);
    const rows = shapes[0].rows;
    const cols = shapes[0].cols;
    if (shapes.some((s) => s.rows !== rows || s.cols !== cols)) return makeError('#VALUE!');

    const values: FormulaResult[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < cols; c++) {
        const callArgs = shapes.map((s) => pick(s, r, c));
        row.push(asScalar(ctx.callLambda!(lambdaVal, callArgs)));
      }
      values.push(row);
    }
    return { type: 'spill', values };
  },
};

// ============================================================
// REDUCE
// ============================================================
const REDUCE: FunctionMeta = {
  name: 'REDUCE',
  signature: 'REDUCE(initial_value, array, lambda)',
  description: '配列を1つの値に集約します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 3) return makeError('#VALUE!');
    const initial = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(initial)) return makeError('#VALUE!');
    const arrVal = ctx.evalNode!(argNodes[1]);
    if (isLambdaValue(arrVal)) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[2]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const shape = shapeOf(arrVal);
    let acc: EvalValue = initial;
    for (let r = 0; r < shape.rows; r++) {
      for (let c = 0; c < shape.cols; c++) {
        acc = ctx.callLambda!(lambdaVal, [acc, pick(shape, r, c)]);
      }
    }
    return acc;
  },
};

// ============================================================
// SCAN
// ============================================================
const SCAN: FunctionMeta = {
  name: 'SCAN',
  signature: 'SCAN(initial_value, array, lambda)',
  description: '配列を走査しながら累積結果の配列を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 3) return makeError('#VALUE!');
    const initial = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(initial)) return makeError('#VALUE!');
    const arrVal = ctx.evalNode!(argNodes[1]);
    if (isLambdaValue(arrVal)) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[2]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const shape = shapeOf(arrVal);
    let acc: EvalValue = initial;
    const values: FormulaResult[][] = [];
    for (let r = 0; r < shape.rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < shape.cols; c++) {
        acc = ctx.callLambda!(lambdaVal, [acc, pick(shape, r, c)]);
        row.push(asScalar(acc));
      }
      values.push(row);
    }
    return { type: 'spill', values };
  },
};

// ============================================================
// BYROW / BYCOL
// ============================================================
const BYROW: FunctionMeta = {
  name: 'BYROW',
  signature: 'BYROW(array, lambda)',
  description: '各行にラムダ関数を適用した結果の列ベクトルを返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 2) return makeError('#VALUE!');
    const arrVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(arrVal)) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[1]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const shape = shapeOf(arrVal);
    const values: FormulaResult[][] = [];
    for (let r = 0; r < shape.rows; r++) {
      const rowArr: FormulaResult[] = [];
      for (let c = 0; c < shape.cols; c++) rowArr.push(pick(shape, r, c));
      const rowSpill: SpillResult = { type: 'spill', values: [rowArr] };
      values.push([asScalar(ctx.callLambda!(lambdaVal, [rowSpill]))]);
    }
    return { type: 'spill', values };
  },
};

const BYCOL: FunctionMeta = {
  name: 'BYCOL',
  signature: 'BYCOL(array, lambda)',
  description: '各列にラムダ関数を適用した結果の行ベクトルを返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 2) return makeError('#VALUE!');
    const arrVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(arrVal)) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[1]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const shape = shapeOf(arrVal);
    const row: FormulaResult[] = [];
    for (let c = 0; c < shape.cols; c++) {
      const colArr: FormulaResult[][] = [];
      for (let r = 0; r < shape.rows; r++) colArr.push([pick(shape, r, c)]);
      const colSpill: SpillResult = { type: 'spill', values: colArr };
      row.push(asScalar(ctx.callLambda!(lambdaVal, [colSpill])));
    }
    return { type: 'spill', values: [row] };
  },
};

// ============================================================
// MAKEARRAY
// ============================================================
const MAKEARRAY: FunctionMeta = {
  name: 'MAKEARRAY',
  signature: 'MAKEARRAY(rows, columns, lambda)',
  description: '行番号・列番号からラムダ関数で配列を生成します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    if (argNodes.length !== 3) return makeError('#VALUE!');
    const rowsVal = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(rowsVal) || isSpillResult(rowsVal)) return makeError('#VALUE!');
    const colsVal = ctx.evalNode!(argNodes[1]);
    if (isLambdaValue(colsVal) || isSpillResult(colsVal)) return makeError('#VALUE!');
    const lambdaVal = ctx.evalNode!(argNodes[2]);
    if (!isLambdaValue(lambdaVal)) return makeError('#VALUE!');

    const rn = toNumber(rowsVal);
    if (isFormulaError(rn)) return rn;
    const cn = toNumber(colsVal);
    if (isFormulaError(cn)) return cn;
    const rows = Math.trunc(rn);
    const cols = Math.trunc(cn);
    if (rows < 1 || cols < 1) return makeError('#VALUE!');

    const values: FormulaResult[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(asScalar(ctx.callLambda!(lambdaVal, [r + 1, c + 1])));
      }
      values.push(row);
    }
    return { type: 'spill', values };
  },
};

// ============================================================
// AND / OR / NOT / XOR / TRUE / FALSE
// ============================================================
const AND: FunctionMeta = {
  name: 'AND',
  signature: 'AND(logical1, [logical2], ...)',
  description: 'Returns TRUE if all arguments are TRUE',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    for (const arg of args) {
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (typeof val === 'string' && val === '') continue;
          const b = toBoolean(val);
          if (isFormulaError(b)) return b;
          if (!b) return false;
        }
      } else {
        const val = resolveScalar(arg, ctx);
        if (isFormulaError(val)) return val;
        const b = toBoolean(val);
        if (isFormulaError(b)) return b;
        if (!b) return false;
      }
    }
    return true;
  },
};

const OR: FunctionMeta = {
  name: 'OR',
  signature: 'OR(logical1, [logical2], ...)',
  description: 'Returns TRUE if any argument is TRUE',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    for (const arg of args) {
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (typeof val === 'string' && val === '') continue;
          const b = toBoolean(val);
          if (isFormulaError(b)) return b;
          if (b) return true;
        }
      } else {
        const val = resolveScalar(arg, ctx);
        if (isFormulaError(val)) return val;
        const b = toBoolean(val);
        if (isFormulaError(b)) return b;
        if (b) return true;
      }
    }
    return false;
  },
};

const NOT: FunctionMeta = {
  name: 'NOT',
  signature: 'NOT(logical)',
  description: 'Reverses the logic of its argument',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    const b = toBoolean(val);
    if (isFormulaError(b)) return b;
    return !b;
  },
};

const XOR: FunctionMeta = {
  name: 'XOR',
  signature: 'XOR(logical1, [logical2], ...)',
  description: '奇数個の引数が TRUE のとき TRUE を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    let count = 0;
    for (const arg of args) {
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (typeof val === 'string' && val === '') continue;
          const b = toBoolean(val);
          if (isFormulaError(b)) return b;
          if (b) count++;
        }
      } else {
        const val = resolveScalar(arg, ctx);
        if (isFormulaError(val)) return val;
        const b = toBoolean(val);
        if (isFormulaError(b)) return b;
        if (b) count++;
      }
    }
    return count % 2 === 1;
  },
};

const TRUE_FN: FunctionMeta = {
  name: 'TRUE',
  signature: 'TRUE()',
  description: '論理値 TRUE を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return true;
  },
};

const FALSE_FN: FunctionMeta = {
  name: 'FALSE',
  signature: 'FALSE()',
  description: '論理値 FALSE を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return false;
  },
};

export const logicFunctions: FunctionMeta[] = [
  IF,
  IFERROR,
  IFNA,
  IFS,
  SWITCH,
  CHOOSE,
  LET,
  LAMBDA,
  MAP,
  REDUCE,
  SCAN,
  BYROW,
  BYCOL,
  MAKEARRAY,
  AND,
  OR,
  NOT,
  XOR,
  TRUE_FN,
  FALSE_FN,
];
