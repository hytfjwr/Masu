/** The function call the caret is inside of, and which of its arguments is being typed. */
export interface FunctionCallContext {
  /** Upper-cased function name, e.g. "VLOOKUP" or "STDEV.S". */
  name: string;
  /** 0-based index of the argument under the caret (commas seen at this call's depth). */
  argIndex: number;
}

interface Frame {
  name: string | null;
  argIndex: number;
}

const NAME_CHAR = /[A-Za-z0-9_.]/;

/**
 * Find the innermost *named* function call enclosing `caret` in a formula (text starting with "=").
 * Lexical scan up to the caret: string literals ("" escapes) are skipped, grouping parentheses and
 * array literals ({1,2;3,4}) are tracked so their commas aren't counted as argument separators.
 */
export function getFunctionCallContext(formula: string, caret: number): FunctionCallContext | null {
  if (!formula.startsWith('=')) return null;
  const end = Math.min(Math.max(caret, 0), formula.length);
  const stack: Frame[] = [];
  let inString = false;

  for (let i = 1; i < end; i++) {
    const ch = formula[i];
    if (inString) {
      if (ch === '"') {
        if (formula[i + 1] === '"' && i + 1 < end) i++; // escaped quote
        else inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '(') {
      let j = i - 1;
      while (j >= 1 && NAME_CHAR.test(formula[j])) j--;
      const name = formula.slice(j + 1, i);
      // A bare cell-ish token before "(" isn't a function name unless it starts with a letter
      stack.push({ name: /^[A-Za-z_]/.test(name) ? name.toUpperCase() : null, argIndex: 0 });
    } else if (ch === '{') {
      stack.push({ name: null, argIndex: 0 });
    } else if (ch === ')' || ch === '}') {
      stack.pop();
    } else if (ch === ',' && stack.length > 0) {
      stack[stack.length - 1].argIndex++;
    }
  }

  // (A caret inside a string literal still belongs to the enclosing call's current argument.)
  for (let k = stack.length - 1; k >= 0; k--) {
    const frame = stack[k];
    if (frame.name) return { name: frame.name, argIndex: frame.argIndex };
  }
  return null;
}
