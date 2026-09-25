import { describe, it, expect } from 'vitest';
import {
  createConditionalFormatter,
  evaluateCondition,
  getConditionalStyle,
} from './conditionalFormat';
import type { CfContext } from './conditionalFormat';
import type { ConditionalFormatRule } from '../types/grid';
import type { FormulaResult } from '../engine/types';
import { isSpillResult, makeError } from '../engine/types';
import { parse } from '../engine/parser';
import { evaluate } from '../engine/evaluator';
import { cellKey, parseCellKey } from './coordinates';

function makeRule(overrides: Partial<ConditionalFormatRule> = {}): ConditionalFormatRule {
  return {
    id: 'rule1',
    range: { startCol: 0, startRow: 0, endCol: 10, endRow: 10 },
    operator: 'greaterThan',
    value1: '30',
    style: { backgroundColor: '#ff0000' },
    priority: 1,
    enabled: true,
    ...overrides,
  };
}

describe('conditionalFormat', () => {
  describe('evaluateCondition', () => {
    it('greaterThan: 50 > 30 is true', () => {
      expect(evaluateCondition('50', makeRule({ operator: 'greaterThan', value1: '30' }))).toBe(
        true,
      );
    });

    it('greaterThan: 20 > 30 is false', () => {
      expect(evaluateCondition('20', makeRule({ operator: 'greaterThan', value1: '30' }))).toBe(
        false,
      );
    });

    it('lessThan: 10 < 30 is true', () => {
      expect(evaluateCondition('10', makeRule({ operator: 'lessThan', value1: '30' }))).toBe(true);
    });

    it('greaterThanOrEqual: 30 >= 30 is true', () => {
      expect(
        evaluateCondition('30', makeRule({ operator: 'greaterThanOrEqual', value1: '30' })),
      ).toBe(true);
    });

    it('lessThanOrEqual: 30 <= 30 is true', () => {
      expect(evaluateCondition('30', makeRule({ operator: 'lessThanOrEqual', value1: '30' }))).toBe(
        true,
      );
    });

    it('equal: case insensitive', () => {
      expect(evaluateCondition('hello', makeRule({ operator: 'equal', value1: 'Hello' }))).toBe(
        true,
      );
    });

    it('notEqual', () => {
      expect(evaluateCondition('hello', makeRule({ operator: 'notEqual', value1: 'world' }))).toBe(
        true,
      );
    });

    it('between: 20 in [10, 30] is true', () => {
      expect(
        evaluateCondition('20', makeRule({ operator: 'between', value1: '10', value2: '30' })),
      ).toBe(true);
    });

    it('between: 5 in [10, 30] is false', () => {
      expect(
        evaluateCondition('5', makeRule({ operator: 'between', value1: '10', value2: '30' })),
      ).toBe(false);
    });

    it('notBetween: 5 not in [10, 30] is true', () => {
      expect(
        evaluateCondition('5', makeRule({ operator: 'notBetween', value1: '10', value2: '30' })),
      ).toBe(true);
    });

    it('textContains: case insensitive', () => {
      expect(
        evaluateCondition('Hello World', makeRule({ operator: 'textContains', value1: 'world' })),
      ).toBe(true);
    });

    it('textNotContains', () => {
      expect(
        evaluateCondition('Hello', makeRule({ operator: 'textNotContains', value1: 'world' })),
      ).toBe(true);
    });

    it('isEmpty: empty string is true', () => {
      expect(evaluateCondition('', makeRule({ operator: 'isEmpty' }))).toBe(true);
    });

    it('isNotEmpty: non-empty is true', () => {
      expect(evaluateCondition('abc', makeRule({ operator: 'isNotEmpty' }))).toBe(true);
    });

    it('non-numeric cell with numeric operator returns false', () => {
      expect(evaluateCondition('abc', makeRule({ operator: 'greaterThan', value1: '30' }))).toBe(
        false,
      );
    });

    it('disabled rule returns false', () => {
      expect(evaluateCondition('50', makeRule({ enabled: false }))).toBe(false);
    });
  });

  describe('getConditionalStyle', () => {
    it('returns null when cell is outside all rule ranges', () => {
      const rules = [makeRule({ range: { startCol: 5, startRow: 5, endCol: 10, endRow: 10 } })];
      expect(getConditionalStyle(0, 0, '50', rules)).toBeNull();
    });

    it('returns matching rule style', () => {
      const rules = [makeRule()];
      const style = getConditionalStyle(0, 0, '50', rules);
      expect(style).toEqual({ backgroundColor: '#ff0000' });
    });

    it('returns highest priority (lowest number) matching rule', () => {
      const rules = [
        makeRule({ id: 'r1', priority: 2, style: { backgroundColor: '#00ff00' } }),
        makeRule({ id: 'r2', priority: 1, style: { backgroundColor: '#ff0000' } }),
      ];
      const style = getConditionalStyle(0, 0, '50', rules);
      expect(style).toEqual({ backgroundColor: '#ff0000' });
    });

    it('skips disabled rules', () => {
      const rules = [
        makeRule({ id: 'r1', priority: 1, enabled: false, style: { backgroundColor: '#ff0000' } }),
        makeRule({ id: 'r2', priority: 2, style: { backgroundColor: '#00ff00' } }),
      ];
      const style = getConditionalStyle(0, 0, '50', rules);
      expect(style).toEqual({ backgroundColor: '#00ff00' });
    });

    it('returns null when no rule condition matches', () => {
      const rules = [makeRule({ operator: 'greaterThan', value1: '100' })];
      expect(getConditionalStyle(0, 0, '50', rules)).toBeNull();
    });
  });
});

/** Build a CfContext backed by a simple [row][col] grid, with a real parse/evaluate-based formula evaluator. */
function makeCfContext(grid: FormulaResult[][]): CfContext {
  const getValue = (col: number, row: number): FormulaResult => grid[row]?.[col] ?? '';

  const resolve = (key: string): FormulaResult => {
    const { col, row } = parseCellKey(key);
    return getValue(col, row);
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
    const result = evaluate(ast, resolve, expandRange, undefined, undefined, undefined, {
      currentCell: { col, row },
    });
    return isSpillResult(result) ? makeError('#VALUE!') : result;
  };

  return { getValue, evaluateFormulaAt };
}

describe('createConditionalFormatter', () => {
  function makeRule2(overrides: Partial<ConditionalFormatRule> = {}): ConditionalFormatRule {
    return {
      id: 'rule1',
      range: { startCol: 0, startRow: 0, endCol: 0, endRow: 10 },
      operator: 'greaterThan',
      value1: '30',
      style: { backgroundColor: '#ff0000' },
      priority: 1,
      enabled: true,
      ...overrides,
    };
  }

  describe('value kind (default)', () => {
    it('matches using the existing operator-based check', () => {
      const grid: FormulaResult[][] = [[50], [20]];
      const formatter = createConditionalFormatter([makeRule2()], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
    });

    it('returns undefined when the condition does not match', () => {
      const grid: FormulaResult[][] = [[50], [20]];
      const formatter = createConditionalFormatter([makeRule2()], makeCfContext(grid));
      expect(formatter(0, 1)).toBeUndefined();
    });
  });

  describe('formula kind', () => {
    // Rule range is column A (rows 0-2); formula checks column B on the same row via an absolute column ref.
    const grid: FormulaResult[][] = [
      ['', 5],
      ['', 20],
      ['', 15],
    ];
    const rule = makeRule2({
      kind: 'formula',
      formula: '=$B1>10',
      range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
    });

    it('matches when the shifted formula evaluates to TRUE for that row', () => {
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#ff0000' });
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#ff0000' });
    });

    it('does not match when the shifted formula evaluates to FALSE', () => {
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toBeUndefined();
    });
  });

  describe('colorScale kind', () => {
    it('interpolates a 2-color scale (min/max), rounding with Math.round', () => {
      const grid: FormulaResult[][] = [[0], [5], [10]];
      const rule = makeRule2({
        kind: 'colorScale',
        colorScale: {
          min: { type: 'min', color: '#ff0000' },
          max: { type: 'max', color: '#00ff00' },
        },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#808000' });
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#00ff00' });
    });

    it('interpolates a 3-color scale (min/mid/max)', () => {
      const grid: FormulaResult[][] = [[0], [5], [10]];
      const rule = makeRule2({
        kind: 'colorScale',
        colorScale: {
          min: { type: 'min', color: '#ff0000' },
          mid: { type: 'number', value: 5, color: '#ffff00' },
          max: { type: 'max', color: '#0000ff' },
        },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#ffff00' });
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#0000ff' });
    });

    it('resolves percentile stops via linear interpolation (PERCENTILE.INC)', () => {
      const grid: FormulaResult[][] = [[10], [20], [30], [40], [50]];
      const rule = makeRule2({
        kind: 'colorScale',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 4 },
        colorScale: {
          min: { type: 'percentile', value: 25, color: '#000000' },
          max: { type: 'percentile', value: 75, color: '#ffffff' },
        },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      // 25th percentile = 20, 75th percentile = 40; value 30 is exactly halfway.
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#808080' });
    });

    it('uses the min color (or mid color, if set) when the scale is degenerate (min == max)', () => {
      const grid: FormulaResult[][] = [[7], [7]];
      const rule = makeRule2({
        kind: 'colorScale',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 1 },
        colorScale: {
          min: { type: 'min', color: '#ff0000' },
          max: { type: 'max', color: '#00ff00' },
        },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
    });
  });

  describe('duplicate kind', () => {
    it('matches string values that occur more than once, case-insensitively', () => {
      const grid: FormulaResult[][] = [['a'], ['A'], ['b'], ['c']];
      const rule = makeRule2({
        kind: 'duplicate',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 3 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#ff0000' });
    });

    it('does not match values that occur only once', () => {
      const grid: FormulaResult[][] = [['a'], ['A'], ['b'], ['c']];
      const rule = makeRule2({
        kind: 'duplicate',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 3 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 2)).toBeUndefined();
      expect(formatter(0, 3)).toBeUndefined();
    });
  });

  describe('unique kind', () => {
    it('matches numeric values that occur exactly once', () => {
      const grid: FormulaResult[][] = [[1], [2], [1], [3]];
      const rule = makeRule2({
        kind: 'unique',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 3 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#ff0000' });
      expect(formatter(0, 3)).toEqual({ backgroundColor: '#ff0000' });
    });

    it('does not match values that occur more than once', () => {
      const grid: FormulaResult[][] = [[1], [2], [1], [3]];
      const rule = makeRule2({
        kind: 'unique',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 3 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toBeUndefined();
      expect(formatter(0, 2)).toBeUndefined();
    });
  });

  describe('top kind', () => {
    const grid: FormulaResult[][] = [[10], [20], [30], [40], [50]];

    it('matches the top N values by count, including ties at the threshold', () => {
      const rule = makeRule2({
        kind: 'top',
        rank: 2,
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 4 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 3)).toEqual({ backgroundColor: '#ff0000' }); // 40
      expect(formatter(0, 4)).toEqual({ backgroundColor: '#ff0000' }); // 50
      expect(formatter(0, 2)).toBeUndefined(); // 30
    });

    it('matches the top N% of values (rounding the count up, minimum 1)', () => {
      const grid10: FormulaResult[][] = Array.from({ length: 10 }, (_, i) => [i + 1]);
      const rule = makeRule2({
        kind: 'top',
        rank: 25,
        percent: true,
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 9 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid10));
      expect(formatter(0, 7)).toEqual({ backgroundColor: '#ff0000' }); // value 8
      expect(formatter(0, 6)).toBeUndefined(); // value 7
    });
  });

  describe('bottom kind', () => {
    const grid: FormulaResult[][] = [[10], [20], [30], [40], [50]];

    it('matches the bottom N values by count, including ties at the threshold', () => {
      const rule = makeRule2({
        kind: 'bottom',
        rank: 2,
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 4 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' }); // 10
      expect(formatter(0, 1)).toEqual({ backgroundColor: '#ff0000' }); // 20
      expect(formatter(0, 2)).toBeUndefined(); // 30
    });

    it('matches the bottom N% of values (rounding the count up, minimum 1)', () => {
      const grid10: FormulaResult[][] = Array.from({ length: 10 }, (_, i) => [i + 1]);
      const rule = makeRule2({
        kind: 'bottom',
        rank: 25,
        percent: true,
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 9 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid10));
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#ff0000' }); // value 3
      expect(formatter(0, 3)).toBeUndefined(); // value 4
    });
  });

  describe('aboveAverage kind', () => {
    const grid: FormulaResult[][] = [[10], [20], [30]];

    it('matches values strictly greater than the range average', () => {
      const rule = makeRule2({
        kind: 'aboveAverage',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 2)).toEqual({ backgroundColor: '#ff0000' }); // 30
    });

    it('does not match the average itself or values below it', () => {
      const rule = makeRule2({
        kind: 'aboveAverage',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 1)).toBeUndefined(); // 20 (== average)
      expect(formatter(0, 0)).toBeUndefined(); // 10
    });
  });

  describe('belowAverage kind', () => {
    const grid: FormulaResult[][] = [[10], [20], [30]];

    it('matches values strictly less than the range average', () => {
      const rule = makeRule2({
        kind: 'belowAverage',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' }); // 10
    });

    it('does not match the average itself or values above it', () => {
      const rule = makeRule2({
        kind: 'belowAverage',
        range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
      });
      const formatter = createConditionalFormatter([rule], makeCfContext(grid));
      expect(formatter(0, 1)).toBeUndefined(); // 20 (== average)
      expect(formatter(0, 2)).toBeUndefined(); // 30
    });
  });

  describe('priority', () => {
    it('applies only the first matching rule, in priority order', () => {
      const grid: FormulaResult[][] = [[50]];
      const rules = [
        makeRule2({
          id: 'r1',
          priority: 2,
          operator: 'greaterThan',
          value1: '10',
          style: { backgroundColor: '#00ff00' },
        }),
        makeRule2({
          id: 'r2',
          priority: 1,
          operator: 'greaterThan',
          value1: '10',
          style: { backgroundColor: '#ff0000' },
        }),
      ];
      const formatter = createConditionalFormatter(rules, makeCfContext(grid));
      expect(formatter(0, 0)).toEqual({ backgroundColor: '#ff0000' });
    });
  });
});
