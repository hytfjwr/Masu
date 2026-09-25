/**
 * Data validation evaluation engine.
 */

import type { ValidationOperator, ValidationRule } from '../types/grid';
import type { FormulaResult } from '../engine/types';
import { isFormulaError } from '../engine/types';
import { toBoolean } from '../engine/coerce';
import { parseUserInput } from './valueParser';
import { shiftFormula } from './formulaShift';
import { serialToParts } from './dateSerial';
import type { MessageKey } from '../i18n';
import { t } from '../i18n';

export interface ValidationContext {
  /** Row-major values of a range string ('A1:A10' / 'Sheet2!A1:A10'). null if it can't be resolved. */
  resolveRangeValues?: (range: string) => FormulaResult[] | null;
  /** Evaluate a customFormula (without leading '=') as if positioned at cell (col, row). */
  evaluateFormulaAt?: (formula: string, col: number, row: number) => FormulaResult;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

function formulaResultToString(v: FormulaResult): string {
  if (isFormulaError(v)) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/** Dropdown options for the 'list' type: deduplicated, empties excluded, original order preserved. */
export function getListOptions(rule: ValidationRule, ctx: ValidationContext): string[] {
  const raw = rule.listSource
    ? (ctx.resolveRangeValues?.(rule.listSource) ?? []).map(formulaResultToString)
    : (rule.listValues ?? []);

  const seen = new Set<string>();
  const options: string[] = [];
  for (const v of raw) {
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    options.push(v);
  }
  return options;
}

/** Compare `value` against a min/max threshold pair using a ValidationOperator. */
function compareThreshold(
  value: number,
  min: number | undefined,
  max: number | undefined,
  operator: ValidationOperator,
): boolean {
  const lo = min ?? 0;
  const hi = max ?? 0;
  switch (operator) {
    case 'between':
      return value >= lo && value <= hi;
    case 'notBetween':
      return value < lo || value > hi;
    case 'equal':
      return value === lo;
    case 'notEqual':
      return value !== lo;
    case 'greaterThan':
      return value > lo;
    case 'greaterThanOrEqual':
      return value >= lo;
    case 'lessThan':
      return value < lo;
    case 'lessThanOrEqual':
      return value <= lo;
  }
}

/** Whether a raw input string satisfies a validation rule. Empty input is always valid. */
export function validateInput(
  rule: ValidationRule,
  rawValue: string,
  pos: { col: number; row: number },
  ctx: ValidationContext,
): ValidationResult {
  if (rawValue === '') return { valid: true };

  const invalid = (): ValidationResult => ({
    valid: false,
    message: rule.errorMessage || describeRule(rule, ctx),
  });

  switch (rule.type) {
    case 'list': {
      const lower = rawValue.toLowerCase();
      const options = getListOptions(rule, ctx);
      return options.some((o) => o.toLowerCase() === lower) ? { valid: true } : invalid();
    }
    case 'number': {
      const parsed = parseUserInput(rawValue).value;
      if (typeof parsed !== 'number') return invalid();
      return compareThreshold(parsed, rule.min, rule.max, rule.operator ?? 'between')
        ? { valid: true }
        : invalid();
    }
    case 'textLength': {
      const length = [...rawValue].length;
      return compareThreshold(length, rule.min, rule.max, rule.operator ?? 'between')
        ? { valid: true }
        : invalid();
    }
    case 'date': {
      const parsed = parseUserInput(rawValue).value;
      if (typeof parsed !== 'number') return invalid();
      const value = Math.floor(parsed);
      return compareThreshold(value, rule.dateMin, rule.dateMax, rule.operator ?? 'between')
        ? { valid: true }
        : invalid();
    }
    case 'checkbox': {
      const checked = (rule.checkedValue ?? 'TRUE').toLowerCase();
      const unchecked = (rule.uncheckedValue ?? 'FALSE').toLowerCase();
      const lower = rawValue.toLowerCase();
      return lower === checked || lower === unchecked ? { valid: true } : invalid();
    }
    case 'customFormula': {
      if (!ctx.evaluateFormulaAt || !rule.formula) return { valid: true };
      const f = rule.formula.startsWith('=') ? rule.formula.slice(1) : rule.formula;
      const shifted = rule.anchor
        ? shiftFormula(f, pos.col - rule.anchor.col, pos.row - rule.anchor.row)
        : f;
      const result = ctx.evaluateFormulaAt(shifted, pos.col, pos.row);
      if (isFormulaError(result)) return invalid();
      return toBoolean(result) === true ? { valid: true } : invalid();
    }
  }
}

/** The rawValue after toggling a checkbox cell (undefined/other values are treated as unchecked). */
export function toggleCheckboxValue(rule: ValidationRule, currentRaw: string): string {
  const checkedValue = rule.checkedValue ?? 'TRUE';
  const uncheckedValue = rule.uncheckedValue ?? 'FALSE';
  return currentRaw.toLowerCase() === checkedValue.toLowerCase() ? uncheckedValue : checkedValue;
}

/** Whether a checkbox cell's rawValue represents the checked state. */
export function isCheckboxChecked(rule: ValidationRule, currentRaw: string): boolean {
  const checkedValue = rule.checkedValue ?? 'TRUE';
  return currentRaw.toLowerCase() === checkedValue.toLowerCase();
}

function formatDateThreshold(serial: number): string {
  const { year, month, day } = serialToParts(serial);
  return `${year}/${month}/${day}`;
}

function describeThreshold(
  labelKey: MessageKey,
  min: number | undefined,
  max: number | undefined,
  operator: ValidationOperator,
  formatValue: (n: number) => string,
): string {
  const lo = formatValue(min ?? 0);
  const hi = formatValue(max ?? 0);
  const label = t(labelKey);
  switch (operator) {
    case 'between':
      return t('panels.validation.threshold.between', { lo, hi, label });
    case 'notBetween':
      return t('panels.validation.threshold.notBetween', { lo, hi, label });
    case 'equal':
      return t('panels.validation.threshold.equal', { lo, label });
    case 'notEqual':
      return t('panels.validation.threshold.notEqual', { lo, label });
    case 'greaterThan':
      return t('panels.validation.threshold.greaterThan', { lo, label });
    case 'greaterThanOrEqual':
      return t('panels.validation.threshold.greaterThanOrEqual', { lo, label });
    case 'lessThan':
      return t('panels.validation.threshold.lessThan', { lo, label });
    case 'lessThanOrEqual':
      return t('panels.validation.threshold.lessThanOrEqual', { lo, label });
  }
}

/** A human-readable description of the rule, used for the invalid-input tooltip when errorMessage is unset. */
export function describeRule(rule: ValidationRule, ctx: ValidationContext): string {
  switch (rule.type) {
    case 'list': {
      const options = getListOptions(rule, ctx);
      return t('panels.validation.list', { options: options.join(', ') });
    }
    case 'number':
      return describeThreshold(
        'panels.validation.label.number',
        rule.min,
        rule.max,
        rule.operator ?? 'between',
        String,
      );
    case 'textLength':
      return describeThreshold(
        'panels.validation.label.textLength',
        rule.min,
        rule.max,
        rule.operator ?? 'between',
        String,
      );
    case 'date':
      return describeThreshold(
        'panels.validation.label.date',
        rule.dateMin,
        rule.dateMax,
        rule.operator ?? 'between',
        formatDateThreshold,
      );
    case 'checkbox':
      return t('panels.validation.checkboxValue');
    case 'customFormula':
      return t('panels.validation.customFormulaInvalid');
  }
}
