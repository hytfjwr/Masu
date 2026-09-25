import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type {
  EvaluateOptions,
  FormulaResult,
  NamedRangeResolver,
  RangeExpander,
  SheetNameResolver,
  SpillResult,
} from '../types';
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

function evalFormula(
  formula: string,
  cellValues: Record<string, FormulaResult>,
  extra?: { resolveSheetName?: SheetNameResolver; resolveNamedRange?: NamedRangeResolver; options?: EvaluateOptions },
): FormulaResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  const result = evaluate(ast, resolve, expandRange, extra?.resolveSheetName, extra?.resolveNamedRange, undefined, extra?.options);
  if (typeof result === 'object' && result !== null && 'type' in result && result.type === 'spill') {
    return { type: 'error', code: '#VALUE!' };
  }
  return result as FormulaResult;
}

function evalToSpill(
  formula: string,
  cellValues: Record<string, FormulaResult>,
  extra?: { resolveSheetName?: SheetNameResolver; resolveNamedRange?: NamedRangeResolver; options?: EvaluateOptions },
): FormulaResult | SpillResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  return evaluate(ast, resolve, expandRange, extra?.resolveSheetName, extra?.resolveNamedRange, undefined, extra?.options);
}

describe('SUMIFS', () => {
  const vals: Record<string, FormulaResult> = {
    // Sum range
    A1: 100, A2: 200, A3: 300, A4: 400, A5: 150,
    // Criteria range 1 (region)
    B1: '東京', B2: '大阪', B3: '東京', B4: '大阪', B5: '東京',
    // Criteria range 2 (amount)
    C1: 100, C2: 200, C3: 300, C4: 400, C5: 150,
  };

  it('single criteria', () => {
    // SUMIFS(A1:A5, B1:B5, "東京") = 100+300+150 = 550
    expect(evalFormula('SUMIFS(A1:A5,B1:B5,"東京")', vals)).toBe(550);
  });

  it('multiple criteria', () => {
    // SUMIFS(A1:A5, B1:B5, "東京", C1:C5, ">100") = 300+150 = 450
    expect(evalFormula('SUMIFS(A1:A5,B1:B5,"東京",C1:C5,">100")', vals)).toBe(450);
  });

  it('supports comparison operators', () => {
    expect(evalFormula('SUMIFS(A1:A5,C1:C5,">=200")', vals)).toBe(200+300+400); // 900
    expect(evalFormula('SUMIFS(A1:A5,C1:C5,"<200")', vals)).toBe(100+150); // 250
  });

  it('returns #VALUE! with invalid arg count', () => {
    // 2 args (no criteria pair)
    expect(evalFormula('SUMIFS(A1:A5,B1:B5)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('COUNTIFS', () => {
  const vals: Record<string, FormulaResult> = {
    A1: '東京', A2: '大阪', A3: '東京', A4: '大阪', A5: '東京',
    B1: 100, B2: 200, B3: 300, B4: 400, B5: 150,
  };

  it('single criteria', () => {
    expect(evalFormula('COUNTIFS(A1:A5,"東京")', vals)).toBe(3);
  });

  it('multiple criteria', () => {
    // COUNTIFS(A1:A5, "東京", B1:B5, ">100") = 2 (B3=300, B5=150)
    expect(evalFormula('COUNTIFS(A1:A5,"東京",B1:B5,">100")', vals)).toBe(2);
  });

  it('returns #VALUE! with odd number of args', () => {
    expect(evalFormula('COUNTIFS(A1:A5)', vals)).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('AVERAGEIFS', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 100, A2: 200, A3: 300, A4: 400, A5: 150,
    B1: '東京', B2: '大阪', B3: '東京', B4: '大阪', B5: '東京',
  };

  it('calculates conditional average', () => {
    // AVERAGEIFS(A1:A5, B1:B5, "東京") = (100+300+150)/3 ≈ 183.33
    const result = evalFormula('AVERAGEIFS(A1:A5,B1:B5,"東京")', vals);
    expect(typeof result).toBe('number');
    expect(result as number).toBeCloseTo(183.333, 2);
  });

  it('returns #DIV/0! when no matches', () => {
    expect(evalFormula('AVERAGEIFS(A1:A5,B1:B5,"福岡")', vals)).toEqual({ type: 'error', code: '#DIV/0!' });
  });
});

describe('XLOOKUP', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 'Apple', A2: 'Banana', A3: 'Cherry',
    B1: 100, B2: 200, B3: 300,
  };

  it('exact match', () => {
    expect(evalFormula('XLOOKUP("Banana",A1:A3,B1:B3)', vals)).toBe(200);
  });

  it('returns default when not found', () => {
    expect(evalFormula('XLOOKUP("Durian",A1:A3,B1:B3,"Not Found")', vals)).toBe('Not Found');
  });

  it('returns #N/A when not found and no default', () => {
    expect(evalFormula('XLOOKUP("Durian",A1:A3,B1:B3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });

  it('reverse search mode (-1)', () => {
    const vals2: Record<string, FormulaResult> = {
      A1: 'A', A2: 'B', A3: 'B', A4: 'C',
      B1: 1, B2: 2, B3: 3, B4: 4,
    };
    // search_mode = -1 → search from last to first, find last 'B'
    expect(evalFormula('XLOOKUP("B",A1:A4,B1:B4,"NF",0,-1)', vals2)).toBe(3);
  });

  it('approximate match (-1 = next smaller)', () => {
    const vals2: Record<string, FormulaResult> = {
      A1: 10, A2: 20, A3: 30, A4: 40,
      B1: 'ten', B2: 'twenty', B3: 'thirty', B4: 'forty',
    };
    // match_mode = -1, search for 25 → next smaller is 20 → "twenty"
    expect(evalFormula('XLOOKUP(25,A1:A4,B1:B4,"NF",-1)', vals2)).toBe('twenty');
  });
});

describe('XMATCH', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 'Apple', A2: 'Banana', A3: 'Cherry',
  };

  it('exact match returns 1-based position', () => {
    expect(evalFormula('XMATCH("Banana",A1:A3)', vals)).toBe(2);
  });

  it('returns #N/A when not found', () => {
    expect(evalFormula('XMATCH("Durian",A1:A3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });

  it('approximate match (-1 = next smaller)', () => {
    const vals2: Record<string, FormulaResult> = {
      A1: 10, A2: 20, A3: 30, A4: 40,
    };
    // match_mode = -1, search for 25 → next smaller is 20 at position 2
    expect(evalFormula('XMATCH(25,A1:A4,-1)', vals2)).toBe(2);
  });
});

describe('HLOOKUP', () => {
  const vals: Record<string, FormulaResult> = {
    A1: 'Apple', B1: 'Banana', C1: 'Cherry',
    A2: 100, B2: 200, C2: 300,
  };

  it('exact match finds the value in the given row', () => {
    expect(evalFormula('HLOOKUP("Banana",A1:C2,2,FALSE)', vals)).toBe(200);
  });

  it('returns #N/A when exact match not found', () => {
    expect(evalFormula('HLOOKUP("Durian",A1:C2,2,FALSE)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });

  it('approximate match finds the largest value <= lookup_value', () => {
    const vals2: Record<string, FormulaResult> = {
      A1: 10, B1: 20, C1: 30,
      A2: 'ten', B2: 'twenty', C2: 'thirty',
    };
    expect(evalFormula('HLOOKUP(25,A1:C2,2)', vals2)).toBe('twenty');
  });

  it('returns #REF! when row_index_num is out of range', () => {
    expect(evalFormula('HLOOKUP("Banana",A1:C2,5,FALSE)', vals)).toEqual({ type: 'error', code: '#REF!' });
  });
});

describe('LOOKUP', () => {
  it('vector form: finds the last value <= lookup_value', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 10, A2: 20, A3: 30,
      B1: 'ten', B2: 'twenty', B3: 'thirty',
    };
    expect(evalFormula('LOOKUP(25,A1:A3,B1:B3)', vals)).toBe('twenty');
  });

  it('returns #N/A when lookup_value is smaller than every entry', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 10, A2: 20, A3: 30,
      B1: 'ten', B2: 'twenty', B3: 'thirty',
    };
    expect(evalFormula('LOOKUP(5,A1:A3,B1:B3)', vals)).toEqual({ type: 'error', code: '#N/A' });
  });

  it('array form (taller than wide): searches first column, returns last column', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1, B1: 'one',
      A2: 2, B2: 'two',
      A3: 3, B3: 'three',
    };
    expect(evalFormula('LOOKUP(2,A1:B3)', vals)).toBe('two');
  });

  it('array form (wider than tall): searches first row, returns last row', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 1, B1: 2, C1: 3,
      A2: 'one', B2: 'two', C2: 'three',
    };
    expect(evalFormula('LOOKUP(2,A1:C2)', vals)).toBe('two');
  });
});

describe('ROWS / COLUMNS', () => {
  it('ROWS counts the rows of a range', () => {
    expect(evalFormula('ROWS(A1:B5)', {})).toBe(5);
  });

  it('ROWS of a single cell is 1', () => {
    expect(evalFormula('ROWS(A1)', { A1: 1 })).toBe(1);
  });

  it('COLUMNS counts the columns of a range', () => {
    expect(evalFormula('COLUMNS(A1:C1)', {})).toBe(3);
  });

  it('COLUMNS of a single cell is 1', () => {
    expect(evalFormula('COLUMNS(A1)', { A1: 1 })).toBe(1);
  });
});

describe('ROW / COLUMN', () => {
  it('ROW() with no argument uses the current cell', () => {
    const options: EvaluateOptions = { currentCell: { col: 2, row: 4 } };
    expect(evalFormula('ROW()', {}, { options })).toBe(5); // row 4 (0-indexed) -> 5
  });

  it('ROW() returns #VALUE! when there is no current cell', () => {
    expect(evalFormula('ROW()', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('ROW(ref) returns the row of a single-cell reference', () => {
    expect(evalFormula('ROW(A5)', {})).toBe(5);
  });

  it('ROW(range) with multiple rows spills a vertical array of row numbers', () => {
    const result = evalToSpill('ROW(A2:B4)', {});
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[2], [3], [4]]);
  });

  it('COLUMN() with no argument uses the current cell', () => {
    const options: EvaluateOptions = { currentCell: { col: 2, row: 4 } };
    expect(evalFormula('COLUMN()', {}, { options })).toBe(3); // col 2 (0-indexed) -> 3
  });

  it('COLUMN(ref) returns the column of a single-cell reference', () => {
    expect(evalFormula('COLUMN(C1)', {})).toBe(3);
  });

  it('COLUMN(range) with multiple columns spills a horizontal array of column numbers', () => {
    const result = evalToSpill('COLUMN(B1:D2)', {});
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[2, 3, 4]]);
  });
});

describe('ADDRESS', () => {
  it('defaults to a fully absolute A1-style reference', () => {
    expect(evalFormula('ADDRESS(1,1)', {})).toBe('$A$1');
  });

  it('supports each abs_num variant', () => {
    expect(evalFormula('ADDRESS(2,3,2)', {})).toBe('C$2');
    expect(evalFormula('ADDRESS(2,3,3)', {})).toBe('$C2');
    expect(evalFormula('ADDRESS(2,3,4)', {})).toBe('C2');
  });

  it('prefixes a sheet name, quoting when it contains a space', () => {
    expect(evalFormula('ADDRESS(1,1,1,TRUE,"Sheet2")', {})).toBe('Sheet2!$A$1');
    expect(evalFormula('ADDRESS(1,1,1,TRUE,"My Sheet")', {})).toBe("'My Sheet'!$A$1");
  });

  it('R1C1 style is only supported for abs_num=1', () => {
    expect(evalFormula('ADDRESS(2,3,1,FALSE)', {})).toBe('R2C3');
    expect(evalFormula('ADDRESS(2,3,2,FALSE)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('INDIRECT', () => {
  it('resolves a single-cell reference text', () => {
    expect(evalFormula('INDIRECT("A1")', { A1: 42 })).toBe(42);
  });

  it('resolves a range reference text as a spill', () => {
    const result = evalToSpill('INDIRECT("A1:B2")', { A1: 1, B1: 2, A2: 3, B2: 4 });
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1, 2], [3, 4]]);
  });

  it('resolves a sheet-qualified reference via resolveSheetName', () => {
    const resolveSheetName: SheetNameResolver = (name) => (name === 'Sheet2' ? 'sheet2Id' : undefined);
    const resolve = (key: string): FormulaResult => (key === 'sheet2Id:A1' ? 'hello' : '');
    const ast = parse('INDIRECT("Sheet2!A1")');
    expect(evaluate(ast, resolve, expandRange, resolveSheetName)).toBe('hello');
  });

  it('returns #REF! for an invalid reference string', () => {
    expect(evalFormula('INDIRECT("not a ref")', {})).toEqual({ type: 'error', code: '#REF!' });
  });

  it('returns #REF! when the sheet name cannot be resolved', () => {
    expect(evalFormula('INDIRECT("Sheet2!A1")', {})).toEqual({ type: 'error', code: '#REF!' });
  });
});

describe('OFFSET', () => {
  it('moves the reference by the given row/column offsets', () => {
    expect(evalFormula('OFFSET(A1:A1,1,1)', { B2: 99 })).toBe(99);
  });

  it('expands to a range when height/width are given', () => {
    const result = evalToSpill('OFFSET(A1:A1,0,0,2,2)', { A1: 1, B1: 2, A2: 3, B2: 4 });
    expect(isSpillResult(result)).toBe(true);
    expect((result as SpillResult).values).toEqual([[1, 2], [3, 4]]);
  });

  it('returns #VALUE! when reference is not a range', () => {
    expect(evalFormula('OFFSET(1,1,1)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('returns #REF! when the new position is out of bounds', () => {
    expect(evalFormula('OFFSET(A1:A1,-1,0)', {})).toEqual({ type: 'error', code: '#REF!' });
  });
});
