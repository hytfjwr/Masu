import { shiftFormula, updateRefsForStructureChange } from './formulaShift';
import type { StructureChangeOptions } from './formulaShift';

/**
 * Adjust all cell references in a formula by a fixed column/row offset.
 * Used for fill-handle operations (drag to copy with relative reference adjustment).
 * Respects `$` absolute markers: `$A` won't shift columns, `$1` won't shift rows.
 *
 * @param formula - The raw formula string (without leading '=')
 * @param colOffset - Number of columns to shift (positive = right, negative = left)
 * @param rowOffset - Number of rows to shift (positive = down, negative = up)
 * @returns The adjusted formula string (references that go out of bounds become #REF!)
 */
export function adjustFormulaReferences(
  formula: string,
  colOffset: number,
  rowOffset: number,
): string {
  return shiftFormula(formula, colOffset, rowOffset);
}

/**
 * Toggle the absolute/relative state of a cell reference near the cursor position.
 * Cycles: A1 → $A$1 → A$1 → $A1 → A1 (same order as Excel F4).
 *
 * @param text - Full formula text (including leading '=')
 * @param cursorPos - Cursor position within the text
 * @returns Updated text and new cursor position, or null if no reference found at cursor
 */
export function toggleAbsoluteRef(
  text: string,
  cursorPos: number,
): { text: string; cursorPos: number } | null {
  const refPattern = /\$?[A-Za-z]+\$?\d+/g;
  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // Check if cursor is at or adjacent to this reference
    if (cursorPos >= start && cursorPos <= end) {
      const raw = match[0];
      const parsed = parseRefParts(raw);
      if (!parsed) return null;

      const cycled = cycleAbsolute(parsed);
      const newRef = formatRef(cycled);
      const newText = text.slice(0, start) + newRef + text.slice(end);
      // Keep cursor at the end of the replaced reference
      const newCursorPos = start + newRef.length;
      return { text: newText, cursorPos: newCursorPos };
    }
  }

  return null;
}

interface RefParts {
  colAbsolute: boolean;
  col: string;
  rowAbsolute: boolean;
  row: string;
}

function parseRefParts(raw: string): RefParts | null {
  const m = raw.match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
  if (!m) return null;
  return {
    colAbsolute: m[1] === '$',
    col: m[2].toUpperCase(),
    rowAbsolute: m[3] === '$',
    row: m[4],
  };
}

/** Cycle: relative → fully absolute → row absolute → col absolute → relative */
function cycleAbsolute(ref: RefParts): RefParts {
  if (!ref.colAbsolute && !ref.rowAbsolute) {
    // A1 → $A$1
    return { ...ref, colAbsolute: true, rowAbsolute: true };
  }
  if (ref.colAbsolute && ref.rowAbsolute) {
    // $A$1 → A$1
    return { ...ref, colAbsolute: false, rowAbsolute: true };
  }
  if (!ref.colAbsolute && ref.rowAbsolute) {
    // A$1 → $A1
    return { ...ref, colAbsolute: true, rowAbsolute: false };
  }
  // $A1 → A1
  return { ...ref, colAbsolute: false, rowAbsolute: false };
}

function formatRef(ref: RefParts): string {
  return `${ref.colAbsolute ? '$' : ''}${ref.col}${ref.rowAbsolute ? '$' : ''}${ref.row}`;
}

/**
 * Update cell references in a formula string when columns or rows are inserted or deleted.
 * Respects `$` absolute markers and preserves them in the output.
 *
 * For column operations:
 *   - insert: relative column references at or after `index` shift right by 1
 *   - delete: references to the deleted column become #REF!, references after shift left by 1
 *
 * For row operations:
 *   - insert: relative row references at or after `index` shift down by 1
 *   - delete: references to the deleted row become #REF!, references after shift up by 1
 *
 * @param formula - The raw formula string (without leading '=')
 * @param type - 'column' or 'row'
 * @param index - The 0-indexed column or 0-indexed row being inserted/deleted
 * @param operation - 'insert' or 'delete'
 * @returns The updated formula string, or null if a #REF! was introduced
 */
export function updateReferences(
  formula: string,
  type: 'column' | 'row',
  index: number,
  operation: 'insert' | 'delete',
  options?: StructureChangeOptions,
): { formula: string; hasRefError: boolean } {
  return updateRefsForStructureChange(formula, { type, index, operation }, options);
}
