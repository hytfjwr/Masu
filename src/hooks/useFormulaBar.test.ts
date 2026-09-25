import { describe, it, expect } from 'vite-plus/test';
import { extractPartialFunctionName } from './useFormulaBar';

describe('extractPartialFunctionName', () => {
  it('extracts plain, dotted and digit-containing names', () => {
    expect(extractPartialFunctionName('=ST')).toBe('ST');
    expect(extractPartialFunctionName('=STDEV.S')).toBe('STDEV.S');
    expect(extractPartialFunctionName('=LOG1')).toBe('LOG1');
    expect(extractPartialFunctionName('=SUM(A1, ma')).toBe('MA');
  });

  it('ignores non-formulas and numbers', () => {
    expect(extractPartialFunctionName('hello')).toBeNull();
    expect(extractPartialFunctionName('=1+2')).toBeNull();
    expect(extractPartialFunctionName('=SUM(')).toBeNull();
  });
});
