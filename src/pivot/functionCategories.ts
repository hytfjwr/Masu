/**
 * Function category mapping for the Function Wizard.
 * Maps function names to categories and provides categorized function lists.
 */

import type { FunctionMeta } from '../engine/types';
import { t, type MessageKey, type TFunction } from '../i18n';
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
  'AVERAGE',
  'COUNT',
  'COUNTA',
  'COUNTIF',
  'COUNTIFS',
  'AVERAGEIF',
  'AVERAGEIFS',
  'STDEV',
  'VAR',
  'LARGE',
  'SMALL',
  'RANK',
  'MEDIAN',
  'MAX',
  'MIN',
  'MINIFS',
  'MAXIFS',
  'SUBTOTAL',
]);

interface CategoryDef extends Omit<FunctionCategory, 'label'> {
  labelKey: MessageKey;
}

/** All categories; labels are translated when read */
const CATEGORIES: CategoryDef[] = [
  {
    id: 'math',
    labelKey: 'common.fnCategory.math',
    functions: mathFunctions.filter((f) => !STAT_NAMES.has(f.name)),
  },
  {
    id: 'stat',
    labelKey: 'common.fnCategory.stat',
    functions: [
      ...mathFunctions.filter((f) => STAT_NAMES.has(f.name)),
      ...lookupFunctions.filter((f) => STAT_NAMES.has(f.name)),
      ...statsFunctions,
    ],
  },
  { id: 'financial', labelKey: 'common.fnCategory.financial', functions: financialFunctions },
  { id: 'logic', labelKey: 'common.fnCategory.logic', functions: logicFunctions },
  { id: 'text', labelKey: 'common.fnCategory.text', functions: textFunctions },
  {
    id: 'lookup',
    labelKey: 'common.fnCategory.lookup',
    functions: lookupFunctions.filter((f) => !STAT_NAMES.has(f.name)),
  },
  { id: 'date', labelKey: 'common.fnCategory.date', functions: dateFunctions },
  { id: 'array', labelKey: 'common.fnCategory.array', functions: arrayFunctions },
  { id: 'info', labelKey: 'common.fnCategory.info', functions: infoFunctions },
  { id: 'link', labelKey: 'common.fnCategory.link', functions: linkFunctions },
];

/**
 * Get all function categories with their functions, labelled by `translate` (components pass
 * `useI18n().t` so a memoized list follows a language switch).
 */
export function getCategorizedFunctions(translate: TFunction = t): FunctionCategory[] {
  return CATEGORIES.map(({ labelKey, ...cat }) => ({ ...cat, label: translate(labelKey) }));
}

/**
 * Get the category label for a given function name.
 */
export function getCategoryForFunction(funcName: string): string | undefined {
  const upper = funcName.toUpperCase();
  for (const cat of CATEGORIES) {
    if (cat.functions.some((f) => f.name === upper)) {
      return t(cat.labelKey);
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
