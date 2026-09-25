import { describe, it, expect } from 'vite-plus/test';
import { evaluate } from './evaluator';
import { parse } from './parser';
import { formatNumberForText, textToNumber } from './coerce';
import type { FormulaResult, RangeExpander } from './types';

/** Excel-compatible coercion: number <-> text, logical values in references, operator edge cases. */

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

function evalFormula(formula: string, cellValues: Record<string, FormulaResult> = {}) {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  return evaluate(parse(formula), resolve, expandRange);
}

const err = (code: string) => ({ type: 'error', code });

describe('formatNumberForText', () => {
  it('rounds to 15 significant digits', () => {
    expect(formatNumberForText(0.1 + 0.2)).toBe('0.3');
    expect(formatNumberForText(1 / 3)).toBe('0.333333333333333');
    expect(formatNumberForText(2 / 3)).toBe('0.666666666666667');
    expect(formatNumberForText(123456789012345)).toBe('123456789012345');
    expect(formatNumberForText(-42)).toBe('-42');
    expect(formatNumberForText(-0)).toBe('0');
  });

  it('uses E notation with an upper-case E and two-digit exponent for large and tiny values', () => {
    expect(formatNumberForText(1e15)).toBe('1E+15');
    expect(formatNumberForText(2 ** 53)).toBe('9.00719925474099E+15');
    expect(formatNumberForText(1.2345678901234568e17)).toBe('1.23456789012346E+17');
    expect(formatNumberForText(1e20)).toBe('1E+20');
    expect(formatNumberForText(-1.5e100)).toBe('-1.5E+100');
    expect(formatNumberForText(1e-10)).toBe('1E-10');
    expect(formatNumberForText(1.5e-7)).toBe('1.5E-07');
    expect(formatNumberForText(0.000001)).toBe('0.000001');
  });
});

describe('textToNumber', () => {
  it('reads plain and scientific notation', () => {
    expect(textToNumber('42')).toBe(42);
    expect(textToNumber(' 3 ')).toBe(3);
    expect(textToNumber('-1.5e3')).toBe(-1500);
    expect(textToNumber('.5')).toBe(0.5);
    expect(textToNumber('')).toBe(0);
  });

  it('reads what typed input reads as a number', () => {
    expect(textToNumber('1,000')).toBe(1000);
    expect(textToNumber('10%')).toBeCloseTo(0.1, 12);
    expect(textToNumber('¥1,000')).toBe(1000);
    expect(textToNumber('$5')).toBe(5);
    expect(textToNumber('(100)')).toBe(-100);
    expect(textToNumber('2026/4/1')).toBe(46113);
    expect(textToNumber('12:30')).toBeCloseTo(0.5208333333, 9);
  });

  it('rejects other text, including JS-only number syntax', () => {
    for (const s of ['abc', '0x10', '0b11', 'Infinity', 'NaN', 'TRUE', '1,00', '  ']) {
      expect(textToNumber(s)).toEqual(err('#VALUE!'));
    }
  });
});

describe('text coercion in operators and numeric arguments', () => {
  it('converts number-like text in arithmetic', () => {
    expect(evalFormula('"10%"+0')).toBeCloseTo(0.1, 12);
    expect(evalFormula('"-10%"*1')).toBeCloseTo(-0.1, 12);
    expect(evalFormula('"2026/4/1"+0')).toBe(46113);
    expect(evalFormula('"(100)"+0')).toBe(-100);
    expect(evalFormula('"¥1,000"+0')).toBe(1000);
    expect(evalFormula('"0x10"+0')).toEqual(err('#VALUE!'));
    expect(evalFormula('"Infinity"+0')).toEqual(err('#VALUE!'));
  });

  it('converts number-like text passed to a numeric parameter', () => {
    expect(evalFormula('ABS("-10%")')).toBeCloseTo(0.1, 12);
    expect(evalFormula('ROUND("1,234.567",1)')).toBeCloseTo(1234.6, 9);
    expect(evalFormula('ABS("0x10")')).toEqual(err('#VALUE!'));
  });

  it('stringifies numbers in text functions like &', () => {
    expect(evalFormula('LEN(1/3)')).toBe(17);
    expect(evalFormula('RIGHT(2/3,2)')).toBe('67');
    expect(evalFormula('LEFT(0.1+0.2,5)')).toBe('0.3');
    expect(evalFormula('1E+20&""')).toBe('1E+20');
    expect(evalFormula('LEN(1E+20)')).toBe(5);
  });
});
