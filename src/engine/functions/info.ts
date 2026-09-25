import type { FormulaResult, FunctionArgValue, FunctionContext, FunctionMeta } from '../types';
import { isFormulaError, makeError } from '../types';
import { argDims, resolveScalar } from './helpers';

/** Excel/Sheets treat an empty string the same as an empty cell (blank cells resolve to ''). */
function isTextValue(v: FormulaResult): boolean {
  return typeof v === 'string' && v !== '';
}

// ============================================================
// ISBLANK / ISNUMBER / ISTEXT / ISNONTEXT / ISLOGICAL
// ============================================================
const ISBLANK: FunctionMeta = {
  name: 'ISBLANK',
  signature: 'ISBLANK(value)',
  description: '値が空白の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return val === '';
  },
};

const ISNUMBER: FunctionMeta = {
  name: 'ISNUMBER',
  signature: 'ISNUMBER(value)',
  description: '値が数値の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return typeof val === 'number';
  },
};

const ISTEXT: FunctionMeta = {
  name: 'ISTEXT',
  signature: 'ISTEXT(value)',
  description: '値が文字列の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return isTextValue(val);
  },
};

const ISNONTEXT: FunctionMeta = {
  name: 'ISNONTEXT',
  signature: 'ISNONTEXT(value)',
  description: '値が文字列ではない場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return !isTextValue(val);
  },
};

const ISLOGICAL: FunctionMeta = {
  name: 'ISLOGICAL',
  signature: 'ISLOGICAL(value)',
  description: '値が論理値の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return typeof val === 'boolean';
  },
};

// ============================================================
// ISERROR / ISERR / ISNA
// 既定のエラー伝播に頼らず、引数がエラーでもエラーを返さず判定する。
// ============================================================
const ISERROR: FunctionMeta = {
  name: 'ISERROR',
  signature: 'ISERROR(value)',
  description: '値がエラーの場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return isFormulaError(val);
  },
};

const ISERR: FunctionMeta = {
  name: 'ISERR',
  signature: 'ISERR(value)',
  description: '値が#N/A以外のエラーの場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return isFormulaError(val) && val.code !== '#N/A';
  },
};

const ISNA: FunctionMeta = {
  name: 'ISNA',
  signature: 'ISNA(value)',
  description: '値が#N/Aエラーの場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    return isFormulaError(val) && val.code === '#N/A';
  },
};

// ============================================================
// N / NA
// ============================================================
const N: FunctionMeta = {
  name: 'N',
  signature: 'N(value)',
  description: '値を数値に変換します（数値はそのまま、TRUE は 1、エラーはそのまま、それ以外は 0）',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val; // Excel propagates errors through N()
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 1 : 0;
    return 0;
  },
};

const NA: FunctionMeta = {
  name: 'NA',
  signature: 'NA()',
  description: '#N/Aエラー値を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return makeError('#N/A');
  },
};

// ============================================================
// TYPE (lift なし: 範囲・配列そのものを判定するため)
// ============================================================
const TYPE: FunctionMeta = {
  name: 'TYPE',
  signature: 'TYPE(value)',
  description: '値のデータ型を表す数値を返します(数値1, 文字列2, 論理値4, エラー16, 配列64)',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const arg = args[0];
    const { rows, cols } = argDims(arg);
    if (rows * cols > 1) return 64;

    const val = resolveScalar(arg, ctx);
    if (isFormulaError(val)) return 16;
    if (typeof val === 'number') return 1;
    if (typeof val === 'string') return 2;
    if (typeof val === 'boolean') return 4;
    return 64;
  },
};

// ============================================================
// ERROR.TYPE
// ============================================================
const ERROR_TYPE_CODE_MAP: Record<string, number> = {
  '#NULL!': 1,
  '#DIV/0!': 2,
  '#VALUE!': 3,
  '#REF!': 4,
  '#NAME?': 5,
  '#NUM!': 6,
  '#N/A': 7,
};

const ERROR_TYPE: FunctionMeta = {
  name: 'ERROR.TYPE',
  signature: 'ERROR.TYPE(error_val)',
  description: 'エラーの種類を表す数値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (!isFormulaError(val)) return makeError('#N/A');
    return ERROR_TYPE_CODE_MAP[val.code] ?? 8;
  },
};

export const infoFunctions: FunctionMeta[] = [
  ISBLANK, ISNUMBER, ISTEXT, ISNONTEXT, ISLOGICAL,
  ISERROR, ISERR, ISNA,
  N, NA, TYPE, ERROR_TYPE,
];
