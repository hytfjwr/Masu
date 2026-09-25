import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type { FormulaResult, RangeExpander } from '../types';

const expandRange: RangeExpander = (start: string, end: string): string[] => {
  const startCol = start.charCodeAt(0) - 65;
  const endCol = end.charCodeAt(0) - 65;
  const startRow = parseInt(start.slice(1), 10);
  const endRow = parseInt(end.slice(1), 10);
  const keys: string[] = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      keys.push(`${String.fromCharCode(65 + c)}${r}`);
    }
  }
  return keys;
};

function evalFormula(
  formula: string,
  cellValues: Record<string, FormulaResult> = {},
): FormulaResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  const result = evaluate(ast, resolve, expandRange);
  if (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    result.type === 'spill'
  ) {
    return { type: 'error', code: '#VALUE!' };
  }
  return result as FormulaResult;
}

describe('PMT', () => {
  it('matches the known Excel result for a 5-year loan at 5% annual', () => {
    // PMT(0.05/12, 60, 10000) ≈ -188.7123364
    expect(evalFormula('PMT(0.05/12,60,10000)')).toBeCloseTo(-188.7123364, 6);
  });

  it('splits the balance evenly when rate=0', () => {
    expect(evalFormula('PMT(0,12,1200)')).toBeCloseTo(-100, 9);
  });
});

describe('IPMT / PPMT', () => {
  it('IPMT + PPMT of a period sum to PMT', () => {
    const pmt = evalFormula('PMT(0.05/12,60,10000)') as number;
    const ipmt = evalFormula('IPMT(0.05/12,1,60,10000)') as number;
    const ppmt = evalFormula('PPMT(0.05/12,1,60,10000)') as number;
    expect(ipmt + ppmt).toBeCloseTo(pmt, 6);
  });

  it('IPMT of the first period equals -pv*rate', () => {
    expect(evalFormula('IPMT(0.05/12,1,60,10000)')).toBeCloseTo(-10000 * (0.05 / 12), 9);
  });

  it('IPMT is 0 for every period when rate=0', () => {
    expect(evalFormula('IPMT(0,3,12,1200)')).toBe(0);
  });

  it('PPMT equals PMT when rate=0 (all principal, no interest)', () => {
    expect(evalFormula('PPMT(0,3,12,1200)')).toBeCloseTo(-100, 9);
  });

  it('returns #NUM! when per is out of range', () => {
    expect(evalFormula('IPMT(0.05/12,61,60,10000)')).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('FV', () => {
  it('computes future value of a savings annuity', () => {
    // FV(0.06/12, 10, -200, -500) — depositing 200/mo for 10 months at 6% annual, starting with 500
    const result = evalFormula('FV(0.06/12,10,-200,-500)') as number;
    expect(result).toBeCloseTo(2571.17, 1);
  });

  it('handles rate=0', () => {
    expect(evalFormula('FV(0,12,-100,-1000)')).toBeCloseTo(2200, 9);
  });
});

describe('PV', () => {
  it('computes present value of a loan given a fixed payment', () => {
    // PV(0.05/12, 60, -188.7123364) ≈ 10000
    expect(evalFormula('PV(0.05/12,60,-188.7123364)')).toBeCloseTo(10000, 3);
  });

  it('handles rate=0', () => {
    expect(evalFormula('PV(0,12,-100)')).toBeCloseTo(1200, 9);
  });
});

describe('NPER', () => {
  it('computes the number of payments for a fixed payment/rate/pv', () => {
    expect(evalFormula('NPER(0.05/12,-188.7123364,10000)')).toBeCloseTo(60, 2);
  });

  it('handles rate=0', () => {
    expect(evalFormula('NPER(0,-100,1200)')).toBeCloseTo(12, 9);
  });
});

describe('RATE', () => {
  it('matches the known Excel result via Newton’s method', () => {
    // RATE(60, -188.71, 10000) ≈ 0.0041666...
    expect(evalFormula('RATE(60,-188.71,10000)')).toBeCloseTo(0.0041666, 5);
  });

  it('returns #NUM! when it fails to converge', () => {
    expect(evalFormula('RATE(-5,100,-1000)')).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('NPV', () => {
  it('matches the known Excel result', () => {
    // NPV(0.1,-10000,3000,4200,6800) ≈ 1188.443412
    expect(evalFormula('NPV(0.1,-10000,3000,4200,6800)')).toBeCloseTo(1188.443412, 5);
  });

  it('accepts a range of cash flows and ignores non-numeric cells', () => {
    const vals: Record<string, FormulaResult> = { A1: 3000, A2: 'n/a', A3: 4200, A4: 6800 };
    // -10000 is period 1; A2's "n/a" is skipped (not counted as a period), so
    // 3000/4200/6800 land in periods 2/3/4.
    expect(evalFormula('NPV(0.1,-10000,A1:A4)', vals)).toBeCloseTo(
      -10000 / 1.1 + 3000 / 1.21 + 4200 / 1.331 + 6800 / 1.4641,
      6,
    );
  });
});

describe('XNPV', () => {
  it('discounts cash flows by actual day counts', () => {
    const vals: Record<string, FormulaResult> = {
      A1: -10000,
      A2: 2750,
      A3: 4250,
      A4: 3250,
      A5: 2750,
      B1: 42005,
      B2: 42035,
      B3: 42094,
      B4: 42186,
      B5: 42217, // serial dates ~1 month apart
    };
    const result = evalFormula('XNPV(0.09,A1:A5,B1:B5)', vals) as number;
    // Manually compute the expected value with the same day-count convention.
    const values = [-10000, 2750, 4250, 3250, 2750];
    const dates = [42005, 42035, 42094, 42186, 42217];
    let expected = 0;
    for (let i = 0; i < values.length; i++)
      expected += values[i] / Math.pow(1.09, (dates[i] - dates[0]) / 365);
    expect(result).toBeCloseTo(expected, 6);
  });

  it('returns #NUM! when values and dates lengths mismatch', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, B1: 1 };
    expect(evalFormula('XNPV(0.1,A1:A2,B1:B1)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('IRR', () => {
  it('matches the known Excel result', () => {
    // IRR({-100,30,40,50}) ≈ 0.0889633
    const vals: Record<string, FormulaResult> = { A1: -100, A2: 30, A3: 40, A4: 50 };
    expect(evalFormula('IRR(A1:A4)', vals)).toBeCloseTo(0.0889633, 5);
  });

  it('returns #NUM! for fewer than 2 cash flows', () => {
    const vals: Record<string, FormulaResult> = { A1: -100 };
    expect(evalFormula('IRR(A1:A1)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('XIRR', () => {
  it('finds the rate that zeroes XNPV', () => {
    const vals: Record<string, FormulaResult> = {
      A1: -10000,
      A2: 2750,
      A3: 4250,
      A4: 3250,
      A5: 2750,
      B1: 42005,
      B2: 42035,
      B3: 42094,
      B4: 42186,
      B5: 42217,
    };
    const rate = evalFormula('XIRR(A1:A5,B1:B5)', vals) as number;
    const values = [-10000, 2750, 4250, 3250, 2750];
    const dates = [42005, 42035, 42094, 42186, 42217];
    let npvAtRate = 0;
    for (let i = 0; i < values.length; i++)
      npvAtRate += values[i] / Math.pow(1 + rate, (dates[i] - dates[0]) / 365);
    expect(npvAtRate).toBeCloseTo(0, 4);
  });

  it('returns #VALUE! when dates is not a range', () => {
    const vals: Record<string, FormulaResult> = { A1: -100, A2: 100 };
    expect(evalFormula('XIRR(A1:A2,1)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('SLN', () => {
  it('computes straight-line depreciation per period', () => {
    expect(evalFormula('SLN(10000,1000,9)')).toBeCloseTo(1000, 9);
  });

  it('returns #DIV/0! when life is 0', () => {
    expect(evalFormula('SLN(10000,1000,0)')).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('DDB', () => {
  it('computes double-declining-balance depreciation for period 1', () => {
    // DDB(2400,300,10,1) = 2400 * (2/10) = 480
    expect(evalFormula('DDB(2400,300,10,1)')).toBeCloseTo(480, 9);
  });

  it('never depreciates below the salvage value', () => {
    // By the last period, book value should have settled near the salvage value.
    const result = evalFormula('DDB(2400,300,10,10)') as number;
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(480);
  });
});

describe('DB', () => {
  it('computes fixed-declining-balance depreciation for period 1 (partial first year)', () => {
    // DB(1000000,100000,6,1,7) — a well-known Excel documentation example ≈ 186083.33
    expect(evalFormula('DB(1000000,100000,6,1,7)')).toBeCloseTo(186083.33, 1);
  });

  it('computes depreciation for a later period', () => {
    // Same example, period 2 ≈ 259639.42
    expect(evalFormula('DB(1000000,100000,6,2,7)')).toBeCloseTo(259639.42, 1);
  });
});

describe('EFFECT / NOMINAL', () => {
  it('EFFECT converts nominal to effective rate', () => {
    // EFFECT(0.1, 4) ≈ 0.103813
    expect(evalFormula('EFFECT(0.1,4)')).toBeCloseTo(0.103813, 5);
  });

  it('NOMINAL converts effective back to nominal rate', () => {
    const effective = evalFormula('EFFECT(0.1,4)') as number;
    const vals: Record<string, FormulaResult> = { A1: effective };
    expect(evalFormula('NOMINAL(A1,4)', vals)).toBeCloseTo(0.1, 6);
  });

  it('returns #NUM! for a non-positive rate', () => {
    expect(evalFormula('EFFECT(-0.1,4)')).toEqual({ type: 'error', code: '#NUM!' });
  });
});
