import { parseCellKey } from './coordinates';

export interface FormulaRef {
  ref: string;
  start: number; // position in the full formula string (including =)
  end: number;
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

const CELL_OR_RANGE_RE = /(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/g;

function stripDollar(s: string): string {
  return s.replace(/\$/g, '');
}

/**
 * Extract all cell/range references from a formula string with their positions.
 * Skips references inside string literals and function names.
 */
export function extractFormulaRefs(formula: string): FormulaRef[] {
  if (!formula.startsWith('=')) return [];

  const refs: FormulaRef[] = [];

  // Build a set of ranges that are inside string literals (to skip)
  const inString = new Set<number>();
  let inQuote = false;
  for (let i = 1; i < formula.length; i++) {
    if (formula[i] === '"' && !inQuote) {
      inQuote = true;
      inString.add(i);
    } else if (formula[i] === '"' && inQuote) {
      inString.add(i);
      inQuote = false;
    } else if (inQuote) {
      inString.add(i);
    }
  }

  CELL_OR_RANGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CELL_OR_RANGE_RE.exec(formula)) !== null) {
    const matchStart = match.index;

    // Skip if inside a string literal
    if (inString.has(matchStart)) continue;

    // Skip if this is a function name (followed by '(')
    let afterEnd = matchStart + match[0].length;
    while (afterEnd < formula.length && (formula[afterEnd] === ' ' || formula[afterEnd] === '\t')) {
      afterEnd++;
    }
    if (afterEnd < formula.length && formula[afterEnd] === '(') continue;

    // Skip if preceded by a letter (part of a longer identifier like Sheet1!)
    if (matchStart > 0 && /[\p{L}_!]/u.test(formula[matchStart - 1])) continue;

    const cellA = stripDollar(match[1]);
    const posA = parseCellKey(cellA);

    let posB = posA;
    if (match[2]) {
      posB = parseCellKey(stripDollar(match[2]));
    }

    refs.push({
      ref: match[0],
      start: matchStart,
      end: matchStart + match[0].length,
      startCol: Math.min(posA.col, posB.col),
      startRow: Math.min(posA.row, posB.row),
      endCol: Math.max(posA.col, posB.col),
      endRow: Math.max(posA.row, posB.row),
    });
  }

  return refs;
}
