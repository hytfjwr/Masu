/**
 * Conditional format evaluation engine.
 */

import type { CellStyle, ColorScalePoint, ConditionalFormatRule, ConditionalRuleKind } from '../types/grid';
import type { FormulaResult, FormulaValue } from '../engine/types';
import { isFormulaError } from '../engine/types';
import { toBoolean } from '../engine/coerce';
import { clamp } from './coordinates';
import { shiftFormula } from './formulaShift';

/**
 * Evaluate whether a cell value matches a conditional format rule.
 */
export function evaluateCondition(cellValue: string, rule: ConditionalFormatRule): boolean {
  if (!rule.enabled) return false;

  const { operator, value1, value2 } = rule;

  switch (operator) {
    case 'greaterThan': {
      const num = Number(cellValue);
      const cmp = Number(value1);
      if (cellValue === '' || isNaN(num) || isNaN(cmp)) return false;
      return num > cmp;
    }
    case 'lessThan': {
      const num = Number(cellValue);
      const cmp = Number(value1);
      if (cellValue === '' || isNaN(num) || isNaN(cmp)) return false;
      return num < cmp;
    }
    case 'greaterThanOrEqual': {
      const num = Number(cellValue);
      const cmp = Number(value1);
      if (cellValue === '' || isNaN(num) || isNaN(cmp)) return false;
      return num >= cmp;
    }
    case 'lessThanOrEqual': {
      const num = Number(cellValue);
      const cmp = Number(value1);
      if (cellValue === '' || isNaN(num) || isNaN(cmp)) return false;
      return num <= cmp;
    }
    case 'equal': {
      return cellValue.toLowerCase() === (value1 ?? '').toLowerCase();
    }
    case 'notEqual': {
      return cellValue.toLowerCase() !== (value1 ?? '').toLowerCase();
    }
    case 'between': {
      const num = Number(cellValue);
      const low = Number(value1);
      const high = Number(value2);
      if (cellValue === '' || isNaN(num) || isNaN(low) || isNaN(high)) return false;
      return num >= low && num <= high;
    }
    case 'notBetween': {
      const num = Number(cellValue);
      const low = Number(value1);
      const high = Number(value2);
      if (cellValue === '' || isNaN(num) || isNaN(low) || isNaN(high)) return false;
      return num < low || num > high;
    }
    case 'textContains': {
      return cellValue.toLowerCase().includes((value1 ?? '').toLowerCase());
    }
    case 'textNotContains': {
      return !cellValue.toLowerCase().includes((value1 ?? '').toLowerCase());
    }
    case 'isEmpty': {
      return cellValue === '';
    }
    case 'isNotEmpty': {
      return cellValue !== '';
    }
    case 'textStartsWith': {
      return cellValue.toLowerCase().startsWith((value1 ?? '').toLowerCase());
    }
    case 'textEndsWith': {
      return cellValue.toLowerCase().endsWith((value1 ?? '').toLowerCase());
    }
    case 'textEquals': {
      return cellValue.toLowerCase() === (value1 ?? '').toLowerCase();
    }
    default:
      return false;
  }
}

/**
 * Check if a cell position is within a rule's range.
 */
function isInRange(col: number, row: number, range: ConditionalFormatRule['range']): boolean {
  return col >= range.startCol && col <= range.endCol &&
         row >= range.startRow && row <= range.endRow;
}

/**
 * Get the conditional style for a cell based on all rules.
 * Returns the style from the highest priority matching rule, or null.
 */
export function getConditionalStyle(
  col: number,
  row: number,
  displayValue: string,
  rules: ConditionalFormatRule[],
): Partial<CellStyle> | null {
  // Filter to enabled rules that include this cell in their range
  const applicableRules = rules
    .filter(r => r.enabled && isInRange(col, row, r.range));

  if (applicableRules.length === 0) return null;

  // Sort by priority (lowest number = highest priority)
  applicableRules.sort((a, b) => a.priority - b.priority);

  // Return the first matching rule's style
  for (const rule of applicableRules) {
    if (evaluateCondition(displayValue, rule)) {
      return rule.style;
    }
  }

  return null;
}

// ============================================================
// v2: rule kinds (colorScale / duplicate / unique / top / bottom / aboveAverage / belowAverage / formula)
// ============================================================

export interface CfContext {
  /** The cell's typed value (empty cell is ''). */
  getValue: (col: number, row: number) => FormulaResult;
  /** Evaluate a formula (without leading '=') as if positioned at cell (col, row). */
  evaluateFormulaAt: (formula: string, col: number, row: number) => FormulaResult;
}

/** Stringify a non-error cell value for the 'value' kind's operator-based check. */
function valueToConditionText(v: FormulaValue): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/** Dedup key for the 'duplicate'/'unique' kinds: numbers by value, strings case-insensitively. */
function dupKey(v: FormulaResult): string {
  if (isFormulaError(v)) return `e:${v.code}`;
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v}`;
  return `s:${v.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linearly interpolate between two '#rrggbb' colors (t clamped to [0, 1]). */
function lerpColor(c1: string, c2: string, t: number): string {
  const tc = clamp(t, 0, 1);
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * tc, g1 + (g2 - g1) * tc, b1 + (b2 - b1) * tc);
}

/** PERCENTILE.INC-style linear-interpolation percentile (p in 0-100) over an ascending-sorted array. */
function percentileInc(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (upper >= sortedAsc.length) return sortedAsc[sortedAsc.length - 1];
  return sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * (rank - lower);
}

interface ColorScaleStats {
  sortedAsc: number[];
  min: number;
  max: number;
}

function resolveColorScalePoint(point: ColorScalePoint, stats: ColorScaleStats): number {
  switch (point.type) {
    case 'min': return stats.min;
    case 'max': return stats.max;
    case 'number': return point.value ?? 0;
    case 'percent': return stats.min + (stats.max - stats.min) * (point.value ?? 0) / 100;
    case 'percentile': return percentileInc(stats.sortedAsc, point.value ?? 0);
  }
}

/**
 * Build a (col, row) -> style lookup function from a list of conditional format rules.
 * Range statistics (min/max/average/rank/duplicate counts) are computed lazily on first
 * use per rule and cached for the lifetime of the returned function.
 */
export function createConditionalFormatter(
  rules: ConditionalFormatRule[],
  ctx: CfContext,
): (col: number, row: number) => Partial<CellStyle> | undefined {
  const enabledRules = rules.filter(r => r.enabled).sort((a, b) => a.priority - b.priority);

  const rangeValuesCache = new WeakMap<ConditionalFormatRule, FormulaResult[]>();
  const numericValuesCache = new WeakMap<ConditionalFormatRule, number[]>();
  const countsCache = new WeakMap<ConditionalFormatRule, Map<string, number>>();
  const colorScaleStatsCache = new WeakMap<ConditionalFormatRule, ColorScaleStats>();
  const averageCache = new WeakMap<ConditionalFormatRule, number | undefined>();
  const thresholdCache = new WeakMap<ConditionalFormatRule, number | undefined>();

  function getRangeValues(rule: ConditionalFormatRule): FormulaResult[] {
    const cached = rangeValuesCache.get(rule);
    if (cached) return cached;
    const values: FormulaResult[] = [];
    const { startCol, startRow, endCol, endRow } = rule.range;
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        values.push(ctx.getValue(col, row));
      }
    }
    rangeValuesCache.set(rule, values);
    return values;
  }

  function getNumericValues(rule: ConditionalFormatRule): number[] {
    const cached = numericValuesCache.get(rule);
    if (cached) return cached;
    const values = getRangeValues(rule).filter((v): v is number => typeof v === 'number');
    numericValuesCache.set(rule, values);
    return values;
  }

  function getCounts(rule: ConditionalFormatRule): Map<string, number> {
    const cached = countsCache.get(rule);
    if (cached) return cached;
    const counts = new Map<string, number>();
    for (const v of getRangeValues(rule)) {
      if (v === '') continue;
      const key = dupKey(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    countsCache.set(rule, counts);
    return counts;
  }

  function getColorScaleStats(rule: ConditionalFormatRule): ColorScaleStats {
    const cached = colorScaleStatsCache.get(rule);
    if (cached) return cached;
    const sortedAsc = getNumericValues(rule).slice().sort((a, b) => a - b);
    const stats: ColorScaleStats = {
      sortedAsc,
      min: sortedAsc.length ? sortedAsc[0] : 0,
      max: sortedAsc.length ? sortedAsc[sortedAsc.length - 1] : 0,
    };
    colorScaleStatsCache.set(rule, stats);
    return stats;
  }

  function getAverage(rule: ConditionalFormatRule): number | undefined {
    if (averageCache.has(rule)) return averageCache.get(rule);
    const nums = getNumericValues(rule);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
    averageCache.set(rule, avg);
    return avg;
  }

  function getTopBottomThreshold(rule: ConditionalFormatRule, kind: 'top' | 'bottom'): number | undefined {
    if (thresholdCache.has(rule)) return thresholdCache.get(rule);
    const nums = getNumericValues(rule);
    let threshold: number | undefined;
    if (nums.length > 0) {
      const sorted = nums.slice().sort((a, b) => (kind === 'top' ? b - a : a - b));
      const rawCount = rule.percent ? Math.ceil((sorted.length * (rule.rank ?? 0)) / 100) : (rule.rank ?? 0);
      const count = Math.max(1, rawCount);
      const idx = Math.min(count, sorted.length) - 1;
      threshold = sorted[idx];
    }
    thresholdCache.set(rule, threshold);
    return threshold;
  }

  function getColorScaleColor(rule: ConditionalFormatRule, v: number): string | undefined {
    const cs = rule.colorScale;
    if (!cs) return undefined;
    const stats = getColorScaleStats(rule);
    const lo = resolveColorScalePoint(cs.min, stats);
    const hi = resolveColorScalePoint(cs.max, stats);

    if (lo === hi) return cs.mid ? cs.mid.color : cs.min.color;

    if (cs.mid) {
      const mid = resolveColorScalePoint(cs.mid, stats);
      if (v <= mid) {
        const t = mid === lo ? 1 : (v - lo) / (mid - lo);
        return lerpColor(cs.min.color, cs.mid.color, t);
      }
      const t = hi === mid ? 1 : (v - mid) / (hi - mid);
      return lerpColor(cs.mid.color, cs.max.color, t);
    }

    return lerpColor(cs.min.color, cs.max.color, (v - lo) / (hi - lo));
  }

  return (col: number, row: number): Partial<CellStyle> | undefined => {
    for (const rule of enabledRules) {
      if (!isInRange(col, row, rule.range)) continue;
      const kind: ConditionalRuleKind = rule.kind ?? 'value';

      switch (kind) {
        case 'value': {
          const v = ctx.getValue(col, row);
          if (isFormulaError(v)) break;
          if (evaluateCondition(valueToConditionText(v), rule)) return rule.style;
          break;
        }
        case 'formula': {
          if (!rule.formula) break;
          const f = rule.formula.startsWith('=') ? rule.formula.slice(1) : rule.formula;
          const shifted = shiftFormula(f, col - rule.range.startCol, row - rule.range.startRow);
          const result = ctx.evaluateFormulaAt(shifted, col, row);
          if (isFormulaError(result)) break;
          if (toBoolean(result) === true) return rule.style;
          break;
        }
        case 'colorScale': {
          const v = ctx.getValue(col, row);
          if (typeof v !== 'number') break;
          const color = getColorScaleColor(rule, v);
          if (color !== undefined) return { backgroundColor: color };
          break;
        }
        case 'duplicate':
        case 'unique': {
          const v = ctx.getValue(col, row);
          if (v === '') break;
          const count = getCounts(rule).get(dupKey(v)) ?? 0;
          const isDuplicate = count > 1;
          if (kind === 'duplicate' ? isDuplicate : !isDuplicate) return rule.style;
          break;
        }
        case 'top':
        case 'bottom': {
          const v = ctx.getValue(col, row);
          if (typeof v !== 'number') break;
          const threshold = getTopBottomThreshold(rule, kind);
          if (threshold === undefined) break;
          if (kind === 'top' ? v >= threshold : v <= threshold) return rule.style;
          break;
        }
        case 'aboveAverage':
        case 'belowAverage': {
          const v = ctx.getValue(col, row);
          if (typeof v !== 'number') break;
          const avg = getAverage(rule);
          if (avg === undefined) break;
          if (kind === 'aboveAverage' ? v > avg : v < avg) return rule.style;
          break;
        }
      }
    }
    return undefined;
  };
}
