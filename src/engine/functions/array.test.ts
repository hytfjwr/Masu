import { describe, it, expect } from 'vite-plus/test';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type { FormulaResult, RangeExpander, SpillResult } from '../types';
import { isSpillResult } from '../types';

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

function evalToSpill(
  formula: string,
  cellValues: Record<string, FormulaResult>,
): SpillResult | FormulaResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  return evaluate(ast, resolve, expandRange);
}

describe('UNIQUE', () => {
  it('returns unique values from a range', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Apple',
      A2: 'Banana',
      A3: 'Apple',
      A4: 'Cherry',
      A5: 'Banana',
    };
    const result = evalToSpill('UNIQUE(A1:A5)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([['Apple'], ['Banana'], ['Cherry']]);
  });

  it('returns unique rows from a multi-column range', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'A',
      B1: 1,
      A2: 'B',
      B2: 2,
      A3: 'A',
      B3: 1,
    };
    const result = evalToSpill('UNIQUE(A1:B3)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });
});

describe('SORT', () => {
  it('sorts ascending by default', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 3,
      A2: 1,
      A3: 2,
    };
    const result = evalToSpill('SORT(A1:A3)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([[1], [2], [3]]);
  });

  it('sorts descending with sort_order=-1', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 3,
      A2: 1,
      A3: 2,
    };
    const result = evalToSpill('SORT(A1:A3,1,-1)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([[3], [2], [1]]);
  });

  it('sorts multi-column data by specified column', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'C',
      B1: 3,
      A2: 'A',
      B2: 1,
      A3: 'B',
      B3: 2,
    };
    const result = evalToSpill('SORT(A1:B3,2,1)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);
  });
});

describe('FILTER', () => {
  it('filters rows based on boolean include array', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Apple',
      A2: 'Banana',
      A3: 'Cherry',
      B1: true,
      B2: false,
      B3: true,
    };
    const result = evalToSpill('FILTER(A1:A3,B1:B3)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([['Apple'], ['Cherry']]);
  });

  it('returns #N/A when no matches', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Apple',
      A2: 'Banana',
      A3: 'Cherry',
      B1: false,
      B2: false,
      B3: false,
    };
    const result = evalToSpill('FILTER(A1:A3,B1:B3)', vals);
    expect(result).toEqual({ type: 'error', code: '#N/A' });
  });

  it('filters multi-column data', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Apple',
      B1: 100,
      A2: 'Banana',
      B2: 200,
      A3: 'Cherry',
      B3: 300,
      C1: true,
      C2: false,
      C3: true,
    };
    const result = evalToSpill('FILTER(A1:B3,C1:C3)', vals);
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([
      ['Apple', 100],
      ['Cherry', 300],
    ]);
  });
});

describe('SEQUENCE', () => {
  it('generates a column of sequential numbers', () => {
    const result = evalToSpill('SEQUENCE(5)', {});
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([[1], [2], [3], [4], [5]]);
  });

  it('generates a grid with rows and columns', () => {
    const result = evalToSpill('SEQUENCE(2,3)', {});
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('generates with custom start and step', () => {
    const result = evalToSpill('SEQUENCE(3,1,10,5)', {});
    expect(isSpillResult(result)).toBe(true);
    const spill = result as SpillResult;
    expect(spill.values).toEqual([[10], [15], [20]]);
  });

  it('collapses a 1x1 result to a scalar at the evaluation boundary', () => {
    // A 1-row/1-col SEQUENCE result is normalized to a plain scalar (per the engine's
    // "1x1 arrays normalize to scalars at evaluation boundaries" rule), not a SpillResult.
    const result = evalToSpill('SEQUENCE(1)', {});
    expect(isSpillResult(result)).toBe(false);
    expect(result).toBe(1);
  });
});

describe('SpillResult type', () => {
  it('array function results have type "spill"', () => {
    const result = evalToSpill('SEQUENCE(2)', {});
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).type).toBe('spill');
  });

  it('broadcasts an array result used inside a binary expression', () => {
    // SEQUENCE(2)+1 broadcasts the scalar 1 over the 2x1 array result.
    const vals: Record<string, FormulaResult> = {};
    const resolve = (key: string): FormulaResult => vals[key] ?? '';
    const ast = parse('SEQUENCE(2)+1');
    const result = evaluate(ast, resolve, expandRange);
    expect(result).toEqual({ type: 'spill', values: [[2], [3]] });
  });
});

describe('TRANSPOSE', () => {
  it('turns a row range into a column', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, C1: 3 };
    const result = evalToSpill('TRANSPOSE(A1:C1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [2], [3]]);
  });

  it('collapses a 1x1 result to a scalar', () => {
    expect(evalToSpill('TRANSPOSE(A1:A1)', { A1: 5 })).toBe(5);
  });
});

describe('SORTBY', () => {
  it('sorts an array by a parallel by_array (ascending default)', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'C',
      A2: 'A',
      A3: 'B',
      B1: 3,
      B2: 1,
      B3: 2,
    };
    const result = evalToSpill('SORTBY(A1:A3,B1:B3)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([['A'], ['B'], ['C']]);
  });

  it('sorts descending with sort_order=-1', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'C',
      A2: 'A',
      A3: 'B',
      B1: 3,
      B2: 1,
      B3: 2,
    };
    const result = evalToSpill('SORTBY(A1:A3,B1:B3,-1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([['C'], ['B'], ['A']]);
  });

  it('returns #VALUE! when by_array length does not match the array', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, B1: 1, B2: 2 };
    expect(evalToSpill('SORTBY(A1:A3,B1:B2)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('FLATTEN', () => {
  it('flattens a multi-column range row-major into a single column', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('FLATTEN(A1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [2], [3], [4]]);
  });

  it('flattens multiple ranges together, keeping empty strings', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: '', B1: 2, B2: 3 };
    const result = evalToSpill('FLATTEN(A1:A2,B1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [''], [2], [3]]);
  });
});

describe('TOCOL / TOROW', () => {
  it('TOCOL flattens row-major by default', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('TOCOL(A1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [2], [3], [4]]);
  });

  it('TOCOL ignores blanks when ignore=1', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: '', A2: 3, B2: 4 };
    const result = evalToSpill('TOCOL(A1:B2,1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [3], [4]]);
  });

  it('TOCOL scans by column when scan_by_column=TRUE', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('TOCOL(A1:B2,0,TRUE)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [3], [2], [4]]);
  });

  it('TOROW flattens into a single row', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('TOROW(A1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1, 2, 3, 4]]);
  });

  it('TOROW ignores errors when ignore=2', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      B1: { type: 'error', code: '#N/A' },
      A2: 3,
      B2: 4,
    };
    const result = evalToSpill('TOROW(A1:B2,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1, 3, 4]]);
  });
});

describe('CHOOSECOLS / CHOOSEROWS', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 1,
    B1: 2,
    C1: 3,
    A2: 4,
    B2: 5,
    C2: 6,
  };

  it('CHOOSECOLS picks columns by position', () => {
    const result = evalToSpill('CHOOSECOLS(A1:C2,1,3)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 3],
      [4, 6],
    ]);
  });

  it('CHOOSECOLS supports negative indices counting from the end', () => {
    const result = evalToSpill('CHOOSECOLS(A1:C2,-1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[3], [6]]);
  });

  it('CHOOSECOLS returns #VALUE! when the column is out of range', () => {
    expect(evalToSpill('CHOOSECOLS(A1:C2,5)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('CHOOSEROWS picks rows by position', () => {
    const result = evalToSpill('CHOOSEROWS(A1:C2,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[4, 5, 6]]);
  });

  it('CHOOSEROWS supports negative indices counting from the end', () => {
    const result = evalToSpill('CHOOSEROWS(A1:C2,-1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[4, 5, 6]]);
  });
});

describe('TAKE / DROP', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 1,
    B1: 2,
    A2: 3,
    B2: 4,
    A3: 5,
    B3: 6,
  };

  it('TAKE takes the first N rows for a positive count', () => {
    const result = evalToSpill('TAKE(A1:B3,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('TAKE takes the last N rows for a negative count', () => {
    const result = evalToSpill('TAKE(A1:B3,-2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [3, 4],
      [5, 6],
    ]);
  });

  it('DROP removes the first N rows for a positive count', () => {
    const result = evalToSpill('DROP(A1:B3,1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [3, 4],
      [5, 6],
    ]);
  });

  it('DROP removes the last N rows for a negative count', () => {
    const result = evalToSpill('DROP(A1:B3,-1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('HSTACK / VSTACK', () => {
  it('HSTACK concatenates arrays side by side', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, B1: 3, B2: 4 };
    const result = evalToSpill('HSTACK(A1:A2,B1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('HSTACK pads shorter arrays with #N/A', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, B1: 9 };
    const result = evalToSpill('HSTACK(A1:A3,B1:B1)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 9],
      [2, { type: 'error', code: '#N/A' }],
      [3, { type: 'error', code: '#N/A' }],
    ]);
  });

  it('VSTACK concatenates arrays on top of each other', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('VSTACK(A1:B1,A2:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('VSTACK pads narrower rows with #N/A', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, C1: 3, A2: 9 };
    const result = evalToSpill('VSTACK(A1:C1,A2:A2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2, 3],
      [9, { type: 'error', code: '#N/A' }, { type: 'error', code: '#N/A' }],
    ]);
  });
});

describe('WRAPROWS / WRAPCOLS', () => {
  const vals: Record<string, FormulaResult> = { A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 };

  it('WRAPROWS wraps a vector into rows of the given width, padding with #N/A', () => {
    const result = evalToSpill('WRAPROWS(A1:A5,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [3, 4],
      [5, { type: 'error', code: '#N/A' }],
    ]);
  });

  it('WRAPROWS supports a custom pad_with value', () => {
    const result = evalToSpill('WRAPROWS(A1:A5,2,0)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [3, 4],
      [5, 0],
    ]);
  });

  it('WRAPCOLS wraps a vector into columns of the given height', () => {
    const result = evalToSpill('WRAPCOLS(A1:A5,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 3, 5],
      [2, 4, { type: 'error', code: '#N/A' }],
    ]);
  });
});

describe('EXPAND', () => {
  it('expands an array with #N/A padding by default', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, B1: 2, A2: 3, B2: 4 };
    const result = evalToSpill('EXPAND(A1:B2,3,3)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2, { type: 'error', code: '#N/A' }],
      [3, 4, { type: 'error', code: '#N/A' }],
      [
        { type: 'error', code: '#N/A' },
        { type: 'error', code: '#N/A' },
        { type: 'error', code: '#N/A' },
      ],
    ]);
  });

  it('expands with a custom pad_with value', () => {
    const vals: Record<string, FormulaResult> = { A1: 1 };
    const result = evalToSpill('EXPAND(A1:A1,2,2,0)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 0],
      [0, 0],
    ]);
  });

  it('returns #VALUE! when shrinking rows below the current size', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2 };
    expect(evalToSpill('EXPAND(A1:A2,1)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('ARRAYFORMULA / ARRAY_CONSTRAIN', () => {
  it('ARRAYFORMULA passes a range through unchanged', () => {
    const vals: Record<string, FormulaResult> = { A1: 1, A2: 2 };
    const result = evalToSpill('ARRAYFORMULA(A1:A2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1], [2]]);
  });

  it('ARRAYFORMULA passes a scalar through unchanged', () => {
    expect(evalToSpill('ARRAYFORMULA(5)', {})).toBe(5);
  });

  it('ARRAY_CONSTRAIN truncates a range to the given shape', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      B1: 2,
      C1: 3,
      A2: 4,
      B2: 5,
      C2: 6,
      A3: 7,
      B3: 8,
      C3: 9,
    };
    const result = evalToSpill('ARRAY_CONSTRAIN(A1:C3,2,2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });
});

describe('RANDARRAY', () => {
  it('generates an array of the requested shape within [min, max)', () => {
    const result = evalToSpill('RANDARRAY(2,3,5,10)', {});
    expect(isSpillResult(result)).toBe(true);
    const { values } = result as SpillResult;
    expect(values.length).toBe(2);
    expect(values[0].length).toBe(3);
    for (const row of values) {
      for (const v of row) {
        expect(typeof v).toBe('number');
        expect(v as number).toBeGreaterThanOrEqual(5);
        expect(v as number).toBeLessThan(10);
      }
    }
  });

  it('generates integers when integer=TRUE (1x1 collapses to a scalar)', () => {
    const result = evalToSpill('RANDARRAY(1,1,5,10,TRUE)', {});
    expect(isSpillResult(result)).toBe(false);
    expect(Number.isInteger(result as number)).toBe(true);
    expect(result as number).toBeGreaterThanOrEqual(5);
    expect(result as number).toBeLessThan(10);
  });
});

describe('MMULT', () => {
  it('multiplies two matrices', () => {
    const result = evalToSpill('MMULT({1,2;3,4},{5,6;7,8})', {});
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it('returns #VALUE! when inner dimensions do not match', () => {
    expect(evalToSpill('MMULT({1,2,3},{1,2})', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('FREQUENCY', () => {
  it('counts values into bins, returning bins.length+1 buckets', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1,
      A2: 5,
      A3: 10,
      A4: 15,
      A5: 20,
      B1: 5,
      B2: 15,
    };
    const result = evalToSpill('FREQUENCY(A1:A5,B1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    // <=5: 1,5 (2) | >5 and <=15: 10,15 (2) | >15: 20 (1)
    expect((result as SpillResult).values).toEqual([[2], [2], [1]]);
  });

  it('counts nothing into an empty-data result as all zeros', () => {
    const vals: Record<string, FormulaResult> = { B1: 5, B2: 15 };
    const result = evalToSpill('FREQUENCY(A1:A1,B1:B2)', vals);
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[0], [0], [0]]);
  });
});
