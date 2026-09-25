import { describe, it, expect } from 'vite-plus/test';
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
  // For scalar results, just return them
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

describe('SUMPRODUCT', () => {
  it('calculates the sum of products of two ranges', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 2,
      A3: 3,
      B1: 4,
      B2: 5,
      B3: 6,
    };
    expect(evalFormula('SUMPRODUCT(A1:A3,B1:B3)', vals)).toBe(1 * 4 + 2 * 5 + 3 * 6); // 32
  });

  it('calculates with three ranges', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 2,
      B1: 3,
      B2: 4,
      C1: 5,
      C2: 6,
    };
    expect(evalFormula('SUMPRODUCT(A1:A2,B1:B2,C1:C2)', vals)).toBe(1 * 3 * 5 + 2 * 4 * 6); // 63
  });

  it('returns #VALUE! when ranges have different sizes', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 2,
      A3: 3,
      B1: 4,
      B2: 5,
    };
    expect(evalFormula('SUMPRODUCT(A1:A3,B1:B2)', vals)).toEqual({
      type: 'error',
      code: '#VALUE!',
    });
  });

  it('treats empty cells as 0', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 2,
      A3: 3,
      B1: 4,
    };
    expect(evalFormula('SUMPRODUCT(A1:A3,B1:B3)', vals)).toBe(1 * 4 + 2 * 0 + 3 * 0); // 4
  });
});

describe('STDEV', () => {
  it('calculates sample standard deviation', () => {
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
    const result = evalFormula('STDEV(A1:A8)', vals);
    expect(typeof result).toBe('number');
    expect(result as number).toBeCloseTo(2.138, 2);
  });

  it('returns #DIV/0! with 1 element', () => {
    const vals: Record<string, FormulaResult> = { A1: 5 };
    expect(evalFormula('STDEV(A1:A1)', vals)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('VAR', () => {
  it('calculates sample variance', () => {
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
    const result = evalFormula('VAR(A1:A8)', vals);
    expect(typeof result).toBe('number');
    expect(result as number).toBeCloseTo(4.571, 2);
  });

  it('returns #DIV/0! with 1 element', () => {
    const vals: Record<string, FormulaResult> = { A1: 5 };
    expect(evalFormula('VAR(A1:A1)', vals)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('LARGE', () => {
  it('returns the 1st largest value', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    expect(evalFormula('LARGE(A1:A5,1)', vals)).toBe(5);
  });

  it('returns the 3rd largest value', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    expect(evalFormula('LARGE(A1:A5,3)', vals)).toBe(3);
  });

  it('returns #NUM! when k is out of range', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5 };
    expect(evalFormula('LARGE(A1:A3,4)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('SMALL', () => {
  it('returns the 1st smallest value', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    expect(evalFormula('SMALL(A1:A5,1)', vals)).toBe(1);
  });

  it('returns the 2nd smallest value', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    expect(evalFormula('SMALL(A1:A5,2)', vals)).toBe(2);
  });

  it('returns #NUM! when k is out of range', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5 };
    expect(evalFormula('SMALL(A1:A3,4)', vals)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('RANK', () => {
  it('returns descending rank (default)', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    // RANK(5, A1:A5) → 1 (largest is rank 1 in descending)
    expect(evalFormula('RANK(5,A1:A5)', vals)).toBe(1);
    // RANK(1, A1:A5) → 5 (smallest is rank 5 in descending)
    expect(evalFormula('RANK(1,A1:A5)', vals)).toBe(5);
  });

  it('returns ascending rank when order=1', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5, A4: 2, A5: 4 };
    // RANK(1, A1:A5, 1) → 1 (smallest is rank 1 in ascending)
    expect(evalFormula('RANK(1,A1:A5,1)', vals)).toBe(1);
    // RANK(5, A1:A5, 1) → 5 (largest is rank 5 in ascending)
    expect(evalFormula('RANK(5,A1:A5,1)', vals)).toBe(5);
  });

  it('returns #N/A when value is not in range', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5 };
    expect(evalFormula('RANK(10,A1:A3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });

  it('accepts a cell reference as the number', () => {
    const vals: Record<string, FormulaResult> = { A1: 3, A2: 1, A3: 5 };
    expect(evalFormula('RANK(A1,A1:A3)', vals)).toBe(2);
    expect(evalFormula('RANK(A1:A2,A1:A3)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('scalar numeric parameters given a bare cell reference', () => {
  it('read the referenced cell (a 1x1 range) as a scalar', () => {
    const vals: Record<string, FormulaResult> = { A1: -5, A2: 2.345, A3: 16, A4: '7', A5: true };
    expect(evalFormula('ABS(A1)', vals)).toBe(5);
    expect(evalFormula('ROUND(A2,1)', vals)).toBeCloseTo(2.3, 9);
    expect(evalFormula('MOD(A3,A4)', vals)).toBe(2);
    expect(evalFormula('SQRT(A3)', vals)).toBe(4);
    expect(evalFormula('INT(A5)', vals)).toBe(1);
  });

  it('treat an empty cell as 0 and non-numeric text as #VALUE!', () => {
    expect(evalFormula('ABS(A1)', {})).toBe(0);
    expect(evalFormula('ABS(A1)', { A1: 'abc' })).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('propagate an error in the referenced cell', () => {
    expect(evalFormula('ABS(A1)', { A1: { type: 'error', code: '#N/A' } })).toEqual({
      type: 'error',
      code: '#N/A',
    });
  });
});

describe('ROUNDUP', () => {
  it('rounds up (away from zero) to the given digits', () => {
    expect(evalFormula('ROUNDUP(3.14159,3)', {})).toBeCloseTo(3.142, 9);
  });

  it('rounds up to an integer when digits are omitted, including negative numbers', () => {
    expect(evalFormula('ROUNDUP(-3.2)', {})).toBe(-4);
  });
});

describe('ROUNDDOWN', () => {
  it('rounds down (toward zero) to the given digits', () => {
    expect(evalFormula('ROUNDDOWN(3.14159,3)', {})).toBeCloseTo(3.141, 9);
  });

  it('rounds toward zero for negative numbers', () => {
    expect(evalFormula('ROUNDDOWN(-3.14159,1)', {})).toBeCloseTo(-3.1, 9);
  });
});

describe('TRUNC', () => {
  it('truncates the decimal part', () => {
    expect(evalFormula('TRUNC(8.9)', {})).toBe(8);
  });

  it('truncates to the given number of digits', () => {
    expect(evalFormula('TRUNC(-8.9999,2)', {})).toBeCloseTo(-8.99, 9);
  });
});

describe('SIGN', () => {
  it('returns 1 for positive numbers', () => {
    expect(evalFormula('SIGN(10)', {})).toBe(1);
  });

  it('returns -1 for negative numbers and 0 for zero', () => {
    expect(evalFormula('SIGN(-5)', {})).toBe(-1);
    expect(evalFormula('SIGN(0)', {})).toBe(0);
  });
});

describe('EXP', () => {
  it('returns e^number', () => {
    expect(evalFormula('EXP(1)', {})).toBeCloseTo(Math.E, 9);
  });

  it('returns #NUM! on overflow', () => {
    expect(evalFormula('EXP(10000)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('LN', () => {
  it('returns the natural logarithm', () => {
    expect(evalFormula('LN(EXP(2))', {})).toBeCloseTo(2, 9);
  });

  it('returns #NUM! for non-positive numbers', () => {
    expect(evalFormula('LN(0)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('LOG10', () => {
  it('returns the base-10 logarithm', () => {
    expect(evalFormula('LOG10(1000)', {})).toBeCloseTo(3, 9);
  });

  it('returns #NUM! for non-positive numbers', () => {
    expect(evalFormula('LOG10(-1)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('LOG', () => {
  it('defaults to base 10', () => {
    expect(evalFormula('LOG(100)', {})).toBeCloseTo(2, 9);
  });

  it('accepts an explicit base', () => {
    expect(evalFormula('LOG(8,2)', {})).toBeCloseTo(3, 9);
  });

  it('returns #DIV/0! when base is 1', () => {
    expect(evalFormula('LOG(8,1)', {})).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('PI', () => {
  it('returns the value of pi', () => {
    expect(evalFormula('PI()', {})).toBeCloseTo(Math.PI, 9);
  });

  it('rejects arguments', () => {
    expect(evalFormula('PI(1)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('EVEN', () => {
  it('rounds up to the nearest even number, away from zero', () => {
    expect(evalFormula('EVEN(1.5)', {})).toBe(2);
    expect(evalFormula('EVEN(3)', {})).toBe(4);
  });

  it('rounds negative numbers away from zero', () => {
    expect(evalFormula('EVEN(-1)', {})).toBe(-2);
  });
});

describe('ODD', () => {
  it('rounds up to the nearest odd number, away from zero', () => {
    expect(evalFormula('ODD(1.5)', {})).toBe(3);
    expect(evalFormula('ODD(2)', {})).toBe(3);
  });

  it('rounds negative numbers away from zero', () => {
    expect(evalFormula('ODD(-2)', {})).toBe(-3);
  });
});

describe('MROUND', () => {
  it('rounds to the nearest multiple', () => {
    expect(evalFormula('MROUND(10,3)', {})).toBe(9);
  });

  it('returns #NUM! when signs of number and multiple differ', () => {
    expect(evalFormula('MROUND(10,-3)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('QUOTIENT', () => {
  it('returns the integer portion of a division', () => {
    expect(evalFormula('QUOTIENT(5,2)', {})).toBe(2);
  });

  it('returns #DIV/0! for division by zero', () => {
    expect(evalFormula('QUOTIENT(5,0)', {})).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('FACT', () => {
  it('returns the factorial of a number', () => {
    expect(evalFormula('FACT(5)', {})).toBe(120);
  });

  it('returns #NUM! for negative numbers', () => {
    expect(evalFormula('FACT(-1)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('COMBIN', () => {
  it('returns the number of combinations', () => {
    expect(evalFormula('COMBIN(8,2)', {})).toBe(28);
  });

  it('returns #NUM! when choosing more than available', () => {
    expect(evalFormula('COMBIN(2,3)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('PERMUT', () => {
  it('returns the number of permutations', () => {
    expect(evalFormula('PERMUT(8,2)', {})).toBe(56);
  });

  it('returns #NUM! when choosing more than available', () => {
    expect(evalFormula('PERMUT(2,3)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('DEGREES / RADIANS', () => {
  it('converts radians to degrees', () => {
    expect(evalFormula('DEGREES(PI())', {})).toBeCloseTo(180, 9);
  });

  it('converts degrees to radians', () => {
    expect(evalFormula('RADIANS(180)', {})).toBeCloseTo(Math.PI, 9);
  });
});

describe('SIN / COS / TAN', () => {
  it('computes SIN and COS at 0', () => {
    expect(evalFormula('SIN(0)', {})).toBe(0);
    expect(evalFormula('COS(0)', {})).toBe(1);
  });

  it('computes TAN', () => {
    expect(evalFormula('TAN(0)', {})).toBe(0);
  });
});

describe('ASIN / ACOS / ATAN', () => {
  it('computes the inverse trig functions', () => {
    expect(evalFormula('ASIN(1)', {})).toBeCloseTo(Math.PI / 2, 9);
    expect(evalFormula('ACOS(1)', {})).toBe(0);
    expect(evalFormula('ATAN(1)', {})).toBeCloseTo(Math.PI / 4, 9);
  });

  it('returns #NUM! outside [-1,1] for ASIN/ACOS', () => {
    expect(evalFormula('ASIN(2)', {})).toEqual({ type: 'error', code: '#NUM!' });
    expect(evalFormula('ACOS(-2)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('ATAN2', () => {
  it('returns the angle for (x,y), matching Excel argument order', () => {
    expect(evalFormula('ATAN2(1,1)', {})).toBeCloseTo(Math.PI / 4, 9);
  });

  it('returns #DIV/0! when both arguments are 0', () => {
    expect(evalFormula('ATAN2(0,0)', {})).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('SINH / COSH / TANH', () => {
  it('computes hyperbolic functions at 0', () => {
    expect(evalFormula('SINH(0)', {})).toBe(0);
    expect(evalFormula('COSH(0)', {})).toBe(1);
    expect(evalFormula('TANH(0)', {})).toBe(0);
  });

  it('computes hyperbolic functions at 1', () => {
    expect(evalFormula('SINH(1)', {})).toBeCloseTo(Math.sinh(1), 9);
  });
});

describe('ISEVEN / ISODD', () => {
  it('identifies even numbers', () => {
    expect(evalFormula('ISEVEN(4)', {})).toBe(true);
    expect(evalFormula('ISEVEN(3)', {})).toBe(false);
  });

  it('identifies odd numbers, truncating decimals', () => {
    expect(evalFormula('ISODD(3.9)', {})).toBe(true);
    expect(evalFormula('ISODD(4)', {})).toBe(false);
  });
});

describe('PRODUCT', () => {
  it('multiplies all arguments', () => {
    expect(evalFormula('PRODUCT(2,3,4)', {})).toBe(24);
  });

  it('ignores text within ranges', () => {
    const vals: Record<string, FormulaResult> = { A1: 2, A2: 'x', A3: 5 };
    expect(evalFormula('PRODUCT(A1:A3)', vals)).toBe(10);
  });
});

describe('SUMSQ', () => {
  it('sums the squares of the arguments', () => {
    expect(evalFormula('SUMSQ(3,4)', {})).toBe(25);
  });

  it('sums the squares within a range', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('SUMSQ(A1:A3)', vals)).toBe(14);
  });
});

describe('GCD', () => {
  it('returns the greatest common divisor', () => {
    expect(evalFormula('GCD(12,18)', {})).toBe(6);
  });

  it('returns #NUM! for negative numbers', () => {
    expect(evalFormula('GCD(-4,8)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('LCM', () => {
  it('returns the least common multiple', () => {
    expect(evalFormula('LCM(4,6)', {})).toBe(12);
  });

  it('returns #NUM! for negative numbers', () => {
    expect(evalFormula('LCM(-4,6)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('RAND', () => {
  it('returns a number in [0,1)', () => {
    const result = evalFormula('RAND()', {});
    expect(typeof result).toBe('number');
    expect(result as number).toBeGreaterThanOrEqual(0);
    expect(result as number).toBeLessThan(1);
  });

  it('rejects arguments', () => {
    expect(evalFormula('RAND(1)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('RANDBETWEEN', () => {
  it('returns an integer within [bottom,top]', () => {
    const result = evalFormula('RANDBETWEEN(1,1)', {});
    expect(result).toBe(1);
  });

  it('returns #NUM! when bottom > top', () => {
    expect(evalFormula('RANDBETWEEN(5,1)', {})).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('SUBTOTAL', () => {
  it('computes SUM (function_num 9)', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3 };
    expect(evalFormula('SUBTOTAL(9,A1:A3)', vals)).toBe(6);
  });

  it('computes AVERAGE for both 1 and 101 (hidden-row variant)', () => {
    const vals: Record<string, FormulaResult> = { A1: 2, A2: 4, A3: 6 };
    expect(evalFormula('SUBTOTAL(1,A1:A3)', vals)).toBe(4);
    expect(evalFormula('SUBTOTAL(101,A1:A3)', vals)).toBe(4);
  });

  it('returns #VALUE! for an unsupported function_num', () => {
    const vals: Record<string, FormulaResult> = { A1: 1 };
    expect(evalFormula('SUBTOTAL(99,A1:A1)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('CEILING.MATH', () => {
  it('rounds up to the nearest multiple of significance', () => {
    expect(evalFormula('CEILING.MATH(24.3,5)', {})).toBe(25);
  });

  it('defaults significance to 1 and rounds toward zero for negative numbers by default', () => {
    expect(evalFormula('CEILING.MATH(-8.1,2)', {})).toBe(-8);
  });

  it('rounds away from zero for negative numbers when mode is non-zero', () => {
    expect(evalFormula('CEILING.MATH(-5.5,2,-1)', {})).toBe(-6);
  });
});

describe('FLOOR.MATH', () => {
  it('rounds down to the nearest multiple of significance', () => {
    expect(evalFormula('FLOOR.MATH(24.3,5)', {})).toBe(20);
  });

  it('rounds away from zero for negative numbers by default', () => {
    expect(evalFormula('FLOOR.MATH(-8.1,2)', {})).toBe(-10);
  });

  it('rounds toward zero for negative numbers when mode is non-zero', () => {
    expect(evalFormula('FLOOR.MATH(-5.5,2,-1)', {})).toBe(-4);
  });
});
