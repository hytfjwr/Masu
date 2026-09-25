import type {
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
  FunctionReturnValue,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { toBoolean } from '../coerce';
import {
  argToFlat,
  makeSpill,
  parseCriteria,
  resolveNumber,
  resolveNumericArgs,
  resolveScalar,
} from './helpers';
import { RANK, STDEV, VAR_FN } from './math';

/** Register an existing FunctionMeta under an additional name (e.g. the Excel dotted variant). */
function withName(base: FunctionMeta, name: string): FunctionMeta {
  return { ...base, name };
}

// ============================================================
// MEDIAN
// ============================================================
const MEDIAN: FunctionMeta = {
  name: 'MEDIAN',
  signature: 'MEDIAN(number1, [number2], ...)',
  description: '引数の中央値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#NUM!');
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
};

// ============================================================
// MODE / MODE.SNGL / MODE.MULT
// ============================================================
const MODE: FunctionMeta = {
  name: 'MODE',
  signature: 'MODE(number1, [number2], ...)',
  description: '最も頻繁に出現する値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const freq = new Map<number, number>();
    for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
    let best: number | null = null;
    let bestCount = 0;
    for (const n of nums) {
      const c = freq.get(n)!;
      if (c > 1 && c > bestCount) {
        bestCount = c;
        best = n;
      }
    }
    if (best === null) return makeError('#N/A');
    return best;
  },
};

const MODE_MULT: FunctionMeta = {
  name: 'MODE.MULT',
  signature: 'MODE.MULT(number1, [number2], ...)',
  description: '最も頻繁に出現する値をすべて縦方向の配列で返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const freq = new Map<number, number>();
    for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
    let maxCount = 0;
    for (const c of freq.values()) maxCount = Math.max(maxCount, c);
    if (maxCount <= 1) return makeError('#N/A');
    const modes: number[] = [];
    const seen = new Set<number>();
    for (const n of nums) {
      if (freq.get(n) === maxCount && !seen.has(n)) {
        seen.add(n);
        modes.push(n);
      }
    }
    return makeSpill(modes.map(m => [m as FormulaResult]));
  },
};

// ============================================================
// STDEV.P / STDEVP, VAR.P / VARP, and the STDEV.S / VAR.S / RANK.EQ / MODE.SNGL aliases
// ============================================================
const STDEVP: FunctionMeta = {
  name: 'STDEVP',
  signature: 'STDEVP(number1, [number2], ...)',
  description: '母標準偏差を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
  },
};

const VARP: FunctionMeta = {
  name: 'VARP',
  signature: 'VARP(number1, [number2], ...)',
  description: '母分散を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  },
};

const STDEV_S = withName(STDEV, 'STDEV.S');
const STDEV_P = withName(STDEVP, 'STDEV.P');
const VAR_S = withName(VAR_FN, 'VAR.S');
const VAR_P = withName(VARP, 'VAR.P');
const RANK_EQ = withName(RANK, 'RANK.EQ');
const MODE_SNGL = withName(MODE, 'MODE.SNGL');

// ============================================================
// STDEVA / VARA (text -> 0, TRUE -> 1, FALSE -> 0, blanks excluded)
// ============================================================
function collectAValues(args: FunctionArgValue[], ctx: FunctionContext): number[] | FormulaError {
  const result: number[] = [];
  for (const arg of args) {
    if (arg.kind === 'range' || arg.kind === 'array') {
      for (const val of argToFlat(arg, ctx)) {
        if (isFormulaError(val)) return val;
        if (val === '') continue;
        if (typeof val === 'number') result.push(val);
        else if (typeof val === 'boolean') result.push(val ? 1 : 0);
        else result.push(0);
      }
    } else {
      const val = resolveScalar(arg, ctx);
      if (isFormulaError(val)) return val;
      if (val === '') continue;
      if (typeof val === 'number') result.push(val);
      else if (typeof val === 'boolean') result.push(val ? 1 : 0);
      else result.push(0);
    }
  }
  return result;
}

const STDEVA: FunctionMeta = {
  name: 'STDEVA',
  signature: 'STDEVA(value1, [value2], ...)',
  description: '文字列をTRUE=1、FALSE=0、テキスト=0として数えた標本標準偏差を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = collectAValues(args, ctx);
    if (isFormulaError(nums)) return nums;
    if (nums.length <= 1) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
    return Math.sqrt(variance);
  },
};

const VARA: FunctionMeta = {
  name: 'VARA',
  signature: 'VARA(value1, [value2], ...)',
  description: '文字列をTRUE=1、FALSE=0、テキスト=0として数えた標本分散を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = collectAValues(args, ctx);
    if (isFormulaError(nums)) return nums;
    if (nums.length <= 1) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
  },
};

const AVERAGEA: FunctionMeta = {
  name: 'AVERAGEA',
  signature: 'AVERAGEA(value1, [value2], ...)',
  description: '文字列をTRUE=1、FALSE=0、テキスト=0として数えた平均を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = collectAValues(args, ctx);
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    return nums.reduce((s, n) => s + n, 0) / nums.length;
  },
};

const MAXA: FunctionMeta = {
  name: 'MAXA',
  signature: 'MAXA(value1, [value2], ...)',
  description: '文字列をTRUE=1、FALSE=0、テキスト=0として数えた最大値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = collectAValues(args, ctx);
    if (isFormulaError(nums)) return nums;
    return nums.length === 0 ? 0 : Math.max(...nums);
  },
};

const MINA: FunctionMeta = {
  name: 'MINA',
  signature: 'MINA(value1, [value2], ...)',
  description: '文字列をTRUE=1、FALSE=0、テキスト=0として数えた最小値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = collectAValues(args, ctx);
    if (isFormulaError(nums)) return nums;
    return nums.length === 0 ? 0 : Math.min(...nums);
  },
};

// ============================================================
// COUNTBLANK
// ============================================================
const COUNTBLANK: FunctionMeta = {
  name: 'COUNTBLANK',
  signature: 'COUNTBLANK(range)',
  description: '範囲内の空白セルの個数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const arg = args[0];
    const flat = arg.kind === 'range' || arg.kind === 'array' ? argToFlat(arg, ctx) : [resolveScalar(arg, ctx)];
    let count = 0;
    for (const val of flat) {
      if (!isFormulaError(val) && val === '') count++;
    }
    return count;
  },
};

// ============================================================
// PERCENTILE / PERCENTILE.EXC, QUARTILE / QUARTILE.EXC
// ============================================================
function percentileInc(sorted: number[], k: number): FormulaResult {
  const n = sorted.length;
  if (n === 0) return makeError('#NUM!');
  if (k < 0 || k > 1) return makeError('#NUM!');
  const idx = k * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function percentileExc(sorted: number[], k: number): FormulaResult {
  const n = sorted.length;
  if (n === 0) return makeError('#NUM!');
  if (k <= 0 || k >= 1) return makeError('#NUM!');
  const idx = k * (n + 1) - 1;
  if (idx < 0 || idx > n - 1) return makeError('#NUM!');
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function sortedNumericArray(arg: FunctionArgValue, ctx: FunctionContext): number[] | FormulaError {
  const nums = resolveNumericArgs([arg], ctx, { skipNonNumeric: true });
  if (isFormulaError(nums)) return nums;
  return [...nums].sort((a, b) => a - b);
}

const PERCENTILE: FunctionMeta = {
  name: 'PERCENTILE',
  signature: 'PERCENTILE(array, k)',
  description: '範囲内の値の k 番目のパーセンタイル値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const sorted = sortedNumericArray(args[0], ctx);
    if (isFormulaError(sorted)) return sorted;
    const k = resolveNumber(args[1], ctx);
    if (isFormulaError(k)) return k;
    return percentileInc(sorted, k);
  },
};

const PERCENTILE_EXC: FunctionMeta = {
  name: 'PERCENTILE.EXC',
  signature: 'PERCENTILE.EXC(array, k)',
  description: '範囲内の値の k 番目のパーセンタイル値を、0と1を除いて返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const sorted = sortedNumericArray(args[0], ctx);
    if (isFormulaError(sorted)) return sorted;
    const k = resolveNumber(args[1], ctx);
    if (isFormulaError(k)) return k;
    return percentileExc(sorted, k);
  },
};

const QUARTILE: FunctionMeta = {
  name: 'QUARTILE',
  signature: 'QUARTILE(array, quart)',
  description: '範囲内の値の四分位数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const sorted = sortedNumericArray(args[0], ctx);
    if (isFormulaError(sorted)) return sorted;
    const quartVal = resolveNumber(args[1], ctx);
    if (isFormulaError(quartVal)) return quartVal;
    const quart = Math.trunc(quartVal);
    if (quart < 0 || quart > 4) return makeError('#NUM!');
    return percentileInc(sorted, quart / 4);
  },
};

const QUARTILE_EXC: FunctionMeta = {
  name: 'QUARTILE.EXC',
  signature: 'QUARTILE.EXC(array, quart)',
  description: '範囲内の値の四分位数を、0と4を除いて返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const sorted = sortedNumericArray(args[0], ctx);
    if (isFormulaError(sorted)) return sorted;
    const quartVal = resolveNumber(args[1], ctx);
    if (isFormulaError(quartVal)) return quartVal;
    const quart = Math.trunc(quartVal);
    return percentileExc(sorted, quart / 4);
  },
};

const PERCENTILE_INC = withName(PERCENTILE, 'PERCENTILE.INC');
const QUARTILE_INC = withName(QUARTILE, 'QUARTILE.INC');

// ============================================================
// PERCENTRANK / PERCENTRANK.INC
// ============================================================
function percentRank(sorted: number[], x: number, significance: number): FormulaResult {
  const n = sorted.length;
  if (n === 0) return makeError('#NUM!');
  if (x < sorted[0] || x > sorted[n - 1]) return makeError('#N/A');
  if (n === 1) return 1;
  let i = 0;
  while (i < n - 1 && sorted[i + 1] < x) i++;
  let rank: number;
  if (sorted[i] === x) {
    rank = i / (n - 1);
  } else if (i < n - 1) {
    rank = (i + (x - sorted[i]) / (sorted[i + 1] - sorted[i])) / (n - 1);
  } else {
    rank = i / (n - 1);
  }
  const factor = Math.pow(10, significance);
  return Math.trunc(rank * factor) / factor;
}

const PERCENTRANK: FunctionMeta = {
  name: 'PERCENTRANK',
  signature: 'PERCENTRANK(array, x, [significance])',
  description: '範囲内でのデータの順位をパーセンテージで返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const sorted = sortedNumericArray(args[0], ctx);
    if (isFormulaError(sorted)) return sorted;
    const x = resolveNumber(args[1], ctx);
    if (isFormulaError(x)) return x;
    let significance = 3;
    if (args.length === 3) {
      const s = resolveNumber(args[2], ctx);
      if (isFormulaError(s)) return s;
      significance = Math.trunc(s);
    }
    return percentRank(sorted, x, significance);
  },
};

const PERCENTRANK_INC = withName(PERCENTRANK, 'PERCENTRANK.INC');

// ============================================================
// RANK.AVG
// ============================================================
const RANK_AVG: FunctionMeta = {
  name: 'RANK.AVG',
  signature: 'RANK.AVG(number, ref, [order])',
  description: '同順位がある場合に平均順位を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const num = resolveNumber(args[0], ctx);
    if (isFormulaError(num)) return num;
    const refNums = resolveNumericArgs([args[1]], ctx, { skipNonNumeric: true });
    if (isFormulaError(refNums)) return refNums;
    let ascending = false;
    if (args.length === 3) {
      const order = resolveNumber(args[2], ctx);
      if (isFormulaError(order)) return order;
      ascending = order !== 0;
    }
    if (!refNums.includes(num)) return makeError('#N/A');
    let countBetter = 0;
    let countEqual = 0;
    for (const v of refNums) {
      if (ascending ? v < num : v > num) countBetter++;
      else if (v === num) countEqual++;
    }
    return countBetter + (countEqual + 1) / 2;
  },
};

// ============================================================
// Pairwise regression/correlation helpers (CORREL, COVAR family, SLOPE, INTERCEPT, RSQ, STEYX, FORECAST)
// ============================================================
function collectNumericPairs(
  arg1: FunctionArgValue,
  arg2: FunctionArgValue,
  ctx: FunctionContext,
): { xs: number[]; ys: number[] } | FormulaError {
  if ((arg1.kind !== 'range' && arg1.kind !== 'array') || (arg2.kind !== 'range' && arg2.kind !== 'array')) {
    return makeError('#VALUE!');
  }
  const flat1 = argToFlat(arg1, ctx);
  const flat2 = argToFlat(arg2, ctx);
  if (flat1.length !== flat2.length) return makeError('#N/A');
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < flat1.length; i++) {
    const a = flat1[i];
    const b = flat2[i];
    if (isFormulaError(a)) return a;
    if (isFormulaError(b)) return b;
    // Excel ignores a pair when either side is non-numeric (text/blank/boolean).
    if (typeof a === 'number' && typeof b === 'number') {
      xs.push(a);
      ys.push(b);
    }
  }
  return { xs, ys };
}

function meanOf(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function computeSums(xs: number[], ys: number[]): { sxx: number; syy: number; sxy: number; meanX: number; meanY: number } {
  const meanX = meanOf(xs);
  const meanY = meanOf(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return { sxx, syy, sxy, meanX, meanY };
}

const CORREL: FunctionMeta = {
  name: 'CORREL',
  signature: 'CORREL(array1, array2)',
  description: '2つの範囲の相関係数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const pairs = collectNumericPairs(args[0], args[1], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxx, syy, sxy } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0 || syy === 0) return makeError('#DIV/0!');
    return sxy / Math.sqrt(sxx * syy);
  },
};

const PEARSON = withName(CORREL, 'PEARSON');

const COVARIANCE_P: FunctionMeta = {
  name: 'COVARIANCE.P',
  signature: 'COVARIANCE.P(array1, array2)',
  description: '2つの範囲の母共分散を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const pairs = collectNumericPairs(args[0], args[1], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxy } = computeSums(pairs.xs, pairs.ys);
    return sxy / pairs.xs.length;
  },
};

const COVAR = withName(COVARIANCE_P, 'COVAR');

const COVARIANCE_S: FunctionMeta = {
  name: 'COVARIANCE.S',
  signature: 'COVARIANCE.S(array1, array2)',
  description: '2つの範囲の標本共分散を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const pairs = collectNumericPairs(args[0], args[1], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length <= 1) return makeError('#DIV/0!');
    const { sxy } = computeSums(pairs.xs, pairs.ys);
    return sxy / (pairs.xs.length - 1);
  },
};

const SLOPE: FunctionMeta = {
  name: 'SLOPE',
  signature: 'SLOPE(known_ys, known_xs)',
  description: '線形回帰直線の傾きを返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    // args[0] = known_ys, args[1] = known_xs; collectNumericPairs(arg_for_xs, arg_for_ys).
    const pairs = collectNumericPairs(args[1], args[0], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxx, sxy } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0) return makeError('#DIV/0!');
    return sxy / sxx;
  },
};

const INTERCEPT: FunctionMeta = {
  name: 'INTERCEPT',
  signature: 'INTERCEPT(known_ys, known_xs)',
  description: '線形回帰直線の切片を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const pairs = collectNumericPairs(args[1], args[0], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxx, sxy, meanX, meanY } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0) return makeError('#DIV/0!');
    return meanY - (sxy / sxx) * meanX;
  },
};

const RSQ: FunctionMeta = {
  name: 'RSQ',
  signature: 'RSQ(known_ys, known_xs)',
  description: '線形回帰の決定係数(R二乗値)を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    // Symmetric formula (sxy^2 / (sxx*syy)); argument order doesn't affect the result.
    const pairs = collectNumericPairs(args[1], args[0], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxx, syy, sxy } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0 || syy === 0) return makeError('#DIV/0!');
    return (sxy * sxy) / (sxx * syy);
  },
};

const STEYX: FunctionMeta = {
  name: 'STEYX',
  signature: 'STEYX(known_ys, known_xs)',
  description: '線形回帰における予測値の標準誤差を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const pairs = collectNumericPairs(args[1], args[0], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length <= 2) return makeError('#DIV/0!');
    const { sxx, sxy, meanX, meanY } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0) return makeError('#DIV/0!');
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    let sse = 0;
    for (let i = 0; i < pairs.xs.length; i++) {
      const predicted = intercept + slope * pairs.xs[i];
      sse += (pairs.ys[i] - predicted) ** 2;
    }
    return Math.sqrt(sse / (pairs.xs.length - 2));
  },
};

const FORECAST: FunctionMeta = {
  name: 'FORECAST',
  signature: 'FORECAST(x, known_ys, known_xs)',
  description: '線形回帰に基づいて将来の値を予測します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const x = resolveNumber(args[0], ctx);
    if (isFormulaError(x)) return x;
    // args[1] = known_ys, args[2] = known_xs; collectNumericPairs(arg_for_xs, arg_for_ys).
    const pairs = collectNumericPairs(args[2], args[1], ctx);
    if (isFormulaError(pairs)) return pairs;
    if (pairs.xs.length === 0) return makeError('#DIV/0!');
    const { sxx, sxy, meanX, meanY } = computeSums(pairs.xs, pairs.ys);
    if (sxx === 0) return makeError('#DIV/0!');
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    return intercept + slope * x;
  },
};

const FORECAST_LINEAR = withName(FORECAST, 'FORECAST.LINEAR');

// ============================================================
// GEOMEAN / HARMEAN / AVEDEV / DEVSQ / KURT / SKEW
// ============================================================
const GEOMEAN: FunctionMeta = {
  name: 'GEOMEAN',
  signature: 'GEOMEAN(number1, [number2], ...)',
  description: '引数の相乗平均(幾何平均)を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    if (nums.some(n => n <= 0)) return makeError('#NUM!');
    return Math.exp(nums.reduce((s, n) => s + Math.log(n), 0) / nums.length);
  },
};

const HARMEAN: FunctionMeta = {
  name: 'HARMEAN',
  signature: 'HARMEAN(number1, [number2], ...)',
  description: '引数の調和平均を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    if (nums.some(n => n <= 0)) return makeError('#NUM!');
    return nums.length / nums.reduce((s, n) => s + 1 / n, 0);
  },
};

const AVEDEV: FunctionMeta = {
  name: 'AVEDEV',
  signature: 'AVEDEV(number1, [number2], ...)',
  description: '平均値からの絶対偏差の平均を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    const mean = meanOf(nums);
    return nums.reduce((s, n) => s + Math.abs(n - mean), 0) / nums.length;
  },
};

const DEVSQ: FunctionMeta = {
  name: 'DEVSQ',
  signature: 'DEVSQ(number1, [number2], ...)',
  description: '平均値からの偏差の2乗の合計を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return 0;
    const mean = meanOf(nums);
    return nums.reduce((s, n) => s + (n - mean) ** 2, 0);
  },
};

const KURT: FunctionMeta = {
  name: 'KURT',
  signature: 'KURT(number1, [number2], ...)',
  description: 'データセットの尖度を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const n = nums.length;
    if (n < 4) return makeError('#DIV/0!');
    const mean = meanOf(nums);
    const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    if (sd === 0) return makeError('#DIV/0!');
    const sum4 = nums.reduce((s, x) => s + ((x - mean) / sd) ** 4, 0);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum4 - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  },
};

const SKEW: FunctionMeta = {
  name: 'SKEW',
  signature: 'SKEW(number1, [number2], ...)',
  description: 'データセットの歪度を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const n = nums.length;
    if (n < 3) return makeError('#DIV/0!');
    const mean = meanOf(nums);
    const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    if (sd === 0) return makeError('#DIV/0!');
    const sum3 = nums.reduce((s, x) => s + ((x - mean) / sd) ** 3, 0);
    return (n / ((n - 1) * (n - 2))) * sum3;
  },
};

// ============================================================
// Normal distribution: erf-based CDF/PDF and Acklam's inverse CDF
// ============================================================

/**
 * erf(x) via its Maclaurin series (term ratio recurrence), summed until the
 * next term is negligible. Accurate to machine precision for |x| <= ~3, and
 * to ~1e-11 out to |x| = 6 (verified numerically against known Phi(z) values) —
 * comfortably inside the 1e-9 tolerance used by these functions' tests.
 */
function erf(x: number): number {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax > 6) return sign;
  let sum = ax;
  let term = ax;
  for (let n = 1; n < 300; n++) {
    term *= (-ax * ax) / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-18 * Math.abs(sum)) break;
  }
  return sign * (2 / Math.sqrt(Math.PI)) * sum;
}

function erfc(x: number): number {
  return 1 - erf(x);
}

function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function standardNormalPdf(z: number): number {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/** Peter Acklam's rational approximation for the standard normal inverse CDF, refined with one Halley step. */
function standardNormalInv(p: number): number {
  const a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02, 1.38357751867269e02, -3.066479806614716e01, 2.506628277459239e00];
  const b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02, 6.680131188771972e01, -1.328068155288572e01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00, -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley refinement step (per Acklam's reference implementation), pushing accuracy near double precision.
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

const NORMDIST: FunctionMeta = {
  name: 'NORMDIST',
  signature: 'NORMDIST(x, mean, standard_dev, cumulative)',
  description: '指定した平均・標準偏差の正規分布の値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 4) return makeError('#VALUE!');
    const x = resolveNumber(args[0], ctx);
    if (isFormulaError(x)) return x;
    const mean = resolveNumber(args[1], ctx);
    if (isFormulaError(mean)) return mean;
    const sd = resolveNumber(args[2], ctx);
    if (isFormulaError(sd)) return sd;
    const cumRaw = resolveScalar(args[3], ctx);
    if (isFormulaError(cumRaw)) return cumRaw;
    const cumulative = toBoolean(cumRaw);
    if (isFormulaError(cumulative)) return cumulative;
    if (sd <= 0) return makeError('#NUM!');
    const z = (x - mean) / sd;
    return cumulative ? standardNormalCdf(z) : standardNormalPdf(z) / sd;
  },
};

const NORM_DIST = withName(NORMDIST, 'NORM.DIST');

const NORMINV: FunctionMeta = {
  name: 'NORMINV',
  signature: 'NORMINV(probability, mean, standard_dev)',
  description: '指定した平均・標準偏差の正規分布の逆関数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const p = resolveNumber(args[0], ctx);
    if (isFormulaError(p)) return p;
    const mean = resolveNumber(args[1], ctx);
    if (isFormulaError(mean)) return mean;
    const sd = resolveNumber(args[2], ctx);
    if (isFormulaError(sd)) return sd;
    if (p <= 0 || p >= 1 || sd <= 0) return makeError('#NUM!');
    return mean + sd * standardNormalInv(p);
  },
};

const NORM_INV = withName(NORMINV, 'NORM.INV');

const NORM_S_DIST: FunctionMeta = {
  name: 'NORM.S.DIST',
  signature: 'NORM.S.DIST(z, cumulative)',
  description: '標準正規分布の値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const z = resolveNumber(args[0], ctx);
    if (isFormulaError(z)) return z;
    const cumRaw = resolveScalar(args[1], ctx);
    if (isFormulaError(cumRaw)) return cumRaw;
    const cumulative = toBoolean(cumRaw);
    if (isFormulaError(cumulative)) return cumulative;
    return cumulative ? standardNormalCdf(z) : standardNormalPdf(z);
  },
};

const NORM_S_INV: FunctionMeta = {
  name: 'NORM.S.INV',
  signature: 'NORM.S.INV(probability)',
  description: '標準正規分布の逆関数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const p = resolveNumber(args[0], ctx);
    if (isFormulaError(p)) return p;
    if (p <= 0 || p >= 1) return makeError('#NUM!');
    return standardNormalInv(p);
  },
};

const NORMSINV = withName(NORM_S_INV, 'NORMSINV');

const NORMSDIST: FunctionMeta = {
  name: 'NORMSDIST',
  signature: 'NORMSDIST(z)',
  description: '標準正規分布の累積分布関数の値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const z = resolveNumber(args[0], ctx);
    if (isFormulaError(z)) return z;
    return standardNormalCdf(z);
  },
};

const STANDARDIZE: FunctionMeta = {
  name: 'STANDARDIZE',
  signature: 'STANDARDIZE(x, mean, standard_dev)',
  description: '指定した平均・標準偏差の正規分布に対するZ値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [x, mean, sd] = nums;
    if (sd <= 0) return makeError('#NUM!');
    return (x - mean) / sd;
  },
};

const CONFIDENCE: FunctionMeta = {
  name: 'CONFIDENCE',
  signature: 'CONFIDENCE(alpha, standard_dev, size)',
  description: '母平均に対する信頼区間の幅を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [alpha, sd, size] = nums;
    if (alpha <= 0 || alpha >= 1 || sd <= 0 || size < 1) return makeError('#NUM!');
    const n = Math.trunc(size);
    const z = standardNormalInv(1 - alpha / 2);
    return (z * sd) / Math.sqrt(n);
  },
};

const CONFIDENCE_NORM = withName(CONFIDENCE, 'CONFIDENCE.NORM');

// ============================================================
// COUNTUNIQUE (Google Sheets)
// ============================================================
const COUNTUNIQUE: FunctionMeta = {
  name: 'COUNTUNIQUE',
  signature: 'COUNTUNIQUE(value1, [value2], ...)',
  description: '範囲内のユニークな値の個数を返します(大文字小文字を区別、空白は除外)',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const seen = new Set<string>();
    for (const arg of args) {
      const flat = arg.kind === 'range' || arg.kind === 'array' ? argToFlat(arg, ctx) : [resolveScalar(arg, ctx)];
      for (const val of flat) {
        if (isFormulaError(val)) return val;
        if (val === '') continue;
        const key = typeof val === 'number' ? `n:${val}` : typeof val === 'boolean' ? `b:${val}` : `s:${val}`;
        seen.add(key);
      }
    }
    return seen.size;
  },
};

// ============================================================
// MINIFS / MAXIFS
// ============================================================
function minMaxIfs(
  args: FunctionArgValue[],
  ctx: FunctionContext,
  pick: 'min' | 'max',
): FormulaResult {
  if (args.length < 3 || (args.length - 1) % 2 !== 0) return makeError('#VALUE!');

  const targetArg = args[0];
  if (targetArg.kind !== 'range' && targetArg.kind !== 'array') return makeError('#VALUE!');
  const targetFlat = argToFlat(targetArg, ctx);

  const numPairs = (args.length - 1) / 2;
  const criteriaFlats: FormulaResult[][] = [];
  const tests: Array<(idx: number) => boolean> = [];

  for (let p = 0; p < numPairs; p++) {
    const rangeArg = args[1 + p * 2];
    const critArg = args[2 + p * 2];
    if (rangeArg.kind !== 'range' && rangeArg.kind !== 'array') return makeError('#VALUE!');
    criteriaFlats.push(argToFlat(rangeArg, ctx));

    const criteriaVal = resolveScalar(critArg, ctx);
    if (isFormulaError(criteriaVal)) return criteriaVal;
    const test = parseCriteria(criteriaVal);
    tests.push((idx: number) => test(criteriaFlats[p][idx]));
  }

  let result: number | null = null;
  for (let i = 0; i < targetFlat.length; i++) {
    let allMatch = true;
    for (let p = 0; p < numPairs; p++) {
      if (i >= criteriaFlats[p].length || !tests[p](i)) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) continue;
    const v = targetFlat[i];
    if (isFormulaError(v)) return v;
    let n: number | null = null;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) n = Number(v);
    if (n === null) continue;
    if (result === null) result = n;
    else if (pick === 'min' ? n < result : n > result) result = n;
  }
  return result === null ? 0 : result;
}

const MINIFS: FunctionMeta = {
  name: 'MINIFS',
  signature: 'MINIFS(min_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
  description: '複数の条件を満たすセルの最小値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    return minMaxIfs(args, ctx, 'min');
  },
};

const MAXIFS: FunctionMeta = {
  name: 'MAXIFS',
  signature: 'MAXIFS(max_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
  description: '複数の条件を満たすセルの最大値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    return minMaxIfs(args, ctx, 'max');
  },
};

// ============================================================
// Registry
// ============================================================
export const statsFunctions: FunctionMeta[] = [
  MEDIAN, MODE, MODE_SNGL, MODE_MULT,
  STDEV_S, STDEV_P, STDEVP, VAR_S, VAR_P, VARP, STDEVA, VARA,
  AVERAGEA, MAXA, MINA, COUNTBLANK,
  PERCENTILE, PERCENTILE_INC, PERCENTILE_EXC, QUARTILE, QUARTILE_INC, QUARTILE_EXC,
  PERCENTRANK, PERCENTRANK_INC, RANK_EQ, RANK_AVG,
  CORREL, PEARSON, COVARIANCE_S, COVARIANCE_P, COVAR,
  SLOPE, INTERCEPT, RSQ, STEYX, FORECAST, FORECAST_LINEAR,
  GEOMEAN, HARMEAN, AVEDEV, DEVSQ, KURT, SKEW,
  NORMDIST, NORM_DIST, NORMINV, NORM_INV, NORM_S_DIST, NORM_S_INV, NORMSDIST, NORMSINV,
  STANDARDIZE, CONFIDENCE, CONFIDENCE_NORM,
  COUNTUNIQUE, MINIFS, MAXIFS,
];
