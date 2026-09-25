/**
 * RFC 4180 compliant CSV parser using a state machine approach.
 */

const FIELD_START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
const QUOTE_IN_QUOTED = 3;
type State = typeof FIELD_START | typeof UNQUOTED | typeof QUOTED | typeof QUOTE_IN_QUOTED;

/**
 * Parse a CSV string into a 2D array of strings.
 * Handles:
 * - Double-quoted fields (containing commas, newlines, quotes)
 * - Escaped quotes ("" within quoted fields)
 * - Mixed line endings (CR, LF, CRLF)
 * - UTF-8 BOM (stripped if present)
 */
export function parseCSV(input: string): string[][] {
  if (!input || input.trim() === '') return [];

  // Strip UTF-8 BOM if present
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let state: State = FIELD_START;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];

    switch (state) {
      case FIELD_START:
        if (ch === '"') {
          state = QUOTED;
          currentField = '';
        } else if (ch === ',') {
          currentRow.push(currentField);
          currentField = '';
          // state stays FIELD_START
        } else if (ch === '\r') {
          // End of row
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          // Consume \n if CRLF
          if (i + 1 < len && text[i + 1] === '\n') i++;
          // state stays FIELD_START
        } else if (ch === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
        } else {
          currentField = ch;
          state = UNQUOTED;
        }
        break;

      case UNQUOTED:
        if (ch === ',') {
          currentRow.push(currentField);
          currentField = '';
          state = FIELD_START;
        } else if (ch === '\r') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          if (i + 1 < len && text[i + 1] === '\n') i++;
          state = FIELD_START;
        } else if (ch === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          state = FIELD_START;
        } else {
          currentField += ch;
        }
        break;

      case QUOTED:
        if (ch === '"') {
          state = QUOTE_IN_QUOTED;
        } else {
          currentField += ch;
        }
        break;

      case QUOTE_IN_QUOTED:
        if (ch === '"') {
          // Escaped quote
          currentField += '"';
          state = QUOTED;
        } else if (ch === ',') {
          currentRow.push(currentField);
          currentField = '';
          state = FIELD_START;
        } else if (ch === '\r') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          if (i + 1 < len && text[i + 1] === '\n') i++;
          state = FIELD_START;
        } else if (ch === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          state = FIELD_START;
        } else {
          // After closing quote, unexpected char - append it
          currentField += ch;
          state = UNQUOTED;
        }
        break;
    }
  }

  // Handle last field/row
  if (state === QUOTED) {
    // Unterminated quote - just close it
    currentRow.push(currentField);
  } else if (state === QUOTE_IN_QUOTED) {
    currentRow.push(currentField);
  } else {
    currentRow.push(currentField);
  }

  // Only add the last row if it has content (avoid trailing newline creating empty row)
  if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
    rows.push(currentRow);
  }

  return rows;
}
