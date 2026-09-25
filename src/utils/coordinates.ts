/**
 * Convert a 0-indexed column number to Excel-style column letters.
 * Uses bijective base-26: 0 -> "A", 25 -> "Z", 26 -> "AA", 701 -> "ZZ", 702 -> "AAA"
 */
export function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Convert Excel-style column letters to a 0-indexed column number.
 * "A" -> 0, "Z" -> 25, "AA" -> 26, "AZ" -> 51, "BA" -> 52
 */
export function colLetterToIndex(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Build a cell key from col/row indices (0-indexed).
 * e.g. (0, 0) -> "A1", (2, 4) -> "C5", (26, 0) -> "AA1"
 */
export function cellKey(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

/**
 * Parse a cell key into col/row indices (0-indexed).
 * e.g. "A1" -> { col: 0, row: 0 }, "C5" -> { col: 2, row: 4 }, "AA1" -> { col: 26, row: 0 }
 */
export function parseCellKey(key: string): { col: number; row: number } {
  const match = key.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return { col: 0, row: 0 };
  }
  return { col: colLetterToIndex(match[1]), row: parseInt(match[2], 10) - 1 };
}

/**
 * Clamp a value between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
