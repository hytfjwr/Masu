import { describe, it, expect } from 'vite-plus/test';
import { getFunctionCallContext } from './functionCallContext';

const at = (formula: string) => getFunctionCallContext(formula, formula.length);

describe('getFunctionCallContext', () => {
  it('returns null outside formulas and outside any call', () => {
    expect(at('SUM(')).toBeNull();
    expect(at('=A1+B1')).toBeNull();
    expect(at('=SUM(A1)')).toBeNull();
  });

  it('finds the function and argument index at the caret', () => {
    expect(at('=SUM(')).toEqual({ name: 'SUM', argIndex: 0 });
    expect(at('=VLOOKUP(A1, B:C, ')).toEqual({ name: 'VLOOKUP', argIndex: 2 });
    expect(at('=vlookup(a1,')).toEqual({ name: 'VLOOKUP', argIndex: 1 });
    expect(at('=STDEV.S(A1:A9, ')).toEqual({ name: 'STDEV.S', argIndex: 1 });
  });

  it('uses the caret position, not the end of the text', () => {
    const f = '=IF(A1>0, SUM(B1:B3), 0)';
    expect(getFunctionCallContext(f, f.indexOf('B1'))).toEqual({ name: 'SUM', argIndex: 0 });
    expect(getFunctionCallContext(f, f.indexOf(', 0') + 2)).toEqual({ name: 'IF', argIndex: 2 });
  });

  it('returns the innermost named call for nested calls', () => {
    expect(at('=IF(A1>0, ROUND(B1, ')).toEqual({ name: 'ROUND', argIndex: 1 });
    expect(at('=IF(A1>0, ROUND(B1, 2), ')).toEqual({ name: 'IF', argIndex: 2 });
  });

  it('does not count commas in strings, array literals or grouping parentheses', () => {
    expect(at('=CONCAT("a,b", ')).toEqual({ name: 'CONCAT', argIndex: 1 });
    expect(at('=CONCAT("say ""hi, there""", ')).toEqual({ name: 'CONCAT', argIndex: 1 });
    expect(at('=SUM({1,2,3}, ')).toEqual({ name: 'SUM', argIndex: 1 });
    expect(at('=SUM((A1+B1), (C1')).toEqual({ name: 'SUM', argIndex: 1 });
    expect(at('=CONCAT("x, y')).toEqual({ name: 'CONCAT', argIndex: 0 });
  });
});
