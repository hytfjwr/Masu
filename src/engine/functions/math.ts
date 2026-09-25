import type { FormulaResult, FunctionArgValue, FunctionContext, FunctionMeta } from '../types';
import { isFormulaError, makeError } from '../types';
import { argToFlat, resolveNumber, resolveNumericArgs, resolveNumericValues, resolveScalar } from './helpers';

// ============================================================
// SUM
// ============================================================
const SUM: FunctionMeta = {
  name: 'SUM',
  signature: 'SUM(number1, [number2], ...)',
  description: 'Adds all the numbers in a range of cells',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    return nums.reduce((sum, n) => sum + n, 0);
  },
};

// ============================================================
// AVERAGE
// ============================================================
const AVERAGE: FunctionMeta = {
  name: 'AVERAGE',
  signature: 'AVERAGE(number1, [number2], ...)',
  description: 'Returns the average of the arguments',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return makeError('#DIV/0!');
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
  },
};

// ============================================================
// MIN
// ============================================================
const MIN: FunctionMeta = {
  name: 'MIN',
  signature: 'MIN(number1, [number2], ...)',
  description: 'Returns the smallest number in a set of values',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  },
};

// ============================================================
// MAX
// ============================================================
const MAX: FunctionMeta = {
  name: 'MAX',
  signature: 'MAX(number1, [number2], ...)',
  description: 'Returns the largest number in a set of values',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  },
};

// ============================================================
// COUNT
// ============================================================
const COUNT: FunctionMeta = {
  name: 'COUNT',
  signature: 'COUNT(value1, [value2], ...)',
  description: 'Counts the number of cells that contain numbers',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const values = resolveNumericValues(args, ctx);
    if (isFormulaError(values)) return values;
    let count = 0;
    for (const v of values) {
      if (typeof v === 'number') count++;
      else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) count++;
    }
    return count;
  },
};

// ============================================================
// ROUND
// ============================================================
const ROUND: FunctionMeta = {
  name: 'ROUND',
  signature: 'ROUND(number, num_digits)',
  description: 'Rounds a number to a specified number of digits',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [value, digits] = nums;
    return roundToDigits(value, Math.trunc(digits), 'nearest');
  },
};

// ============================================================
// ABS
// ============================================================
const ABS: FunctionMeta = {
  name: 'ABS',
  signature: 'ABS(number)',
  description: 'Returns the absolute value of a number',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.abs(nums[0]);
  },
};

// ============================================================
// MOD
// ============================================================
const MOD: FunctionMeta = {
  name: 'MOD',
  signature: 'MOD(number, divisor)',
  description: 'Returns the remainder from division',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [dividend, divisor] = nums;
    if (divisor === 0) return makeError('#DIV/0!');
    // Excel-compatible: result has the sign of the divisor
    const result = dividend % divisor;
    return result;
  },
};

// ============================================================
// POWER
// ============================================================
const POWER: FunctionMeta = {
  name: 'POWER',
  signature: 'POWER(number, power)',
  description: 'Returns a number raised to a power',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const result = Math.pow(nums[0], nums[1]);
    if (!isFinite(result)) return makeError('#NUM!');
    return result;
  },
};

// ============================================================
// CEILING
// ============================================================
const CEILING: FunctionMeta = {
  name: 'CEILING',
  signature: 'CEILING(number, significance)',
  description: 'Rounds a number up to the nearest multiple of significance',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [value, significance] = nums;
    if (significance === 0) return 0;
    if ((value > 0 && significance < 0)) return makeError('#NUM!');
    return Math.ceil(value / significance) * significance;
  },
};

// ============================================================
// FLOOR
// ============================================================
const FLOOR: FunctionMeta = {
  name: 'FLOOR',
  signature: 'FLOOR(number, significance)',
  description: 'Rounds a number down to the nearest multiple of significance',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [value, significance] = nums;
    if (significance === 0) return makeError('#DIV/0!');
    if ((value > 0 && significance < 0)) return makeError('#NUM!');
    return Math.floor(value / significance) * significance;
  },
};

// ============================================================
// SQRT
// ============================================================
const SQRT: FunctionMeta = {
  name: 'SQRT',
  signature: 'SQRT(number)',
  description: 'Returns the square root of a number',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    if (nums[0] < 0) return makeError('#NUM!');
    return Math.sqrt(nums[0]);
  },
};

// ============================================================
// INT
// ============================================================
const INT: FunctionMeta = {
  name: 'INT',
  signature: 'INT(number)',
  description: 'Rounds a number down to the nearest integer',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.floor(nums[0]);
  },
};

// ============================================================
// SUMPRODUCT
// ============================================================
const SUMPRODUCT: FunctionMeta = {
  name: 'SUMPRODUCT',
  signature: 'SUMPRODUCT(array1, [array2], ...)',
  description: '対応する範囲の積を合計します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');

    // All arguments must be ranges/arrays of the same length
    const ranges: number[][] = [];
    let rangeLen = -1;

    for (const arg of args) {
      if (arg.kind !== 'range' && arg.kind !== 'array') return makeError('#VALUE!');
      const flat = argToFlat(arg, ctx);
      if (rangeLen === -1) {
        rangeLen = flat.length;
      } else if (flat.length !== rangeLen) {
        return makeError('#VALUE!');
      }
      const nums: number[] = [];
      for (const val of flat) {
        if (isFormulaError(val)) return val;
        if (typeof val === 'number') {
          nums.push(val);
        } else if (typeof val === 'boolean') {
          nums.push(val ? 1 : 0);
        } else if (typeof val === 'string') {
          if (val === '') {
            nums.push(0);
          } else {
            const n = Number(val);
            nums.push(isNaN(n) ? 0 : n);
          }
        } else {
          nums.push(0);
        }
      }
      ranges.push(nums);
    }

    if (rangeLen <= 0) return 0;

    let sum = 0;
    for (let i = 0; i < rangeLen; i++) {
      let product = 1;
      for (const range of ranges) {
        product *= range[i];
      }
      sum += product;
    }
    return sum;
  },
};

// ============================================================
// STDEV
// ============================================================
export const STDEV: FunctionMeta = {
  name: 'STDEV',
  signature: 'STDEV(number1, [number2], ...)',
  description: '標本標準偏差を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length <= 1) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
    return Math.sqrt(variance);
  },
};

// ============================================================
// VAR
// ============================================================
export const VAR_FN: FunctionMeta = {
  name: 'VAR',
  signature: 'VAR(number1, [number2], ...)',
  description: '標本分散を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length <= 1) return makeError('#DIV/0!');
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
  },
};

// ============================================================
// LARGE
// ============================================================
const LARGE: FunctionMeta = {
  name: 'LARGE',
  signature: 'LARGE(array, k)',
  description: 'k番目に大きい値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const arrayArg = args[0];
    const kArg = args[1];

    // Get k value
    const kVal = resolveNumericArgs([kArg], ctx, { strictScalar: true });
    if (isFormulaError(kVal)) return kVal;
    const k = Math.trunc(kVal[0]);

    // Get numbers from array
    const nums = resolveNumericArgs([arrayArg], ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;

    if (k < 1 || k > nums.length) return makeError('#NUM!');

    nums.sort((a, b) => b - a);
    return nums[k - 1];
  },
};

// ============================================================
// SMALL
// ============================================================
const SMALL: FunctionMeta = {
  name: 'SMALL',
  signature: 'SMALL(array, k)',
  description: 'k番目に小さい値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const arrayArg = args[0];
    const kArg = args[1];

    const kVal = resolveNumericArgs([kArg], ctx, { strictScalar: true });
    if (isFormulaError(kVal)) return kVal;
    const k = Math.trunc(kVal[0]);

    const nums = resolveNumericArgs([arrayArg], ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;

    if (k < 1 || k > nums.length) return makeError('#NUM!');

    nums.sort((a, b) => a - b);
    return nums[k - 1];
  },
};

// ============================================================
// RANK
// ============================================================
export const RANK: FunctionMeta = {
  name: 'RANK',
  signature: 'RANK(number, ref, [order])',
  description: '数値の順位を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const numVal = resolveNumericArgs([args[0]], ctx, { strictScalar: true });
    if (isFormulaError(numVal)) return numVal;
    const num = numVal[0];

    const refNums = resolveNumericArgs([args[1]], ctx, { skipNonNumeric: true });
    if (isFormulaError(refNums)) return refNums;

    let ascending = false;
    if (args.length === 3) {
      const orderVal = resolveNumericArgs([args[2]], ctx, { strictScalar: true });
      if (isFormulaError(orderVal)) return orderVal;
      ascending = orderVal[0] !== 0;
    }

    let rank = 1;
    for (const v of refNums) {
      if (ascending ? v < num : v > num) rank++;
    }

    // Check if the number exists in the reference
    if (!refNums.includes(num)) return makeError('#N/A');

    return rank;
  },
};

// ============================================================
// Floating-point correction helper, shared by the digit-rounding functions
// ============================================================
function correctFloat(x: number): number {
  if (!isFinite(x)) return x;
  return Number(x.toPrecision(15));
}

/** Shared rounding logic for ROUND ('nearest', ties away from zero), ROUNDUP/CEILING-away ('up'), and ROUNDDOWN/TRUNC ('down'). */
function roundToDigits(value: number, digits: number, mode: 'nearest' | 'up' | 'down'): number {
  const factor = Math.pow(10, digits);
  const scaled = correctFloat(value * factor);
  let rounded: number;
  if (mode === 'nearest') {
    rounded = value >= 0 ? Math.round(scaled) : -Math.round(-scaled);
  } else if (mode === 'up') {
    rounded = value >= 0 ? Math.ceil(scaled) : Math.floor(scaled);
  } else {
    rounded = value >= 0 ? Math.floor(scaled) : Math.ceil(scaled);
  }
  return correctFloat(rounded / factor);
}

// ============================================================
// ROUNDUP / ROUNDDOWN / TRUNC
// ============================================================
const ROUNDUP: FunctionMeta = {
  name: 'ROUNDUP',
  signature: 'ROUNDUP(number, [num_digits])',
  description: '数値を0から離れる方向に切り上げて返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const value = resolveNumber(args[0], ctx);
    if (isFormulaError(value)) return value;
    let digits = 0;
    if (args.length === 2) {
      const d = resolveNumber(args[1], ctx);
      if (isFormulaError(d)) return d;
      digits = Math.trunc(d);
    }
    return roundToDigits(value, digits, 'up');
  },
};

const ROUNDDOWN: FunctionMeta = {
  name: 'ROUNDDOWN',
  signature: 'ROUNDDOWN(number, [num_digits])',
  description: '数値を0に近づく方向に切り捨てて返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const value = resolveNumber(args[0], ctx);
    if (isFormulaError(value)) return value;
    let digits = 0;
    if (args.length === 2) {
      const d = resolveNumber(args[1], ctx);
      if (isFormulaError(d)) return d;
      digits = Math.trunc(d);
    }
    return roundToDigits(value, digits, 'down');
  },
};

const TRUNC: FunctionMeta = {
  name: 'TRUNC',
  signature: 'TRUNC(number, [num_digits])',
  description: '数値の小数部分を切り捨てて返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const value = resolveNumber(args[0], ctx);
    if (isFormulaError(value)) return value;
    let digits = 0;
    if (args.length === 2) {
      const d = resolveNumber(args[1], ctx);
      if (isFormulaError(d)) return d;
      digits = Math.trunc(d);
    }
    return roundToDigits(value, digits, 'down');
  },
};

// ============================================================
// SIGN / EXP / LN / LOG / LOG10
// ============================================================
const SIGN: FunctionMeta = {
  name: 'SIGN',
  signature: 'SIGN(number)',
  description: '数値の符号を返します（正なら1、負なら-1、0なら0）',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return nums[0] > 0 ? 1 : nums[0] < 0 ? -1 : 0;
  },
};

const EXP: FunctionMeta = {
  name: 'EXP',
  signature: 'EXP(number)',
  description: 'eを底とする累乗を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const result = Math.exp(nums[0]);
    if (!isFinite(result)) return makeError('#NUM!');
    return result;
  },
};

const LN: FunctionMeta = {
  name: 'LN',
  signature: 'LN(number)',
  description: '数値の自然対数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    if (nums[0] <= 0) return makeError('#NUM!');
    return Math.log(nums[0]);
  },
};

const LOG10: FunctionMeta = {
  name: 'LOG10',
  signature: 'LOG10(number)',
  description: '数値の常用対数（底10）を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    if (nums[0] <= 0) return makeError('#NUM!');
    return Math.log10(nums[0]);
  },
};

const LOG: FunctionMeta = {
  name: 'LOG',
  signature: 'LOG(number, [base])',
  description: '指定した底での対数を返します（底の既定値は10）',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const number = resolveNumber(args[0], ctx);
    if (isFormulaError(number)) return number;
    let base = 10;
    if (args.length === 2) {
      const b = resolveNumber(args[1], ctx);
      if (isFormulaError(b)) return b;
      base = b;
    }
    if (number <= 0 || base <= 0) return makeError('#NUM!');
    if (base === 1) return makeError('#DIV/0!');
    return Math.log(number) / Math.log(base);
  },
};

// ============================================================
// PI
// ============================================================
const PI: FunctionMeta = {
  name: 'PI',
  signature: 'PI()',
  description: '円周率(3.14159...)を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return Math.PI;
  },
};

// ============================================================
// EVEN / ODD
// ============================================================
const EVEN: FunctionMeta = {
  name: 'EVEN',
  signature: 'EVEN(number)',
  description: '数値を0から離れる方向に最も近い偶数に丸めます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const n = nums[0];
    const sign = n < 0 ? -1 : 1;
    return sign * Math.ceil(Math.abs(n) / 2) * 2;
  },
};

const ODD: FunctionMeta = {
  name: 'ODD',
  signature: 'ODD(number)',
  description: '数値を0から離れる方向に最も近い奇数に丸めます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const n = nums[0];
    const sign = n < 0 ? -1 : 1;
    const abs = Math.abs(n);
    return sign * (Math.ceil((abs - 1) / 2) * 2 + 1);
  },
};

// ============================================================
// MROUND / QUOTIENT
// ============================================================
const MROUND: FunctionMeta = {
  name: 'MROUND',
  signature: 'MROUND(number, multiple)',
  description: '数値を指定した倍数に丸めます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [number, multiple] = nums;
    if (multiple === 0) return 0;
    if ((number > 0 && multiple < 0) || (number < 0 && multiple > 0)) return makeError('#NUM!');
    const ratio = correctFloat(number / multiple);
    return correctFloat(Math.round(ratio) * multiple);
  },
};

const QUOTIENT: FunctionMeta = {
  name: 'QUOTIENT',
  signature: 'QUOTIENT(numerator, denominator)',
  description: '除算の整数部分を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [numerator, denominator] = nums;
    if (denominator === 0) return makeError('#DIV/0!');
    return Math.trunc(numerator / denominator);
  },
};

// ============================================================
// FACT / COMBIN / PERMUT
// ============================================================
const FACT: FunctionMeta = {
  name: 'FACT',
  signature: 'FACT(number)',
  description: '数値の階乗を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const n = Math.trunc(nums[0]);
    if (n < 0) return makeError('#NUM!');
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
      if (!isFinite(result)) return makeError('#NUM!');
    }
    return result;
  },
};

const COMBIN: FunctionMeta = {
  name: 'COMBIN',
  signature: 'COMBIN(number, number_chosen)',
  description: '指定した個数から選べる組み合わせの数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const n = Math.trunc(nums[0]);
    const k = Math.trunc(nums[1]);
    if (n < 0 || k < 0 || k > n) return makeError('#NUM!');
    const kk = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < kk; i++) {
      result = (result * (n - i)) / (i + 1);
    }
    return Math.round(result);
  },
};

const PERMUT: FunctionMeta = {
  name: 'PERMUT',
  signature: 'PERMUT(number, number_chosen)',
  description: '指定した個数から選べる順列の数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const n = Math.trunc(nums[0]);
    const k = Math.trunc(nums[1]);
    if (n < 0 || k < 0 || k > n) return makeError('#NUM!');
    let result = 1;
    for (let i = 0; i < k; i++) {
      result *= n - i;
    }
    return result;
  },
};

// ============================================================
// Trigonometric functions
// ============================================================
const DEGREES: FunctionMeta = {
  name: 'DEGREES',
  signature: 'DEGREES(angle)',
  description: 'ラジアンを度に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return (nums[0] * 180) / Math.PI;
  },
};

const RADIANS: FunctionMeta = {
  name: 'RADIANS',
  signature: 'RADIANS(angle)',
  description: '度をラジアンに変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return (nums[0] * Math.PI) / 180;
  },
};

const SIN: FunctionMeta = {
  name: 'SIN',
  signature: 'SIN(number)',
  description: '角度(ラジアン)の正弦を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.sin(nums[0]);
  },
};

const COS: FunctionMeta = {
  name: 'COS',
  signature: 'COS(number)',
  description: '角度(ラジアン)の余弦を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.cos(nums[0]);
  },
};

const TAN: FunctionMeta = {
  name: 'TAN',
  signature: 'TAN(number)',
  description: '角度(ラジアン)の正接を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.tan(nums[0]);
  },
};

const ASIN: FunctionMeta = {
  name: 'ASIN',
  signature: 'ASIN(number)',
  description: '数値のアークサインをラジアンで返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    if (nums[0] < -1 || nums[0] > 1) return makeError('#NUM!');
    return Math.asin(nums[0]);
  },
};

const ACOS: FunctionMeta = {
  name: 'ACOS',
  signature: 'ACOS(number)',
  description: '数値のアークコサインをラジアンで返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    if (nums[0] < -1 || nums[0] > 1) return makeError('#NUM!');
    return Math.acos(nums[0]);
  },
};

const ATAN: FunctionMeta = {
  name: 'ATAN',
  signature: 'ATAN(number)',
  description: '数値のアークタンジェントをラジアンで返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.atan(nums[0]);
  },
};

const ATAN2: FunctionMeta = {
  name: 'ATAN2',
  signature: 'ATAN2(x_num, y_num)',
  description: '指定したx座標とy座標のアークタンジェントをラジアンで返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const [x, y] = nums;
    if (x === 0 && y === 0) return makeError('#DIV/0!');
    return Math.atan2(y, x);
  },
};

const SINH: FunctionMeta = {
  name: 'SINH',
  signature: 'SINH(number)',
  description: '数値のハイパボリックサインを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.sinh(nums[0]);
  },
};

const COSH: FunctionMeta = {
  name: 'COSH',
  signature: 'COSH(number)',
  description: '数値のハイパボリックコサインを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.cosh(nums[0]);
  },
};

const TANH: FunctionMeta = {
  name: 'TANH',
  signature: 'TANH(number)',
  description: '数値のハイパボリックタンジェントを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.tanh(nums[0]);
  },
};

// ============================================================
// CEILING.MATH / FLOOR.MATH
// ============================================================
const CEILING_MATH: FunctionMeta = {
  name: 'CEILING.MATH',
  signature: 'CEILING.MATH(number, [significance], [mode])',
  description: '数値を指定した基準値の倍数のうち直近の大きい方に丸めます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');
    const number = resolveNumber(args[0], ctx);
    if (isFormulaError(number)) return number;
    let significance = 1;
    if (args.length >= 2) {
      const s = resolveNumber(args[1], ctx);
      if (isFormulaError(s)) return s;
      significance = s;
    }
    let mode = 0;
    if (args.length >= 3) {
      const m = resolveNumber(args[2], ctx);
      if (isFormulaError(m)) return m;
      mode = m;
    }
    if (significance === 0) return 0;
    const sig = Math.abs(significance);
    const ratio = correctFloat(number / sig);
    const rounded = number < 0 && mode !== 0 ? Math.floor(ratio) : Math.ceil(ratio);
    return correctFloat(rounded * sig);
  },
};

const FLOOR_MATH: FunctionMeta = {
  name: 'FLOOR.MATH',
  signature: 'FLOOR.MATH(number, [significance], [mode])',
  description: '数値を指定した基準値の倍数のうち直近の小さい方に丸めます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');
    const number = resolveNumber(args[0], ctx);
    if (isFormulaError(number)) return number;
    let significance = 1;
    if (args.length >= 2) {
      const s = resolveNumber(args[1], ctx);
      if (isFormulaError(s)) return s;
      significance = s;
    }
    let mode = 0;
    if (args.length >= 3) {
      const m = resolveNumber(args[2], ctx);
      if (isFormulaError(m)) return m;
      mode = m;
    }
    if (significance === 0) return 0;
    const sig = Math.abs(significance);
    const ratio = correctFloat(number / sig);
    const rounded = number < 0 && mode !== 0 ? Math.ceil(ratio) : Math.floor(ratio);
    return correctFloat(rounded * sig);
  },
};

// ============================================================
// ISEVEN / ISODD
// ============================================================
const ISEVEN: FunctionMeta = {
  name: 'ISEVEN',
  signature: 'ISEVEN(number)',
  description: '数値が偶数の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.trunc(nums[0]) % 2 === 0;
  },
};

const ISODD: FunctionMeta = {
  name: 'ISODD',
  signature: 'ISODD(number)',
  description: '数値が奇数の場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    return Math.trunc(nums[0]) % 2 !== 0;
  },
};

// ============================================================
// PRODUCT / SUMSQ / GCD / LCM
// ============================================================
const PRODUCT: FunctionMeta = {
  name: 'PRODUCT',
  signature: 'PRODUCT(number1, [number2], ...)',
  description: '引数のすべての数値の積を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    if (nums.length === 0) return 0;
    return nums.reduce((p, n) => p * n, 1);
  },
};

const SUMSQ: FunctionMeta = {
  name: 'SUMSQ',
  signature: 'SUMSQ(number1, [number2], ...)',
  description: '引数の2乗の合計を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    return nums.reduce((s, n) => s + n * n, 0);
  },
};

function gcdOfTwo(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function lcmOfTwo(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcdOfTwo(a, b);
}

const GCD: FunctionMeta = {
  name: 'GCD',
  signature: 'GCD(number1, [number2], ...)',
  description: '最大公約数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const ints = nums.map(n => Math.trunc(n));
    if (ints.some(n => n < 0)) return makeError('#NUM!');
    if (ints.length === 0) return 0;
    return ints.reduce((a, b) => gcdOfTwo(a, b));
  },
};

const LCM: FunctionMeta = {
  name: 'LCM',
  signature: 'LCM(number1, [number2], ...)',
  description: '最小公倍数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
    if (isFormulaError(nums)) return nums;
    const ints = nums.map(n => Math.trunc(n));
    if (ints.some(n => n < 0)) return makeError('#NUM!');
    if (ints.length === 0) return 0;
    return ints.reduce((a, b) => lcmOfTwo(a, b), 1);
  },
};

// ============================================================
// RAND / RANDBETWEEN
// ============================================================
const RAND: FunctionMeta = {
  name: 'RAND',
  signature: 'RAND()',
  description: '0以上1未満の乱数を返します',
  volatile: true,
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return Math.random();
  },
};

const RANDBETWEEN: FunctionMeta = {
  name: 'RANDBETWEEN',
  signature: 'RANDBETWEEN(bottom, top)',
  description: '指定した範囲内の整数の乱数を返します',
  volatile: true,
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nums = resolveNumericArgs(args, ctx, { strictScalar: true });
    if (isFormulaError(nums)) return nums;
    const low = Math.ceil(nums[0]);
    const high = Math.floor(nums[1]);
    if (low > high) return makeError('#NUM!');
    return low + Math.floor(Math.random() * (high - low + 1));
  },
};

// ============================================================
// SUBTOTAL
// ============================================================
function countANonEmpty(args: FunctionArgValue[], ctx: FunctionContext): number {
  let count = 0;
  for (const arg of args) {
    if (arg.kind === 'range' || arg.kind === 'array') {
      for (const val of argToFlat(arg, ctx)) {
        if (typeof val === 'string' && val === '') continue;
        count++;
      }
    } else {
      const val = resolveScalar(arg, ctx);
      if (typeof val === 'string' && val === '') continue;
      count++;
    }
  }
  return count;
}

function subtotalCompute(fnNum: number, args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
  const base = fnNum > 100 ? fnNum - 100 : fnNum;

  if (base === 3) return countANonEmpty(args, ctx);

  if (base === 2) {
    const values = resolveNumericValues(args, ctx);
    if (isFormulaError(values)) return values;
    let count = 0;
    for (const v of values) {
      if (typeof v === 'number') count++;
      else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) count++;
    }
    return count;
  }

  const nums = resolveNumericArgs(args, ctx, { skipNonNumeric: true });
  if (isFormulaError(nums)) return nums;

  switch (base) {
    case 1: // AVERAGE
      if (nums.length === 0) return makeError('#DIV/0!');
      return nums.reduce((s, n) => s + n, 0) / nums.length;
    case 4: // MAX
      return nums.length === 0 ? 0 : Math.max(...nums);
    case 5: // MIN
      return nums.length === 0 ? 0 : Math.min(...nums);
    case 6: // PRODUCT
      return nums.length === 0 ? 0 : nums.reduce((p, n) => p * n, 1);
    case 7: { // STDEV (sample)
      if (nums.length <= 1) return makeError('#DIV/0!');
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
    case 8: { // STDEVP (population)
      if (nums.length === 0) return makeError('#DIV/0!');
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
      return Math.sqrt(variance);
    }
    case 9: // SUM
      return nums.reduce((s, n) => s + n, 0);
    case 10: { // VAR (sample)
      if (nums.length <= 1) return makeError('#DIV/0!');
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
    }
    case 11: { // VARP (population)
      if (nums.length === 0) return makeError('#DIV/0!');
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
    }
    default:
      return makeError('#VALUE!');
  }
}

const SUBTOTAL: FunctionMeta = {
  name: 'SUBTOTAL',
  signature: 'SUBTOTAL(function_num, ref1, [ref2], ...)',
  description: '指定した集計方法でリストまたはデータベースの集計値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2) return makeError('#VALUE!');
    const fnNumVal = resolveNumber(args[0], ctx);
    if (isFormulaError(fnNumVal)) return fnNumVal;
    const fnNum = Math.trunc(fnNumVal);
    return subtotalCompute(fnNum, args.slice(1), ctx);
  },
};

export const mathFunctions: FunctionMeta[] = [
  SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, MOD, POWER, CEILING, FLOOR, SQRT, INT,
  SUMPRODUCT, STDEV, VAR_FN, LARGE, SMALL, RANK,
  ROUNDUP, ROUNDDOWN, TRUNC, SIGN, EXP, LN, LOG, LOG10, PI, EVEN, ODD, MROUND, QUOTIENT,
  FACT, COMBIN, PERMUT, DEGREES, RADIANS, SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2,
  SINH, COSH, TANH, CEILING_MATH, FLOOR_MATH, ISEVEN, ISODD,
  PRODUCT, SUMSQ, GCD, LCM, RAND, RANDBETWEEN, SUBTOTAL,
];
