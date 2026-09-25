/**
 * Fill Auto pattern recognition and value generation.
 */

/** Types of fill patterns */
export type FillPatternType =
  | 'copy'
  | 'arithmetic'
  | 'stringCycle'
  | 'trailingNumber'
  | 'date';

export interface FillPattern {
  type: FillPatternType;
  values: string[];
  /** Arithmetic difference (for 'arithmetic') */
  diff?: number;
  /** Date separator (for 'date': '/' or '-') */
  dateSeparator?: string;
  /** Date increment in ms (for 'date') */
  dateIncrementMs?: number;
  /** Base string (for 'trailingNumber') */
  basePrefix?: string;
  /** Starting number for trailing (for 'trailingNumber') */
  trailingStart?: number;
  /** Trailing number increment (for 'trailingNumber') */
  trailingDiff?: number;
}

const DATE_SLASH_REGEX = /^\d{4}\/\d{2}\/\d{2}$/;
const DATE_DASH_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_NUMBER_REGEX = /^(.*?)(\d+)$/;

function isDateString(s: string): boolean {
  return DATE_SLASH_REGEX.test(s) || DATE_DASH_REGEX.test(s);
}

function parseDateString(s: string): { date: Date; separator: string } | null {
  if (DATE_SLASH_REGEX.test(s)) {
    const [y, m, d] = s.split('/').map(Number);
    return { date: new Date(y, m - 1, d), separator: '/' };
  }
  if (DATE_DASH_REGEX.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return { date: new Date(y, m - 1, d), separator: '-' };
  }
  return null;
}

function formatDate(date: Date, separator: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${separator}${m}${separator}${d}`;
}

function parseTrailingNumber(s: string): { prefix: string; num: number } | null {
  const match = s.match(TRAILING_NUMBER_REGEX);
  if (!match || match[1] === '') return null;
  return { prefix: match[1], num: parseInt(match[2], 10) };
}

/**
 * Detect the fill pattern from a list of source values.
 */
export function detectFillPattern(values: string[]): FillPattern {
  if (values.length === 0) {
    return { type: 'copy', values: [] };
  }

  // Single value
  if (values.length === 1) {
    const val = values[0];

    // Single date -> increment by 1 day
    if (isDateString(val)) {
      const parsed = parseDateString(val)!;
      const oneDay = 24 * 60 * 60 * 1000;
      return {
        type: 'date',
        values,
        dateSeparator: parsed.separator,
        dateIncrementMs: oneDay,
      };
    }

    // Single number -> copy
    const num = Number(val);
    if (val !== '' && !isNaN(num)) {
      return { type: 'copy', values };
    }

    // Single string -> copy
    return { type: 'copy', values };
  }

  // Multiple values: check for dates
  if (values.every(isDateString)) {
    const parsed = values.map(v => parseDateString(v)!);
    const separator = parsed[0].separator;
    if (values.length >= 2) {
      const diff = parsed[1].date.getTime() - parsed[0].date.getTime();
      // Check that all diffs are equal
      let isConsistent = true;
      for (let i = 2; i < parsed.length; i++) {
        if (parsed[i].date.getTime() - parsed[i - 1].date.getTime() !== diff) {
          isConsistent = false;
          break;
        }
      }
      if (isConsistent && diff !== 0) {
        return {
          type: 'date',
          values,
          dateSeparator: separator,
          dateIncrementMs: diff,
        };
      }
    }
  }

  // Multiple values: check for arithmetic sequence
  const nums = values.map(Number);
  if (values.every(v => v !== '' && !isNaN(Number(v)))) {
    if (values.length >= 2) {
      const diff = nums[1] - nums[0];
      let isArithmetic = true;
      for (let i = 2; i < nums.length; i++) {
        if (Math.abs((nums[i] - nums[i - 1]) - diff) > 1e-10) {
          isArithmetic = false;
          break;
        }
      }
      if (isArithmetic) {
        return { type: 'arithmetic', values, diff };
      }
    }
  }

  // Multiple values: check trailing number pattern
  const trailings = values.map(parseTrailingNumber);
  if (trailings.every(t => t !== null)) {
    const prefix = trailings[0]!.prefix;
    if (trailings.every(t => t!.prefix === prefix) && values.length >= 2) {
      const numDiff = trailings[1]!.num - trailings[0]!.num;
      let isConsistent = true;
      for (let i = 2; i < trailings.length; i++) {
        if (trailings[i]!.num - trailings[i - 1]!.num !== numDiff) {
          isConsistent = false;
          break;
        }
      }
      if (isConsistent && numDiff !== 0) {
        return {
          type: 'trailingNumber',
          values,
          basePrefix: prefix,
          trailingStart: trailings[trailings.length - 1]!.num + numDiff,
          trailingDiff: numDiff,
        };
      }
    }
  }

  // Multiple string values: string cycle
  if (values.some(v => isNaN(Number(v)) || v === '')) {
    return { type: 'stringCycle', values };
  }

  // Fallback: copy
  return { type: 'copy', values };
}

/**
 * Generate fill values based on a detected pattern.
 */
export function generateFillValues(pattern: FillPattern, count: number): string[] {
  if (count <= 0 || pattern.values.length === 0) return [];

  const result: string[] = [];

  switch (pattern.type) {
    case 'copy': {
      for (let i = 0; i < count; i++) {
        result.push(pattern.values[pattern.values.length - 1]);
      }
      break;
    }

    case 'arithmetic': {
      const lastVal = Number(pattern.values[pattern.values.length - 1]);
      const diff = pattern.diff ?? 0;
      for (let i = 1; i <= count; i++) {
        const val = lastVal + diff * i;
        // Preserve integer formatting if original values were integers
        result.push(String(Math.round(val * 1e10) / 1e10));
      }
      break;
    }

    case 'stringCycle': {
      const vals = pattern.values;
      for (let i = 0; i < count; i++) {
        result.push(vals[i % vals.length]);
      }
      break;
    }

    case 'trailingNumber': {
      const prefix = pattern.basePrefix ?? '';
      let num = pattern.trailingStart ?? 1;
      const diff = pattern.trailingDiff ?? 1;
      for (let i = 0; i < count; i++) {
        result.push(`${prefix}${num}`);
        num += diff;
      }
      break;
    }

    case 'date': {
      const sep = pattern.dateSeparator ?? '/';
      const increment = pattern.dateIncrementMs ?? 86400000;
      const lastParsed = parseDateString(pattern.values[pattern.values.length - 1]);
      if (!lastParsed) {
        // Fallback to copy
        for (let i = 0; i < count; i++) {
          result.push(pattern.values[pattern.values.length - 1]);
        }
        break;
      }
      let currentTime = lastParsed.date.getTime();
      for (let i = 0; i < count; i++) {
        currentTime += increment;
        result.push(formatDate(new Date(currentTime), sep));
      }
      break;
    }

    default: {
      for (let i = 0; i < count; i++) {
        result.push(pattern.values[pattern.values.length - 1]);
      }
    }
  }

  return result;
}
