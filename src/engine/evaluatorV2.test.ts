import { describe, it, expect } from 'vite-plus/test';
import { evaluate, extractReferences } from './evaluator';
import { parse } from './parser';
import { isSpillResult } from './types';
import type {
  EvaluateOptions,
  FormulaResult,
  NamedRangeResolver,
  RangeExpander,
  SheetNameResolver,
} from './types';

/**
 * Regression/feature tests for the formula engine v2 rewrite: operators (& ^ %),
 * array literals, array/range arithmetic (spill), nested array functions, column/row-wide
 * references, IF/IFERROR/IFNA/IFS/SWITCH/CHOOSE special forms, LET/LAMBDA/MAP/REDUCE/BYROW,
 * lift (scalar broadcast), comparisons, XOR, COUNTIF wildcards, and extractReferences.
 */

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
  extra?: {
    resolveSheetName?: SheetNameResolver;
    resolveNamedRange?: NamedRangeResolver;
    options?: EvaluateOptions;
  },
) {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  return evaluate(
    ast,
    resolve,
    expandRange,
    extra?.resolveSheetName,
    extra?.resolveNamedRange,
    undefined,
    extra?.options,
  );
}

describe('operators: & ^ %', () => {
  it('concatenates with &', () => {
    expect(evalFormula('"a"&"b"&1')).toBe('ab1');
    expect(evalFormula('1&TRUE')).toBe('1TRUE');
  });

  it('^ is left-associative and unary minus binds tighter than ^', () => {
    expect(evalFormula('2^3^2')).toBe(64); // (2^3)^2 = 64
    expect(evalFormula('-2^2')).toBe(4); // (-2)^2 = 4
  });

  it('% is a postfix percent operator', () => {
    expect(evalFormula('50%')).toBe(0.5);
    expect(evalFormula('10%*200')).toBe(20);
    expect(evalFormula('+5')).toBe(5);
  });
});

describe('literals: exponent numbers, escaped strings', () => {
  it('parses exponent notation', () => {
    expect(evalFormula('1e3')).toBe(1000);
  });

  it('unescapes "" inside string literals', () => {
    expect(evalFormula('"say ""hi"""')).toBe('say "hi"');
  });
});

describe('array literals', () => {
  it('evaluates a bare array literal to a spill', () => {
    expect(evalFormula('{1,2;3,4}')).toEqual({
      type: 'spill',
      values: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it('SUM accepts an array literal', () => {
    expect(evalFormula('SUM({1,2;3,4})')).toBe(10);
  });
});

describe('array/range arithmetic', () => {
  const vals = { A1: 1, A2: 2, A3: 3, B1: 4, B2: 5, B3: 6 };

  it('broadcasts a scalar over a range (spill)', () => {
    expect(evalFormula('A1:A3*2', vals)).toEqual({ type: 'spill', values: [[2], [4], [6]] });
  });

  it('SUM of an elementwise range*range product (dot product)', () => {
    expect(evalFormula('SUM(A1:A3*B1:B3)', vals)).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });
});

describe('nested array functions', () => {
  it('SUM(FILTER(...)) filters then sums', () => {
    expect(evalFormula('SUM(FILTER(A1:A3, A1:A3>1))', { A1: 1, A2: 2, A3: 3 })).toBe(5);
  });

  it('SORT(UNIQUE(...)) dedupes then sorts', () => {
    const result = evalFormula('SORT(UNIQUE(A1:A5))', { A1: 3, A2: 1, A3: 3, A4: 2, A5: 1 });
    expect(isSpillResult(result)).toBe(true);
    expect(result).toEqual({ type: 'spill', values: [[1], [2], [3]] });
  });
});

describe('column-wide / end-open references', () => {
  it('SUM(A:A) sums the used range for the column', () => {
    const vals = { A1: 1, A2: 2, A3: 3 };
    const options: EvaluateOptions = { getSheetBounds: () => ({ rows: 3, cols: 2 }) };
    expect(evalFormula('SUM(A:A)', vals, { options })).toBe(6);
  });

  it('SUM(A2:A) sums from row 2 to the end of the used range', () => {
    const vals = { A1: 1, A2: 2, A3: 3 };
    const options: EvaluateOptions = { getSheetBounds: () => ({ rows: 3, cols: 2 }) };
    expect(evalFormula('SUM(A2:A)', vals, { options })).toBe(5);
  });
});

describe('IF is lazy', () => {
  it('does not evaluate the unselected branch', () => {
    expect(evalFormula('IF(A1>0, "pos", 1/0)', { A1: 1 })).toBe('pos');
  });
});

describe('IFERROR / IFNA', () => {
  it('IFERROR replaces an error with the fallback', () => {
    expect(evalFormula('IFERROR(1/0, "x")')).toBe('x');
  });

  it('IFNA replaces #N/A specifically', () => {
    expect(evalFormula('IFNA(#N/A, 0)')).toBe(0);
  });
});

describe('LET / LAMBDA', () => {
  it('LET binds names sequentially', () => {
    expect(evalFormula('LET(x, 2, y, x*3, x+y)')).toBe(8);
  });

  it('LET can bind a LAMBDA and call it', () => {
    expect(evalFormula('LET(f, LAMBDA(a, a*a), f(4))')).toBe(16);
  });
});

describe('MAP / REDUCE / BYROW', () => {
  it('MAP applies a lambda elementwise', () => {
    expect(evalFormula('MAP({1,2,3}, LAMBDA(v, v*10))')).toEqual({
      type: 'spill',
      values: [[10, 20, 30]],
    });
  });

  it('REDUCE folds an array to a scalar', () => {
    expect(evalFormula('REDUCE(0, {1,2,3}, LAMBDA(a,b,a+b))')).toBe(6);
  });

  it('BYROW applies a lambda per row', () => {
    expect(evalFormula('BYROW({1,2;3,4}, LAMBDA(r, SUM(r)))')).toEqual({
      type: 'spill',
      values: [[3], [7]],
    });
  });
});

describe('lift (scalar function broadcast over ranges)', () => {
  it('UPPER lifts over a multi-cell range', () => {
    expect(evalFormula('UPPER(A1:A2)', { A1: 'a', A2: 'b' })).toEqual({
      type: 'spill',
      values: [['A'], ['B']],
    });
  });
});

describe('IF broadcasts over an array condition', () => {
  it('selects per-position then/else values', () => {
    const result = evalFormula('IF(A1:A3>1, "Y", "N")', { A1: 1, A2: 2, A3: 3 });
    expect(result).toEqual({ type: 'spill', values: [['N'], ['Y'], ['Y']] });
  });
});

describe('comparisons', () => {
  it('string comparison is case-insensitive', () => {
    expect(evalFormula('"abc"="ABC"')).toBe(true);
  });

  it('number < string under Excel ordering', () => {
    expect(evalFormula('1<"a"')).toBe(true);
  });
});

describe('IFS / SWITCH / CHOOSE', () => {
  it('IFS returns the first matching value', () => {
    expect(evalFormula('IFS(A1=1,"one",TRUE,"other")', { A1: 1 })).toBe('one');
  });

  it('SWITCH matches by value equality', () => {
    expect(evalFormula('SWITCH(2,1,"a",2,"b","z")')).toBe('b');
  });

  it('CHOOSE selects the nth value', () => {
    expect(evalFormula('CHOOSE(2,"a","b")')).toBe('b');
  });
});

describe('XOR', () => {
  it('is TRUE when an odd number of arguments are TRUE', () => {
    expect(evalFormula('XOR(TRUE,TRUE,TRUE)')).toBe(true);
  });
});

describe('COUNTIF wildcards', () => {
  const vals = { A1: 'apple', A2: 'banana', A3: 'avocado' };

  it('supports the * wildcard', () => {
    expect(evalFormula('COUNTIF(A1:A3,"a*")', vals)).toBe(2);
  });

  it('escapes regex metacharacters in the criteria (no throw)', () => {
    expect(() => evalFormula('COUNTIF(A1:A3,"(x")', vals)).not.toThrow();
    expect(evalFormula('COUNTIF(A1:A3,"(x")', vals)).toBe(0);
  });
});

describe('extractReferences', () => {
  it('extracts cells, ranges (incl. sheet-qualified open range), and volatility', () => {
    const resolveSheetName: SheetNameResolver = (name) => (name === 'Sheet2' ? 's2' : undefined);
    const ast = parse('SUM(A1:B3)+C1+Sheet2!A:A');
    const refs = extractReferences(ast, resolveSheetName);

    expect(refs.cells).toEqual(['C1']);
    expect(refs.ranges).toHaveLength(2);
    expect(refs.ranges[1].sheetId).toBe('s2');
    expect(refs.ranges[1].endRow).toBeNull();
    expect(refs.volatile).toBe(false);
  });

  it('marks a formula containing a volatile function', () => {
    const refs = extractReferences(parse('TODAY()+1'));
    expect(refs.volatile).toBe(true);
  });
});

describe('bare cell references as function arguments', () => {
  const vals = { A1: 3, A2: 1, A3: 2, B1: '5' };

  it('keeps the position of a single-cell reference (OFFSET/ROW)', () => {
    expect(evalFormula('SUM(OFFSET(A1,1,0,2,1))', vals)).toBe(3);
    expect(evalFormula('ROW(A3)', vals)).toBe(3);
  });

  it('ignores text in a referenced cell for aggregates, like Excel', () => {
    expect(evalFormula('SUM(B1,A1)', vals)).toBe(3);
    expect(evalFormula('SUM("5",A1)', vals)).toBe(8);
  });
});

describe('XLOOKUP wildcard mode', () => {
  it('treats regex metacharacters literally', () => {
    const vals = { A1: '3x5', A2: '3.5', A3: '(A)', B1: 'wrong', B2: 'right', B3: 'paren' };
    expect(evalFormula('XLOOKUP("3.5",A1:A3,B1:B3,,2)', vals)).toBe('right');
    expect(evalFormula('XLOOKUP("(A*",A1:A3,B1:B3,,2)', vals)).toBe('paren');
  });
});

describe('exact-match lookup index (large ranges)', () => {
  // 40 rows so the range is cached and indexed (>= 32 rows)
  const vals: Record<string, FormulaResult> = {};
  for (let r = 1; r <= 40; r++) {
    vals[`A${r}`] = `k${r}`;
    vals[`B${r}`] = r * 10;
  }
  vals.A5 = 'Apple';
  vals.A6 = 'apple'; // first occurrence wins, case-insensitive
  vals.A7 = { type: 'error', code: '#N/A' }; // errors never match
  vals.A8 = 5; // number
  vals.A9 = '5'; // text that equals the number
  vals.A10 = '';

  it('matches the linear-scan semantics', () => {
    expect(evalFormula('VLOOKUP("APPLE",A1:B40,2,FALSE)', vals)).toBe(50);
    expect(evalFormula('MATCH("apple",A1:A40,0)', vals)).toBe(5);
    expect(evalFormula('VLOOKUP(5,A1:B40,2,FALSE)', vals)).toBe(80);
    expect(evalFormula('VLOOKUP("5",A1:B40,2,FALSE)', vals)).toBe(80);
    expect(evalFormula('MATCH("",A1:A40,0)', vals)).toBe(10);
    expect(evalFormula('VLOOKUP("k40",A1:B40,2,FALSE)', vals)).toBe(400);
    expect(evalFormula('VLOOKUP("nope",A1:B40,2,FALSE)', vals)).toEqual({
      type: 'error',
      code: '#N/A',
    });
    expect(evalFormula('MATCH("#N/A",A1:A40,0)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });
});
