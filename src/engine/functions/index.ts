import type { FunctionMeta } from '../types';
import { mathFunctions } from './math';
import { logicFunctions } from './logic';
import { textFunctions } from './text';
import { lookupFunctions } from './lookup';
import { dateFunctions } from './date';
import { arrayFunctions } from './array';
import { linkFunctions } from './link';
import { statsFunctions } from './stats';
import { infoFunctions } from './info';
import { financialFunctions } from './financial';

/** All built-in function metadata */
const ALL_FUNCTIONS: FunctionMeta[] = [
  ...mathFunctions,
  ...logicFunctions,
  ...textFunctions,
  ...lookupFunctions,
  ...dateFunctions,
  ...arrayFunctions,
  ...linkFunctions,
  ...statsFunctions,
  ...infoFunctions,
  ...financialFunctions,
];

/** Function registry: uppercase name -> FunctionMeta */
let registry: Map<string, FunctionMeta> | null = null;

export function getFunctionRegistry(): Map<string, FunctionMeta> {
  if (!registry) {
    registry = new Map();
    for (const fn of ALL_FUNCTIONS) {
      registry.set(fn.name, fn);
    }
  }
  return registry;
}

/** Get all function metadata (for autocomplete) */
export function getAllFunctionMetas(): FunctionMeta[] {
  return ALL_FUNCTIONS;
}
