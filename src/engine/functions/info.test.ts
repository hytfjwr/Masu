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

describe('ISBLANK', () => {
  it('is TRUE for an empty cell', () => {
    expect(evalFormula('ISBLANK(A1)')).toBe(true);
  });

  it('is FALSE for a cell with a value', () => {
    expect(evalFormula('ISBLANK(A1)', { A1: 0 })).toBe(false);
  });
});

describe('ISNUMBER / ISTEXT / ISNONTEXT / ISLOGICAL', () => {
  it('ISNUMBER is TRUE for numbers', () => {
    expect(evalFormula('ISNUMBER(1)')).toBe(true);
    expect(evalFormula('ISNUMBER("1")')).toBe(false);
  });

  it('ISTEXT is TRUE for non-empty text', () => {
    expect(evalFormula('ISTEXT("hi")')).toBe(true);
    expect(evalFormula('ISTEXT("")')).toBe(false);
  });

  it('ISNONTEXT is TRUE for anything that is not text (including blank cells)', () => {
    expect(evalFormula('ISNONTEXT(A1)')).toBe(true);
    expect(evalFormula('ISNONTEXT("hi")')).toBe(false);
  });

  it('ISLOGICAL is TRUE only for booleans', () => {
    expect(evalFormula('ISLOGICAL(TRUE)')).toBe(true);
    expect(evalFormula('ISLOGICAL(1)')).toBe(false);
  });
});

describe('ISERROR / ISERR / ISNA', () => {
  it('ISERROR is TRUE for any error, without propagating it', () => {
    expect(evalFormula('ISERROR(1/0)')).toBe(true);
    expect(evalFormula('ISERROR(1)')).toBe(false);
  });

  it('ISERR is TRUE for errors other than #N/A', () => {
    expect(evalFormula('ISERR(1/0)')).toBe(true);
    expect(evalFormula('ISERR(NA())')).toBe(false);
  });

  it('ISNA is TRUE only for #N/A', () => {
    expect(evalFormula('ISNA(NA())')).toBe(true);
    expect(evalFormula('ISNA(1/0)')).toBe(false);
  });
});

describe('N / NA', () => {
  it('N passes numbers through and converts TRUE to 1', () => {
    expect(evalFormula('N(5)')).toBe(5);
    expect(evalFormula('N(TRUE)')).toBe(1);
  });

  it('N returns 0 for text and FALSE', () => {
    expect(evalFormula('N("abc")')).toBe(0);
    expect(evalFormula('N(FALSE)')).toBe(0);
    expect(evalFormula('N(NA())')).toEqual({ type: 'error', code: '#N/A' });
  });

  it('NA returns the #N/A error', () => {
    expect(evalFormula('NA()')).toEqual({ type: 'error', code: '#N/A' });
  });
});

describe('TYPE', () => {
  it('classifies scalar types', () => {
    expect(evalFormula('TYPE(1)')).toBe(1);
    expect(evalFormula('TYPE("a")')).toBe(2);
    expect(evalFormula('TYPE(TRUE)')).toBe(4);
    expect(evalFormula('TYPE(1/0)')).toBe(16);
  });

  it('returns 64 for a multi-cell range', () => {
    expect(evalFormula('TYPE(A1:A2)', { A1: 1, A2: 2 })).toBe(64);
  });
});

describe('ERROR.TYPE', () => {
  it('maps known error codes to their numbers', () => {
    expect(evalFormula('ERROR.TYPE(1/0)')).toBe(2);
    expect(evalFormula('ERROR.TYPE(NA())')).toBe(7);
  });

  it('returns #N/A for a non-error value', () => {
    expect(evalFormula('ERROR.TYPE(1)')).toEqual({ type: 'error', code: '#N/A' });
  });
});
