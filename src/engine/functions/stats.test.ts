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

function evalFormula(formula: string, cellValues: Record<string, FormulaResult>): FormulaResult {
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

/** Like evalFormula, but preserves a spill result (for array-returning functions like MODE.MULT). */
function evalRaw(formula: string, cellValues: Record<string, FormulaResult>) {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  return evaluate(parse(formula), resolve, expandRange);
}

describe('MEDIAN', () => {
  it('returns the middle value for an odd count', () => {
    expect(evalFormula('MEDIAN(3,1,5)', {})).toBe(3);
  });

  it('averages the two middle values for an even count', () => {
    expect(evalFormula('MEDIAN(1,2,3,4)', {})).toBeCloseTo(2.5, 9);
  });
});

describe('MODE', () => {
  it('returns the most frequent value', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 2, A4: 3 };
    expect(evalFormula('MODE(A1:A4)', vals)).toBe(2);
  });

  it('returns #N/A when there are no duplicates', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('MODE(A1:A3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('STDEVP / VARP', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 4,
    A3: 4,
    A4: 4,
    A5: 5,
    A6: 5,
    A7: 7,
    A8: 9,
  };

  it('computes population standard deviation', () => {
    expect(evalFormula('STDEVP(A1:A8)', vals) as number).toBeCloseTo(2.0, 1);
  });

  it('computes population variance', () => {
    expect(evalFormula('VARP(A1:A8)', vals) as number).toBeCloseTo(4.0, 1);
  });

  it('returns #DIV/0! for an empty set', () => {
    expect(evalFormula('STDEVP(A1:A1)', { A1: '' })).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('STDEVA / VARA / AVERAGEA / MAXA / MINA', () => {
  // 'x' -> 0, TRUE -> 1, FALSE -> 0, 4 -> 4, 6 -> 6
  const vals: Record<string, FormulaResult> = { A1: 'x', A2: true, A3: 4, A4: false, A5: 6 };

  it('AVERAGEA counts text as 0 and TRUE as 1', () => {
    expect(evalFormula('AVERAGEA(A1:A5)', vals) as number).toBeCloseTo(2.2, 9);
  });

  it('STDEVA / VARA compute the sample stdev/variance over the coerced values', () => {
    expect(evalFormula('STDEVA(A1:A5)', vals) as number).toBeCloseTo(2.6832815729997477, 9);
    expect(evalFormula('VARA(A1:A5)', vals) as number).toBeCloseTo(7.2, 9);
  });

  it('MAXA / MINA find the extremes among the coerced values', () => {
    expect(evalFormula('MAXA(A1:A5)', vals)).toBe(6);
    expect(evalFormula('MINA(A1:A5)', vals)).toBe(0);
  });
});

describe('COUNTBLANK', () => {
  it('counts empty cells in a range', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: '', A3: '', A4: 4 };
    expect(evalFormula('COUNTBLANK(A1:A4)', vals)).toBe(2);
  });

  it('returns 0 when there are no blank cells', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2 };
    expect(evalFormula('COUNTBLANK(A1:A2)', vals)).toBe(0);
  });
});

describe('PERCENTILE / QUARTILE', () => {
  const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4 };

  it('PERCENTILE interpolates between ranked values', () => {
    expect(evalFormula('PERCENTILE(A1:A4,0.75)', vals) as number).toBeCloseTo(3.25, 9);
  });

  it('QUARTILE returns the requested quartile', () => {
    expect(evalFormula('QUARTILE(A1:A4,1)', vals) as number).toBeCloseTo(1.75, 9);
  });

  it('returns #NUM! for k outside [0,1] / quart outside [0,4]', () => {
    expect(evalFormula('PERCENTILE(A1:A4,1.5)', vals)).toEqual({ type: 'error', code: '#NUM!' });
    expect(evalFormula('QUARTILE(A1:A4,5)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('PERCENTRANK', () => {
  it('matches a known example (ranked data, default significance)', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 13,
      A2: 12,
      A3: 11,
      A4: 8,
      A5: 4,
      A6: 3,
      A7: 2,
      A8: 1,
      A9: 1,
      A10: 1,
    };
    expect(evalFormula('PERCENTRANK(A1:A10,2)', vals)).toBeCloseTo(0.333, 9);
  });

  it('returns #N/A when x is outside the data range', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('PERCENTRANK(A1:A3,10)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('CORREL / PEARSON', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 6,
    A2: 5,
    A3: 11,
    A4: 7,
    A5: 5,
    B1: 2,
    B2: 3,
    B3: 9,
    B4: 1,
    B5: 8,
  };

  it('CORREL computes the Pearson correlation coefficient', () => {
    expect(evalFormula('CORREL(A1:A5,B1:B5)', vals) as number).toBeCloseTo(0.4570107664486825, 9);
  });

  it('PEARSON gives the identical result', () => {
    expect(evalFormula('PEARSON(A1:A5,B1:B5)', vals) as number).toBeCloseTo(0.4570107664486825, 9);
  });

  it('returns #DIV/0! when one array has no variance', () => {
    const flat: Record<string, FormulaResult> = { A1: 1, A2: 1, A3: 1, B1: 1, B2: 2, B3: 3 };
    expect(evalFormula('CORREL(A1:A3,B1:B3)', flat)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('COVAR', () => {
  it('computes the population covariance', () => {
    const vals: Record<string, FormulaResult> = { A1: 2, A2: 4, A3: 6, B1: 3, B2: 6, B3: 9 };
    expect(evalFormula('COVAR(A1:A3,B1:B3)', vals) as number).toBeCloseTo(4, 9);
  });

  it('returns #N/A when arrays have different lengths', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, B1: 1 };
    expect(evalFormula('COVAR(A1:A2,B1:B1)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('SLOPE / INTERCEPT / RSQ', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 3,
    A3: 9,
    A4: 1,
    A5: 8,
    B1: 6,
    B2: 5,
    B3: 11,
    B4: 7,
    B5: 5,
  };

  it('SLOPE returns the regression slope', () => {
    expect(evalFormula('SLOPE(A1:A5,B1:B5)', vals) as number).toBeCloseTo(0.6693548387096776, 9);
  });

  it('INTERCEPT returns the regression intercept', () => {
    expect(evalFormula('INTERCEPT(A1:A5,B1:B5)', vals) as number).toBeCloseTo(
      0.04838709677419217,
      9,
    );
  });

  it('RSQ returns the coefficient of determination', () => {
    expect(evalFormula('RSQ(A1:A5,B1:B5)', vals) as number).toBeCloseTo(0.2088588406500122, 9);
  });

  it('returns #DIV/0! when known_xs has no variance', () => {
    const flat: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, B1: 5, B2: 5, B3: 5 };
    expect(evalFormula('SLOPE(A1:A3,B1:B3)', flat)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('STEYX / FORECAST', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 3,
    A3: 9,
    A4: 1,
    A5: 8,
    B1: 6,
    B2: 5,
    B3: 11,
    B4: 7,
    B5: 5,
  };

  it('STEYX returns the standard error of the estimate', () => {
    expect(evalFormula('STEYX(A1:A5,B1:B5)', vals) as number).toBeCloseTo(3.74560674557182, 9);
  });

  it('FORECAST predicts a value along the regression line', () => {
    expect(evalFormula('FORECAST(10,A1:A5,B1:B5)', vals) as number).toBeCloseTo(
      6.741935483870968,
      9,
    );
  });

  it('STEYX returns #DIV/0! with fewer than 3 points', () => {
    const flat: Record<string, FormulaResult> = { A1: 1, A2: 2, B1: 1, B2: 2 };
    expect(evalFormula('STEYX(A1:A2,B1:B2)', flat)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('GEOMEAN / HARMEAN', () => {
  it('GEOMEAN returns the geometric mean', () => {
    expect(evalFormula('GEOMEAN(4,9)', {})).toBeCloseTo(6, 9);
  });

  it('HARMEAN returns the harmonic mean', () => {
    expect(evalFormula('HARMEAN(4,9)', {})).toBeCloseTo(5.538461538461538, 9);
  });

  it('returns #NUM! for non-positive values', () => {
    expect(evalFormula('GEOMEAN(4,-9)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('AVEDEV / DEVSQ', () => {
  const vals: Record<string, FormulaResult> = { A1: 4, A2: 5, A3: 6, A4: 7, A5: 5, A6: 4, A7: 3 };

  it('AVEDEV returns the mean absolute deviation', () => {
    expect(evalFormula('AVEDEV(A1:A7)', vals) as number).toBeCloseTo(1.0204081632653061, 9);
  });

  it('DEVSQ returns the sum of squared deviations', () => {
    expect(evalFormula('DEVSQ(A1:A7)', vals) as number).toBeCloseTo(10.857142857142856, 9);
  });
});

describe('KURT / SKEW', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 3,
    A2: 4,
    A3: 5,
    A4: 2,
    A5: 3,
    A6: 4,
    A7: 5,
    A8: 6,
    A9: 4,
    A10: 7,
  };

  it('SKEW returns the dataset skewness', () => {
    expect(evalFormula('SKEW(A1:A10)', vals) as number).toBeCloseTo(0.3595430714067974, 9);
  });

  it('KURT returns the dataset excess kurtosis', () => {
    expect(evalFormula('KURT(A1:A10)', vals) as number).toBeCloseTo(-0.15179963720841627, 9);
  });

  it('SKEW returns #DIV/0! with fewer than 3 points', () => {
    expect(evalFormula('SKEW(1,2)', {})).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('NORMDIST / NORMINV', () => {
  it('NORMDIST computes the cumulative distribution', () => {
    expect(evalFormula('NORMDIST(0,0,1,TRUE)', {})).toBeCloseTo(0.5, 9);
  });

  it('NORMDIST computes the density (non-cumulative)', () => {
    expect(evalFormula('NORMDIST(0,0,1,FALSE)', {}) as number).toBeCloseTo(
      1 / Math.sqrt(2 * Math.PI),
      9,
    );
  });

  it('NORMINV inverts NORMDIST', () => {
    expect(evalFormula('NORMINV(0.975,0,1)', {}) as number).toBeCloseTo(1.959963984540054, 6);
  });

  it('returns #NUM! for a non-positive standard deviation', () => {
    expect(evalFormula('NORMDIST(0,0,-1,TRUE)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('NORMSDIST / NORMSINV', () => {
  it('NORMSDIST is the standard normal CDF', () => {
    expect(evalFormula('NORMSDIST(1.96)', {}) as number).toBeCloseTo(0.9750021048517795, 6);
  });

  it('NORMSINV inverts NORMSDIST', () => {
    expect(evalFormula('NORMSINV(0.5)', {})).toBeCloseTo(0, 9);
  });

  it('NORMSINV returns #NUM! outside (0,1)', () => {
    expect(evalFormula('NORMSINV(0)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('STANDARDIZE', () => {
  it('computes the Z-score', () => {
    expect(evalFormula('STANDARDIZE(42,40,1.5)', {}) as number).toBeCloseTo(1.3333333333333333, 9);
  });

  it('returns #NUM! for a non-positive standard deviation', () => {
    expect(evalFormula('STANDARDIZE(42,40,0)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('CONFIDENCE', () => {
  it('matches the documented Excel example', () => {
    expect(evalFormula('CONFIDENCE(0.05,2.5,50)', {}) as number).toBeCloseTo(0.692952, 5);
  });

  it('returns #NUM! for alpha outside (0,1)', () => {
    expect(evalFormula('CONFIDENCE(1.5,2.5,50)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('COUNTUNIQUE', () => {
  it('counts unique values, case-sensitively, excluding blanks', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 1,
      A3: 2,
      A4: 'a',
      A5: 'A',
      A6: true,
      A7: true,
      A8: '',
      A9: 5,
    };
    expect(evalFormula('COUNTUNIQUE(A1:A9)', vals)).toBe(6);
  });

  it('returns #VALUE! when called with no arguments', () => {
    expect(() => evalFormula('COUNTUNIQUE()', {})).not.toThrow();
    expect(evalFormula('COUNTUNIQUE()', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('MINIFS / MAXIFS', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 10,
    A2: 20,
    A3: 5,
    A4: 8,
    B1: 'A',
    B2: 'B',
    B3: 'A',
    B4: 'B',
  };

  it('MINIFS finds the minimum among matching rows', () => {
    expect(evalFormula('MINIFS(A1:A4,B1:B4,"A")', vals)).toBe(5);
  });

  it('MAXIFS finds the maximum among matching rows', () => {
    expect(evalFormula('MAXIFS(A1:A4,B1:B4,"B")', vals)).toBe(20);
  });

  it('returns 0 when no rows match', () => {
    expect(evalFormula('MINIFS(A1:A4,B1:B4,"Z")', vals)).toBe(0);
  });
});

// ============================================================
// Dotted-name functions with no non-dotted equivalent (the tokenizer now
// accepts '.' in identifiers, so these are tested through formula strings
// like everything else).
// ============================================================
describe('MODE.MULT', () => {
  it('returns all values tied for the highest frequency, as a vertical spill', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 2, A4: 3, A5: 3 };
    expect(evalRaw('MODE.MULT(A1:A5)', vals)).toEqual({ type: 'spill', values: [[2], [3]] });
  });

  it('returns #N/A when there are no duplicates', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('MODE.MULT(A1:A3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('PERCENTILE.EXC', () => {
  const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4 };

  it('interpolates using the exclusive percentile formula', () => {
    expect(evalFormula('PERCENTILE.EXC(A1:A4,0.25)', vals) as number).toBeCloseTo(1.25, 9);
  });

  it('returns #NUM! when k is too close to the boundary for the sample size', () => {
    expect(evalFormula('PERCENTILE.EXC(A1:A4,0.05)', vals)).toEqual({
      type: 'error',
      code: '#NUM!',
    });
  });
});

describe('QUARTILE.EXC', () => {
  const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4 };

  it('returns the first quartile (exclusive)', () => {
    expect(evalFormula('QUARTILE.EXC(A1:A4,1)', vals) as number).toBeCloseTo(1.25, 9);
  });

  it('returns #NUM! for quart=0 (the exclusive boundary)', () => {
    expect(evalFormula('QUARTILE.EXC(A1:A4,0)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('RANK.AVG', () => {
  it('averages the ranks of tied values', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 3, A4: 5, A5: 3 };
    expect(evalFormula('RANK.AVG(3,A1:A5)', vals)).toBe(3);
  });

  it('matches plain RANK when there are no ties', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4 };
    expect(evalFormula('RANK.AVG(2,A1:A4)', vals)).toBe(evalFormula('RANK(2,A1:A4)', vals));
  });

  it('returns #N/A when the number is not present in ref', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 3, A4: 5, A5: 3 };
    expect(evalFormula('RANK.AVG(99,A1:A5)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('COVARIANCE.S', () => {
  it('computes the sample covariance (n-1 denominator)', () => {
    const vals: Record<string, FormulaResult> = { A1: 2, A2: 4, A3: 6, B1: 3, B2: 6, B3: 9 };
    expect(evalFormula('COVARIANCE.S(A1:A3,B1:B3)', vals) as number).toBeCloseTo(6, 9);
  });

  it('returns #DIV/0! with a single pair', () => {
    const vals: Record<string, FormulaResult> = { A1: 5, B1: 5 };
    expect(evalFormula('COVARIANCE.S(A1:A1,B1:B1)', vals)).toEqual({
      type: 'error',
      code: '#DIV/0!',
    });
  });
});

describe('NORM.S.DIST', () => {
  it('returns the cumulative distribution when cumulative is TRUE', () => {
    expect(evalFormula('NORM.S.DIST(1.96,TRUE)', {}) as number).toBeCloseTo(0.9750021048517795, 6);
  });

  it('returns the density when cumulative is FALSE', () => {
    expect(evalFormula('NORM.S.DIST(0,FALSE)', {}) as number).toBeCloseTo(
      1 / Math.sqrt(2 * Math.PI),
      9,
    );
  });
});

// ============================================================
// Dotted aliases with a non-dotted Excel/Sheets equivalent: same impl,
// registered under a second name. Verified by checking the dotted formula
// against both a known value and its non-dotted counterpart.
// ============================================================
describe('STDEV.S / VAR.S (aliases of math.ts STDEV / VAR)', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 4,
    A3: 4,
    A4: 4,
    A5: 5,
    A6: 5,
    A7: 7,
    A8: 9,
  };

  it('STDEV.S matches STDEV', () => {
    expect(evalFormula('STDEV.S(A1:A8)', vals)).toEqual(evalFormula('STDEV(A1:A8)', vals));
  });

  it('VAR.S matches VAR', () => {
    expect(evalFormula('VAR.S(A1:A8)', vals)).toEqual(evalFormula('VAR(A1:A8)', vals));
  });
});

describe('STDEV.P / VAR.P (aliases of STDEVP / VARP)', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 4,
    A3: 4,
    A4: 4,
    A5: 5,
    A6: 5,
    A7: 7,
    A8: 9,
  };

  it('STDEV.P matches STDEVP', () => {
    expect(evalFormula('STDEV.P(A1:A8)', vals)).toEqual(evalFormula('STDEVP(A1:A8)', vals));
    expect(evalFormula('STDEV.P(A1:A8)', vals) as number).toBeCloseTo(2, 9);
  });

  it('VAR.P matches VARP', () => {
    expect(evalFormula('VAR.P(A1:A8)', vals)).toEqual(evalFormula('VARP(A1:A8)', vals));
    expect(evalFormula('VAR.P(A1:A8)', vals) as number).toBeCloseTo(4, 9);
  });
});

describe('RANK.EQ (alias of math.ts RANK)', () => {
  const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };

  it('matches RANK for a descending rank', () => {
    expect(evalFormula('RANK.EQ(5,A1:A5)', vals)).toBe(1);
  });

  it('matches RANK for an ascending rank', () => {
    expect(evalFormula('RANK.EQ(1,A1:A5,1)', vals)).toBe(1);
  });
});

describe('MODE.SNGL (alias of MODE)', () => {
  it('returns the most frequent value', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 2, A4: 3 };
    expect(evalFormula('MODE.SNGL(A1:A4)', vals)).toBe(2);
  });

  it('returns #N/A when there are no duplicates', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('MODE.SNGL(A1:A3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('PERCENTILE.INC / QUARTILE.INC / PERCENTRANK.INC (aliases)', () => {
  const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4 };

  it('PERCENTILE.INC matches PERCENTILE', () => {
    expect(evalFormula('PERCENTILE.INC(A1:A4,0.75)', vals)).toEqual(
      evalFormula('PERCENTILE(A1:A4,0.75)', vals),
    );
  });

  it('QUARTILE.INC matches QUARTILE', () => {
    expect(evalFormula('QUARTILE.INC(A1:A4,1)', vals)).toEqual(
      evalFormula('QUARTILE(A1:A4,1)', vals),
    );
  });

  it('PERCENTRANK.INC matches PERCENTRANK', () => {
    expect(evalFormula('PERCENTRANK.INC(A1:A4,3)', vals)).toEqual(
      evalFormula('PERCENTRANK(A1:A4,3)', vals),
    );
  });
});

describe('COVARIANCE.P (alias of COVAR)', () => {
  const vals: Record<string, FormulaResult> = { A1: 2, A2: 4, A3: 6, B1: 3, B2: 6, B3: 9 };

  it('matches COVAR', () => {
    expect(evalFormula('COVARIANCE.P(A1:A3,B1:B3)', vals)).toEqual(
      evalFormula('COVAR(A1:A3,B1:B3)', vals),
    );
  });

  it('computes the population covariance (n denominator)', () => {
    expect(evalFormula('COVARIANCE.P(A1:A3,B1:B3)', vals) as number).toBeCloseTo(4, 9);
  });
});

describe('FORECAST.LINEAR (alias of FORECAST)', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 2,
    A2: 3,
    A3: 9,
    A4: 1,
    A5: 8,
    B1: 6,
    B2: 5,
    B3: 11,
    B4: 7,
    B5: 5,
  };

  it('matches FORECAST', () => {
    expect(evalFormula('FORECAST.LINEAR(10,A1:A5,B1:B5)', vals)).toEqual(
      evalFormula('FORECAST(10,A1:A5,B1:B5)', vals),
    );
  });

  it('predicts a value along the regression line', () => {
    expect(evalFormula('FORECAST.LINEAR(10,A1:A5,B1:B5)', vals) as number).toBeCloseTo(
      6.741935483870968,
      9,
    );
  });
});

describe('NORM.DIST / NORM.INV (aliases of NORMDIST / NORMINV)', () => {
  it('NORM.DIST matches NORMDIST', () => {
    expect(evalFormula('NORM.DIST(1.96,0,1,TRUE)', {})).toEqual(
      evalFormula('NORMDIST(1.96,0,1,TRUE)', {}),
    );
  });

  it('NORM.INV matches NORMINV', () => {
    expect(evalFormula('NORM.INV(0.975,0,1)', {})).toEqual(evalFormula('NORMINV(0.975,0,1)', {}));
  });
});

describe('CONFIDENCE.NORM (alias of CONFIDENCE)', () => {
  it('matches CONFIDENCE', () => {
    expect(evalFormula('CONFIDENCE.NORM(0.05,2.5,50)', {})).toEqual(
      evalFormula('CONFIDENCE(0.05,2.5,50)', {}),
    );
  });

  it('matches the documented Excel example', () => {
    expect(evalFormula('CONFIDENCE.NORM(0.05,2.5,50)', {}) as number).toBeCloseTo(0.692952, 5);
  });
});
