import { describe, it, expect } from 'vitest';
import {
  describeRule,
  getListOptions,
  isCheckboxChecked,
  toggleCheckboxValue,
  validateInput,
} from './validation';
import type { ValidationContext } from './validation';
import type { ValidationRule } from '../types/grid';
import type { FormulaResult } from '../engine/types';
import { isSpillResult, makeError } from '../engine/types';
import { parse } from '../engine/parser';
import { evaluate } from '../engine/evaluator';
import { cellKey, parseCellKey } from './coordinates';
import { ymdToSerial } from './dateSerial';

/** Build a ValidationContext backed by a [row][col] grid, with a real parse/evaluate-based formula evaluator. */
function makeContext(grid: FormulaResult[][] = [], rangeMap: Record<string, FormulaResult[]> = {}): ValidationContext {
  const resolve = (key: string): FormulaResult => {
    const { col, row } = parseCellKey(key);
    return grid[row]?.[col] ?? '';
  };
  const expandRange = (start: string, end: string): string[] => {
    const s = parseCellKey(start);
    const e = parseCellKey(end);
    const keys: string[] = [];
    for (let row = s.row; row <= e.row; row++) {
      for (let col = s.col; col <= e.col; col++) keys.push(cellKey(col, row));
    }
    return keys;
  };
  const evaluateFormulaAt = (formula: string, col: number, row: number): FormulaResult => {
    const ast = parse(formula);
    const result = evaluate(ast, resolve, expandRange, undefined, undefined, undefined, { currentCell: { col, row } });
    return isSpillResult(result) ? makeError('#VALUE!') : result;
  };
  const resolveRangeValues = (range: string): FormulaResult[] | null => rangeMap[range] ?? null;
  return { resolveRangeValues, evaluateFormulaAt };
}

function makeRule(overrides: Partial<ValidationRule> = {}): ValidationRule {
  return { type: 'list', ...overrides };
}

describe('validateInput', () => {
  const ctx = makeContext();

  it('empty rawValue is always valid, regardless of rule type', () => {
    const rules: ValidationRule[] = [
      makeRule({ type: 'list', listValues: ['a', 'b'] }),
      makeRule({ type: 'number', min: 10, max: 20 }),
      makeRule({ type: 'textLength', min: 1, max: 3 }),
      makeRule({ type: 'date', dateMin: ymdToSerial(2026, 1, 1), dateMax: ymdToSerial(2026, 12, 31) }),
      makeRule({ type: 'checkbox' }),
      makeRule({ type: 'customFormula', formula: '=A1>10' }),
    ];
    for (const rule of rules) {
      expect(validateInput(rule, '', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    }
  });

  describe('list', () => {
    const rule = makeRule({ type: 'list', listValues: ['Apple', 'Banana', 'Cherry'] });

    it('is valid when the input matches a list option case-insensitively', () => {
      expect(validateInput(rule, 'banana', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    });

    it('is invalid when the input is not in the list', () => {
      const result = validateInput(rule, 'Grape', { col: 0, row: 0 }, ctx);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('リスト内の項目を入力してください: Apple, Banana, Cherry');
    });

    it('uses listSource in preference to listValues, deduplicating options', () => {
      const sourceCtx = makeContext([], { 'A1:A3': ['x', 'y', 'x'] });
      const sourceRule = makeRule({ type: 'list', listSource: 'A1:A3', listValues: ['unused'] });
      expect(getListOptions(sourceRule, sourceCtx)).toEqual(['x', 'y']);
      expect(validateInput(sourceRule, 'y', { col: 0, row: 0 }, sourceCtx)).toEqual({ valid: true });
      expect(validateInput(sourceRule, 'unused', { col: 0, row: 0 }, sourceCtx).valid).toBe(false);
    });
  });

  describe('number', () => {
    const rule = makeRule({ type: 'number', min: 10, max: 20 });

    it('is valid within the default between range', () => {
      expect(validateInput(rule, '15', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    });

    it('is invalid outside the range', () => {
      const result = validateInput(rule, '5', { col: 0, row: 0 }, ctx);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('10 から 20 までの数値を入力してください');
    });

    it('is invalid for a non-numeric input', () => {
      expect(validateInput(rule, 'abc', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });

    it('supports a non-between operator', () => {
      const gt = makeRule({ type: 'number', operator: 'greaterThan', min: 10 });
      expect(validateInput(gt, '11', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
      expect(validateInput(gt, '10', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });
  });

  describe('textLength', () => {
    const rule = makeRule({ type: 'textLength', min: 2, max: 4 });

    it('is valid within the character-count range', () => {
      expect(validateInput(rule, 'abc', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    });

    it('is invalid outside the character-count range', () => {
      expect(validateInput(rule, 'a', { col: 0, row: 0 }, ctx).valid).toBe(false);
      expect(validateInput(rule, 'abcde', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });
  });

  describe('date', () => {
    const rule = makeRule({
      type: 'date',
      dateMin: ymdToSerial(2026, 1, 1),
      dateMax: ymdToSerial(2026, 12, 31),
    });

    it('is valid within the date range', () => {
      expect(validateInput(rule, '2026/6/15', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    });

    it('is invalid outside the date range', () => {
      expect(validateInput(rule, '2025/12/31', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });

    it('is invalid for a non-date input', () => {
      expect(validateInput(rule, 'not a date', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });
  });

  describe('checkbox', () => {
    it('is valid for the default TRUE/FALSE values, case-insensitively', () => {
      const rule = makeRule({ type: 'checkbox' });
      expect(validateInput(rule, 'true', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
      expect(validateInput(rule, 'FALSE', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
    });

    it('is invalid for anything other than the checked/unchecked values', () => {
      const rule = makeRule({ type: 'checkbox', checkedValue: 'Yes', uncheckedValue: 'No' });
      expect(validateInput(rule, 'Yes', { col: 0, row: 0 }, ctx)).toEqual({ valid: true });
      expect(validateInput(rule, 'true', { col: 0, row: 0 }, ctx).valid).toBe(false);
    });
  });

  describe('customFormula', () => {
    // Column A holds the value being checked; the rule is anchored at the top of column B (B1:B5)
    // and references the same-row cell in column A.
    const grid: FormulaResult[][] = [
      [0, ''],
      [20, ''],
      [5, ''],
    ];
    const formulaCtx = makeContext(grid);
    const rule = makeRule({ type: 'customFormula', formula: '=A1>10', anchor: { col: 1, row: 0 } });

    it('is valid when the shifted formula evaluates to TRUE', () => {
      expect(validateInput(rule, '42', { col: 1, row: 1 }, formulaCtx)).toEqual({ valid: true });
    });

    it('is invalid when the shifted formula evaluates to FALSE', () => {
      const result = validateInput(rule, '42', { col: 1, row: 2 }, formulaCtx);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('入力値がカスタム数式の条件を満たしていません');
    });
  });

  describe('rejectInvalid', () => {
    it('does not affect the valid/invalid judgment (the caller decides whether to reject or warn)', () => {
      const strict = makeRule({ type: 'number', min: 10, max: 20, rejectInvalid: true });
      const lenient = makeRule({ type: 'number', min: 10, max: 20, rejectInvalid: false });
      expect(validateInput(strict, '5', { col: 0, row: 0 }, ctx)).toEqual(validateInput(lenient, '5', { col: 0, row: 0 }, ctx));
    });
  });
});

describe('toggleCheckboxValue / isCheckboxChecked', () => {
  it('toggles between the default TRUE/FALSE values', () => {
    const rule = makeRule({ type: 'checkbox' });
    expect(toggleCheckboxValue(rule, 'TRUE')).toBe('FALSE');
    expect(toggleCheckboxValue(rule, 'FALSE')).toBe('TRUE');
    expect(isCheckboxChecked(rule, 'TRUE')).toBe(true);
    expect(isCheckboxChecked(rule, 'FALSE')).toBe(false);
  });

  it('toggles between custom checked/unchecked values', () => {
    const rule = makeRule({ type: 'checkbox', checkedValue: 'Yes', uncheckedValue: 'No' });
    expect(toggleCheckboxValue(rule, 'No')).toBe('Yes');
    expect(toggleCheckboxValue(rule, 'Yes')).toBe('No');
    expect(isCheckboxChecked(rule, 'Yes')).toBe(true);
    expect(isCheckboxChecked(rule, 'No')).toBe(false);
  });
});

describe('describeRule', () => {
  const ctx = makeContext();

  it('describes a list rule', () => {
    const rule = makeRule({ type: 'list', listValues: ['a', 'b', 'c'] });
    expect(describeRule(rule, ctx)).toBe('リスト内の項目を入力してください: a, b, c');
  });

  it('describes a number rule (between)', () => {
    const rule = makeRule({ type: 'number', min: 1, max: 10 });
    expect(describeRule(rule, ctx)).toBe('1 から 10 までの数値を入力してください');
  });
});
