/**
 * Function category mapping for the Function Wizard.
 * Maps function names to categories and provides categorized function lists.
 */

import type { FunctionMeta } from '../engine/types';
import { mathFunctions } from '../engine/functions/math';
import { logicFunctions } from '../engine/functions/logic';
import { textFunctions } from '../engine/functions/text';
import { lookupFunctions } from '../engine/functions/lookup';
import { dateFunctions } from '../engine/functions/date';
import { arrayFunctions } from '../engine/functions/array';
import { linkFunctions } from '../engine/functions/link';
import { statsFunctions } from '../engine/functions/stats';
import { infoFunctions } from '../engine/functions/info';
import { financialFunctions } from '../engine/functions/financial';

/** Function category definition */
export interface FunctionCategory {
  id: string;
  label: string;
  functions: FunctionMeta[];
}

/** Statistical function names (split from math/lookup into their own category) */
const STAT_NAMES = new Set([
  'AVERAGE', 'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS',
  'AVERAGEIF', 'AVERAGEIFS', 'STDEV', 'VAR', 'LARGE',
  'SMALL', 'RANK', 'MEDIAN', 'MAX', 'MIN', 'MINIFS', 'MAXIFS', 'SUBTOTAL',
]);

/** All categories with Japanese labels */
const CATEGORIES: FunctionCategory[] = [
  { id: 'math', label: '数学', functions: mathFunctions.filter(f => !STAT_NAMES.has(f.name)) },
  { id: 'stat', label: '統計', functions: [
    ...mathFunctions.filter(f => STAT_NAMES.has(f.name)),
    ...lookupFunctions.filter(f => STAT_NAMES.has(f.name)),
    ...statsFunctions,
  ] },
  { id: 'financial', label: '財務', functions: financialFunctions },
  { id: 'logic', label: '論理', functions: logicFunctions },
  { id: 'text', label: 'テキスト', functions: textFunctions },
  { id: 'lookup', label: '検索', functions: lookupFunctions.filter(f => !STAT_NAMES.has(f.name)) },
  { id: 'date', label: '日付', functions: dateFunctions },
  { id: 'array', label: '配列', functions: arrayFunctions },
  { id: 'info', label: '情報', functions: infoFunctions },
  { id: 'link', label: 'リンク', functions: linkFunctions },
];

/**
 * Get all function categories with their functions.
 */
export function getCategorizedFunctions(): FunctionCategory[] {
  return CATEGORIES;
}

/**
 * Get the category label for a given function name.
 */
export function getCategoryForFunction(funcName: string): string | undefined {
  const upper = funcName.toUpperCase();
  for (const cat of CATEGORIES) {
    if (cat.functions.some((f) => f.name === upper)) {
      return cat.label;
    }
  }
  return undefined;
}

/**
 * Get all unique function names across all categories.
 */
export function getAllFunctionNames(): string[] {
  const names: string[] = [];
  for (const cat of CATEGORIES) {
    for (const fn of cat.functions) {
      names.push(fn.name);
    }
  }
  return names;
}
