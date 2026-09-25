/**
 * HYPERLINK function implementation.
 */

import type { FormulaResult, FunctionArgValue, FunctionContext, FunctionMeta } from '../types';
import { isFormulaError, makeError } from '../types';
import { resolveString } from './helpers';

// ============================================================
// HYPERLINK
// ============================================================
const HYPERLINK: FunctionMeta = {
  name: 'HYPERLINK',
  signature: 'HYPERLINK(link_location, [friendly_name])',
  description: 'クリック可能なハイパーリンクを作成します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');

    const url = resolveString(args[0], ctx);
    if (isFormulaError(url)) return url;

    let label = url;
    if (args.length === 2) {
      const labelVal = resolveString(args[1], ctx);
      if (isFormulaError(labelVal)) return labelVal;
      label = labelVal;
    }

    // Set hyperlink metadata via context callback
    if (ctx.setHyperlinkMeta) {
      ctx.setHyperlinkMeta(url, label);
    }

    return label;
  },
};

export const linkFunctions: FunctionMeta[] = [HYPERLINK];
