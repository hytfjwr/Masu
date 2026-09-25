/**
 * Pure logic for the "Data cleanup" tools: remove duplicates, trim whitespace,
 * and split text to columns.
 */

export interface DedupeResult {
  /** Row indices (into the input `rows` array, in order) that should be kept. */
  keptRowIndices: number[];
  /** Number of rows identified as duplicates (and thus not in `keptRowIndices`). */
  duplicateCount: number;
}

/**
 * Find duplicate rows by comparing the display-string values of `checkCols` (column
 * indices into each row). The first occurrence of a given combination is kept;
 * later rows with the same combination (case-sensitive, exact match) are duplicates.
 */
export function findDuplicateRows(rows: string[][], checkCols: number[]): DedupeResult {
  const seen = new Set<string>();
  const keptRowIndices: number[] = [];
  let duplicateCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = checkCols.map((c) => row[c] ?? '').join('\u0000');
    if (seen.has(key)) {
      duplicateCount++;
    } else {
      seen.add(key);
      keptRowIndices.push(i);
    }
  }

  return { keptRowIndices, duplicateCount };
}

/** Trim leading/trailing whitespace and collapse internal whitespace runs to a single space. */
export function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Candidate delimiters tried (in this order) when auto-detecting, per the "first found" rule. */
const AUTO_DELIMITER_CANDIDATES = [',', ';', '.', ' '];

/**
 * Auto-detect a delimiter from a sample string: the earliest-occurring character
 * among comma / semicolon / period / space. Falls back to comma if none is found.
 */
export function detectDelimiter(sample: string): string {
  let bestIndex = -1;
  let best: string | undefined;
  for (const candidate of AUTO_DELIMITER_CANDIDATES) {
    const idx = sample.indexOf(candidate);
    if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
      bestIndex = idx;
      best = candidate;
    }
  }
  return best ?? ',';
}

/** Split `text` on a literal `delimiter`. An empty delimiter leaves the text unsplit. */
export function splitText(text: string, delimiter: string): string[] {
  if (delimiter === '') return [text];
  return text.split(delimiter);
}
