/**
 * Financial functions: loan/annuity payments (PMT/IPMT/PPMT/FV/PV/NPER/RATE),
 * cash-flow valuation (NPV/XNPV/IRR/XIRR), depreciation (SLN/DDB/DB), and
 * interest-rate conversion (EFFECT/NOMINAL).
 *
 * Excel sign convention: cash paid out (e.g. loan payments) is negative,
 * cash received (e.g. loan principal, deposits) is positive.
 */
import type {
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { argToFlat, resolveNumber, resolveNumericArgs } from './helpers';
import { toNumber } from '../coerce';

// ============================================================
// Core annuity math, shared by PMT/IPMT/PPMT/FV/PV/NPER/RATE
// ============================================================

function computePMT(rate: number, nper: number, pv: number, fv: number, type: 0 | 1): number {
  if (rate === 0) return -(pv + fv) / nper;
  const pow = Math.pow(1 + rate, nper);
  return (-(pv * pow + fv) * rate) / ((pow - 1) * (1 + rate * type));
}

function computeFV(rate: number, nper: number, pmt: number, pv: number, type: 0 | 1): number {
  if (rate === 0) return -(pv + pmt * nper);
  const pow = Math.pow(1 + rate, nper);
  return -(pv * pow + pmt * (1 + rate * type) * ((pow - 1) / rate));
}

function computePV(rate: number, nper: number, pmt: number, fv: number, type: 0 | 1): number {
  if (rate === 0) return -(pmt * nper + fv);
  const pow = Math.pow(1 + rate, nper);
  return -(fv + pmt * (1 + rate * type) * ((pow - 1) / rate)) / pow;
}

function computeNPER(
  rate: number,
  pmt: number,
  pv: number,
  fv: number,
  type: 0 | 1,
): number | FormulaError {
  if (rate === 0) {
    if (pmt === 0) return makeError('#DIV/0!');
    return -(pv + fv) / pmt;
  }
  const k = (pmt * (1 + rate * type)) / rate;
  const numerator = k - fv;
  const denominator = pv + k;
  if (denominator === 0) return makeError('#NUM!');
  // Both numerator and denominator must carry the same sign for the ratio (and its log) to be valid.
  const ratio = numerator / denominator;
  if (!isFinite(ratio) || ratio <= 0) return makeError('#NUM!');
  return Math.log(ratio) / Math.log(1 + rate);
}

/**
 * Interest component of payment number `per`: the rate times the balance outstanding before that
 * payment, signed like FV (so a positive loan `pv` yields negative interest, as in Excel).
 */
function computeIPMT(
  rate: number,
  per: number,
  nper: number,
  pv: number,
  fv: number,
  type: 0 | 1,
): number {
  if (per === 1) {
    return type === 1 ? 0 : -pv * rate;
  }
  const pmt = computePMT(rate, nper, pv, fv, type);
  // type 1 pays at the start of each period, so payment `per` covers interest on the balance
  // left after payment `per - 1`
  const balance =
    type === 1 ? computeFV(rate, per - 2, pmt, pv, 1) - pmt : computeFV(rate, per - 1, pmt, pv, 0);
  return balance * rate;
}

/** Newton's method (numerical derivative) for RATE, max 100 iterations. */
function computeRATE(
  nper: number,
  pmt: number,
  pv: number,
  fv: number,
  type: 0 | 1,
  guess: number,
): number | FormulaError {
  const f = (rate: number): number => {
    if (rate === 0) return pv + pmt * nper + fv;
    const pow = Math.pow(1 + rate, nper);
    return pv * pow + pmt * (1 + rate * type) * ((pow - 1) / rate) + fv;
  };

  let rate = guess;
  const EPS = 1e-10;
  const h = 1e-6;
  for (let i = 0; i < 100; i++) {
    const fVal = f(rate);
    if (Math.abs(fVal) < EPS) return rate;
    const derivative = (f(rate + h) - f(rate - h)) / (2 * h);
    if (derivative === 0 || !isFinite(derivative)) return makeError('#NUM!');
    const newRate = rate - fVal / derivative;
    if (!isFinite(newRate)) return makeError('#NUM!');
    if (Math.abs(newRate - rate) < EPS) return newRate;
    rate = newRate;
  }
  return makeError('#NUM!');
}

/** Resolve an optional trailing argument, falling back to `def` when omitted or absent. */
function optionalNumber(
  args: FunctionArgValue[],
  index: number,
  ctx: FunctionContext,
  def: number,
): number | FormulaError {
  if (args.length <= index || args[index].kind === 'omitted') return def;
  return resolveNumber(args[index], ctx);
}

function asType(n: number): 0 | 1 {
  return n === 1 ? 1 : 0;
}

// ============================================================
// PMT / IPMT / PPMT
// ============================================================
const PMT: FunctionMeta = {
  name: 'PMT',
  signature: 'PMT(rate, nper, pv, [fv], [type])',
  description: '一定利率のローンや投資の定期支払額を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 5) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const nper = resolveNumber(args[1], ctx);
    if (isFormulaError(nper)) return nper;
    const pv = resolveNumber(args[2], ctx);
    if (isFormulaError(pv)) return pv;
    const fv = optionalNumber(args, 3, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    if (nper === 0) return makeError('#DIV/0!');
    return computePMT(rate, nper, pv, fv, asType(typeVal));
  },
};

const IPMT: FunctionMeta = {
  name: 'IPMT',
  signature: 'IPMT(rate, per, nper, pv, [fv], [type])',
  description: '指定した支払期における利息の支払額を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 4 || args.length > 6) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const perVal = resolveNumber(args[1], ctx);
    if (isFormulaError(perVal)) return perVal;
    const per = Math.trunc(perVal);
    const nper = resolveNumber(args[2], ctx);
    if (isFormulaError(nper)) return nper;
    const pv = resolveNumber(args[3], ctx);
    if (isFormulaError(pv)) return pv;
    const fv = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 5, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    if (per < 1 || per > nper) return makeError('#NUM!');
    if (rate === 0) return 0;
    return computeIPMT(rate, per, nper, pv, fv, asType(typeVal));
  },
};

const PPMT: FunctionMeta = {
  name: 'PPMT',
  signature: 'PPMT(rate, per, nper, pv, [fv], [type])',
  description: '指定した支払期における元金の返済額を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 4 || args.length > 6) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const perVal = resolveNumber(args[1], ctx);
    if (isFormulaError(perVal)) return perVal;
    const per = Math.trunc(perVal);
    const nper = resolveNumber(args[2], ctx);
    if (isFormulaError(nper)) return nper;
    const pv = resolveNumber(args[3], ctx);
    if (isFormulaError(pv)) return pv;
    const fv = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 5, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    if (per < 1 || per > nper) return makeError('#NUM!');
    const type = asType(typeVal);
    const pmt = computePMT(rate, nper, pv, fv, type);
    if (rate === 0) return pmt;
    return pmt - computeIPMT(rate, per, nper, pv, fv, type);
  },
};

// ============================================================
// FV / PV / NPER / RATE
// ============================================================
const FV: FunctionMeta = {
  name: 'FV',
  signature: 'FV(rate, nper, pmt, [pv], [type])',
  description: '一定利率の投資の将来価値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 5) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const nper = resolveNumber(args[1], ctx);
    if (isFormulaError(nper)) return nper;
    const pmt = resolveNumber(args[2], ctx);
    if (isFormulaError(pmt)) return pmt;
    const pv = optionalNumber(args, 3, ctx, 0);
    if (isFormulaError(pv)) return pv;
    const typeVal = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    return computeFV(rate, nper, pmt, pv, asType(typeVal));
  },
};

const PV: FunctionMeta = {
  name: 'PV',
  signature: 'PV(rate, nper, pmt, [fv], [type])',
  description: '一定利率の投資の現在価値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 5) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const nper = resolveNumber(args[1], ctx);
    if (isFormulaError(nper)) return nper;
    const pmt = resolveNumber(args[2], ctx);
    if (isFormulaError(pmt)) return pmt;
    const fv = optionalNumber(args, 3, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    return computePV(rate, nper, pmt, fv, asType(typeVal));
  },
};

const NPER: FunctionMeta = {
  name: 'NPER',
  signature: 'NPER(rate, pmt, pv, [fv], [type])',
  description: '一定利率のローンや投資の支払回数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 5) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;
    const pmt = resolveNumber(args[1], ctx);
    if (isFormulaError(pmt)) return pmt;
    const pv = resolveNumber(args[2], ctx);
    if (isFormulaError(pv)) return pv;
    const fv = optionalNumber(args, 3, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    return computeNPER(rate, pmt, pv, fv, asType(typeVal));
  },
};

const RATE: FunctionMeta = {
  name: 'RATE',
  signature: 'RATE(nper, pmt, pv, [fv], [type], [guess])',
  description: 'ローンや投資の利率をニュートン法による近似計算で返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 6) return makeError('#VALUE!');
    const nper = resolveNumber(args[0], ctx);
    if (isFormulaError(nper)) return nper;
    const pmt = resolveNumber(args[1], ctx);
    if (isFormulaError(pmt)) return pmt;
    const pv = resolveNumber(args[2], ctx);
    if (isFormulaError(pv)) return pv;
    const fv = optionalNumber(args, 3, ctx, 0);
    if (isFormulaError(fv)) return fv;
    const typeVal = optionalNumber(args, 4, ctx, 0);
    if (isFormulaError(typeVal)) return typeVal;
    const guess = optionalNumber(args, 5, ctx, 0.1);
    if (isFormulaError(guess)) return guess;
    if (nper <= 0) return makeError('#NUM!');
    return computeRATE(nper, pmt, pv, fv, asType(typeVal), guess);
  },
};

// ============================================================
// NPV / XNPV / IRR / XIRR
// ============================================================
const NPV: FunctionMeta = {
  name: 'NPV',
  signature: 'NPV(rate, value1, [value2, ...])',
  description: '定期的なキャッシュフローの正味現在価値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;

    const values = resolveNumericArgs(args.slice(1), ctx, { skipNonNumeric: true });
    if (isFormulaError(values)) return values;

    let npv = 0;
    for (let i = 0; i < values.length; i++) {
      npv += values[i] / Math.pow(1 + rate, i + 1);
    }
    return npv;
  },
};

/** Read parallel values/dates range arguments, coercing every element to a number. */
function readValueDatePair(
  valuesArg: FunctionArgValue,
  datesArg: FunctionArgValue,
  ctx: FunctionContext,
): { values: number[]; dates: number[] } | FormulaError {
  if (
    (valuesArg.kind !== 'range' && valuesArg.kind !== 'array') ||
    (datesArg.kind !== 'range' && datesArg.kind !== 'array')
  ) {
    return makeError('#VALUE!');
  }
  const valuesFlat = argToFlat(valuesArg, ctx);
  const datesFlat = argToFlat(datesArg, ctx);
  if (valuesFlat.length !== datesFlat.length || valuesFlat.length < 2) return makeError('#NUM!');

  const values: number[] = [];
  for (const v of valuesFlat) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) return n;
    values.push(n);
  }
  const dates: number[] = [];
  for (const d of datesFlat) {
    if (isFormulaError(d)) return d;
    const n = toNumber(d);
    if (isFormulaError(n)) return n;
    dates.push(n);
  }
  return { values, dates };
}

const XNPV: FunctionMeta = {
  name: 'XNPV',
  signature: 'XNPV(rate, values, dates)',
  description: '不定期なキャッシュフローの正味現在価値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const rate = resolveNumber(args[0], ctx);
    if (isFormulaError(rate)) return rate;

    const pair = readValueDatePair(args[1], args[2], ctx);
    if (isFormulaError(pair)) return pair;
    const { values, dates } = pair;

    const d0 = dates[0];
    let xnpv = 0;
    for (let i = 0; i < values.length; i++) {
      xnpv += values[i] / Math.pow(1 + rate, (dates[i] - d0) / 365);
    }
    return xnpv;
  },
};

/** Newton's method with a bisection fallback (used by IRR/XIRR). */
function solveForRate(
  guess: number,
  npvAt: (rate: number) => number,
  dNpvAt: (rate: number) => number,
): number | FormulaError {
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npvAt(rate);
    const d = dNpvAt(rate);
    if (d === 0 || !isFinite(d)) break;
    const newRate = rate - f / d;
    if (!isFinite(newRate)) break;
    if (Math.abs(newRate - rate) < 1e-10) return newRate;
    rate = newRate;
  }

  // Bisection fallback over a wide range.
  let lo = -0.999999;
  let hi = 10;
  let fLo = npvAt(lo);
  const fHi = npvAt(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return makeError('#NUM!');
  let mid = rate;
  for (let i = 0; i < 200; i++) {
    mid = (lo + hi) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-10) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return mid;
}

const IRR: FunctionMeta = {
  name: 'IRR',
  signature: 'IRR(values, [guess])',
  description: 'キャッシュフローの内部収益率を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const valuesArg = args[0];
    if (valuesArg.kind !== 'range' && valuesArg.kind !== 'array') return makeError('#VALUE!');

    const nums: number[] = [];
    for (const v of argToFlat(valuesArg, ctx)) {
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') nums.push(v);
    }
    if (nums.length < 2) return makeError('#NUM!');

    const guess = optionalNumber(args, 1, ctx, 0.1);
    if (isFormulaError(guess)) return guess;

    const npvAt = (rate: number): number => {
      let sum = 0;
      for (let i = 0; i < nums.length; i++) sum += nums[i] / Math.pow(1 + rate, i);
      return sum;
    };
    const dNpvAt = (rate: number): number => {
      let sum = 0;
      for (let i = 1; i < nums.length; i++) sum += (-i * nums[i]) / Math.pow(1 + rate, i + 1);
      return sum;
    };

    return solveForRate(guess, npvAt, dNpvAt);
  },
};

const XIRR: FunctionMeta = {
  name: 'XIRR',
  signature: 'XIRR(values, dates, [guess])',
  description: '不定期なキャッシュフローの内部収益率を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const pair = readValueDatePair(args[0], args[1], ctx);
    if (isFormulaError(pair)) return pair;
    const { values: nums, dates } = pair;

    const guess = optionalNumber(args, 2, ctx, 0.1);
    if (isFormulaError(guess)) return guess;

    const d0 = dates[0];
    const npvAt = (rate: number): number => {
      let sum = 0;
      for (let i = 0; i < nums.length; i++)
        sum += nums[i] / Math.pow(1 + rate, (dates[i] - d0) / 365);
      return sum;
    };
    const dNpvAt = (rate: number): number => {
      let sum = 0;
      for (let i = 0; i < nums.length; i++) {
        const t = (dates[i] - d0) / 365;
        if (t === 0) continue;
        sum += (-t * nums[i]) / Math.pow(1 + rate, t + 1);
      }
      return sum;
    };

    return solveForRate(guess, npvAt, dNpvAt);
  },
};

// ============================================================
// SLN / DDB / DB (depreciation)
// ============================================================
const SLN: FunctionMeta = {
  name: 'SLN',
  signature: 'SLN(cost, salvage, life)',
  description: '定額法による1期分の減価償却費を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const cost = resolveNumber(args[0], ctx);
    if (isFormulaError(cost)) return cost;
    const salvage = resolveNumber(args[1], ctx);
    if (isFormulaError(salvage)) return salvage;
    const life = resolveNumber(args[2], ctx);
    if (isFormulaError(life)) return life;
    if (life === 0) return makeError('#DIV/0!');
    return (cost - salvage) / life;
  },
};

const DDB: FunctionMeta = {
  name: 'DDB',
  signature: 'DDB(cost, salvage, life, period, [factor])',
  description: '倍率逓減法による指定期間の減価償却費を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 4 || args.length > 5) return makeError('#VALUE!');
    const cost = resolveNumber(args[0], ctx);
    if (isFormulaError(cost)) return cost;
    const salvage = resolveNumber(args[1], ctx);
    if (isFormulaError(salvage)) return salvage;
    const life = resolveNumber(args[2], ctx);
    if (isFormulaError(life)) return life;
    const periodVal = resolveNumber(args[3], ctx);
    if (isFormulaError(periodVal)) return periodVal;
    const period = Math.trunc(periodVal);
    const factor = optionalNumber(args, 4, ctx, 2);
    if (isFormulaError(factor)) return factor;
    if (life <= 0 || period < 1 || period > life) return makeError('#NUM!');

    const rate = factor / life;
    let bookValue = cost;
    let depreciation = 0;
    for (let p = 1; p <= period; p++) {
      depreciation = Math.max(0, Math.min(bookValue * rate, bookValue - salvage));
      bookValue -= depreciation;
    }
    return depreciation;
  },
};

const DB: FunctionMeta = {
  name: 'DB',
  signature: 'DB(cost, salvage, life, period, [month])',
  description: '定率法による指定期間の減価償却費を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 4 || args.length > 5) return makeError('#VALUE!');
    const cost = resolveNumber(args[0], ctx);
    if (isFormulaError(cost)) return cost;
    const salvage = resolveNumber(args[1], ctx);
    if (isFormulaError(salvage)) return salvage;
    const life = resolveNumber(args[2], ctx);
    if (isFormulaError(life)) return life;
    const periodVal = resolveNumber(args[3], ctx);
    if (isFormulaError(periodVal)) return periodVal;
    const period = Math.trunc(periodVal);
    const monthVal = optionalNumber(args, 4, ctx, 12);
    if (isFormulaError(monthVal)) return monthVal;
    const month = Math.trunc(monthVal);
    if (life <= 0 || cost <= 0 || period < 1 || salvage < 0) return makeError('#NUM!');

    const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;

    let totalDep = 0;
    let dep = 0;
    for (let p = 1; p <= period; p++) {
      if (p === 1) {
        dep = cost * rate * (month / 12);
      } else if (p === life + 1) {
        dep = (cost - totalDep) * rate * ((12 - month) / 12);
      } else {
        dep = (cost - totalDep) * rate;
      }
      totalDep += dep;
    }
    return dep;
  },
};

// ============================================================
// EFFECT / NOMINAL
// ============================================================
const EFFECT: FunctionMeta = {
  name: 'EFFECT',
  signature: 'EFFECT(nominal_rate, npery)',
  description: '名目年利率と複利計算期間数から実効年利率を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const nominal = resolveNumber(args[0], ctx);
    if (isFormulaError(nominal)) return nominal;
    const nperyVal = resolveNumber(args[1], ctx);
    if (isFormulaError(nperyVal)) return nperyVal;
    const npery = Math.trunc(nperyVal);
    if (nominal <= 0 || npery < 1) return makeError('#NUM!');
    return Math.pow(1 + nominal / npery, npery) - 1;
  },
};

const NOMINAL: FunctionMeta = {
  name: 'NOMINAL',
  signature: 'NOMINAL(effect_rate, npery)',
  description: '実効年利率と複利計算期間数から名目年利率を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const effect = resolveNumber(args[0], ctx);
    if (isFormulaError(effect)) return effect;
    const nperyVal = resolveNumber(args[1], ctx);
    if (isFormulaError(nperyVal)) return nperyVal;
    const npery = Math.trunc(nperyVal);
    if (effect <= 0 || npery < 1) return makeError('#NUM!');
    return npery * (Math.pow(1 + effect, 1 / npery) - 1);
  },
};

export const financialFunctions: FunctionMeta[] = [
  PMT,
  IPMT,
  PPMT,
  FV,
  PV,
  NPER,
  RATE,
  NPV,
  XNPV,
  IRR,
  XIRR,
  SLN,
  DDB,
  DB,
  EFFECT,
  NOMINAL,
];
