import type { NumberFormat } from '../types/grid';
import { ymdToSerial, serialToParts } from './dateSerial';

export interface FormattedValue {
  text: string;
  color?: string;
}

/** Preset number format -> pattern string. */
export const PRESET_PATTERNS: Record<Exclude<NumberFormat, 'auto' | 'plainText' | 'custom'>, string> = {
  number: '#,##0.00',
  currency: '"¥"#,##0.00',
  percent: '0.00%',
  scientific: '0.00E+00',
  date: 'yyyy/mm/dd',
  time: 'h:mm:ss',
  datetime: 'yyyy/mm/dd h:mm:ss',
};

/** Resolve the effective pattern for a cell style. `numberFormatPattern` takes precedence. */
export function patternForStyle(
  style: { numberFormat?: NumberFormat; numberFormatPattern?: string } | undefined
): string | undefined {
  if (!style) return undefined;
  if (style.numberFormatPattern) return style.numberFormatPattern;
  const fmt = style.numberFormat;
  if (!fmt || fmt === 'auto' || fmt === 'plainText' || fmt === 'custom') return undefined;
  return PRESET_PATTERNS[fmt];
}

// ============================================================
// "General" (automatic) number display
// ============================================================

const COLOR_MAP: Record<string, string> = {
  red: '#d93025',
  blue: '#1a73e8',
  green: '#188038',
  black: 'black',
  white: 'white',
  yellow: 'yellow',
  magenta: 'magenta',
  cyan: 'cyan',
};
const COLOR_NAMES = new Set(Object.keys(COLOR_MAP));

/** Format `n` in scientific notation with up to 3 significant mantissa digits, trailing zeros stripped. */
function toExpFormat(n: number): string {
  const s = n.toExponential(2);
  const m = s.match(/^(-?\d(?:\.\d+)?)e([+-]\d+)$/);
  if (!m) return s.toUpperCase();
  let mantissa = m[1];
  if (mantissa.includes('.')) {
    mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '');
  }
  return `${mantissa}E${m[2]}`;
}

/** Google Sheets "Automatic" number display: up to 10 significant digits, exponential for extreme magnitudes. */
export function formatGeneral(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) {
    return toExpFormat(n);
  }
  if (Number.isInteger(n)) {
    return String(n);
  }
  const s = String(Number(n.toPrecision(10)));
  if (/e/i.test(s)) {
    return toExpFormat(n);
  }
  return s;
}

// ============================================================
// Pattern tokenizer
// ============================================================

type Token =
  | { t: 'lit'; v: string }
  | { t: 'digit'; c: '0' | '#' | '?' }
  | { t: 'comma' }
  | { t: 'dot' }
  | { t: 'percent' }
  | { t: 'exp'; sign: '+' | '-'; digits: number; lower: boolean }
  | { t: 'year'; len: number }
  | { t: 'monthOrMinute'; len: number }
  | { t: 'month'; len: number }
  | { t: 'minute'; len: number }
  | { t: 'day'; len: number }
  | { t: 'hour'; len: number }
  | { t: 'second'; len: number }
  | { t: 'secFrac'; len: number }
  | { t: 'ampm'; variant: 'AM/PM' | 'am/pm' | 'A/P' | 'a/p' }
  | { t: 'weekdayJp'; long: boolean }
  | { t: 'durH'; len: number }
  | { t: 'durM'; len: number }
  | { t: 'durS'; len: number };

const DATE_TOKEN_TYPES = new Set([
  'year', 'monthOrMinute', 'month', 'minute', 'day', 'hour', 'second', 'secFrac',
  'ampm', 'weekdayJp', 'durH', 'durM', 'durS',
]);

/** Split a full pattern into up to 4 `;`-separated sections, respecting quoted literals. */
function splitSections(pattern: string): string[] {
  const sections: string[] = [];
  let cur = '';
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i];
    if (c === '"') {
      const end = pattern.indexOf('"', i + 1);
      if (end === -1) { cur += pattern.slice(i); i = n; break; }
      cur += pattern.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (c === '\\' && i + 1 < n) {
      cur += pattern.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === ';') {
      sections.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  sections.push(cur);
  return sections.slice(0, 4);
}

/** Tokenize a single pattern section. Returns the tokens plus an optional section color. */
function tokenizeSection(section: string): { tokens: Token[]; color?: string } {
  const tokens: Token[] = [];
  let color: string | undefined;
  let i = 0;
  const n = section.length;
  while (i < n) {
    const c = section[i];
    if (c === '"') {
      const end = section.indexOf('"', i + 1);
      const content = end === -1 ? section.slice(i + 1) : section.slice(i + 1, end);
      if (content) tokens.push({ t: 'lit', v: content });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '\\') {
      if (i + 1 < n) tokens.push({ t: 'lit', v: section[i + 1] });
      i += 2;
      continue;
    }
    if (c === '[') {
      const end = section.indexOf(']', i + 1);
      const content = end === -1 ? '' : section.slice(i + 1, end);
      const lower = content.toLowerCase();
      if (!color && COLOR_NAMES.has(lower)) {
        color = COLOR_MAP[lower];
      } else if (/^h+$/i.test(content)) {
        tokens.push({ t: 'durH', len: content.length });
      } else if (/^m+$/i.test(content)) {
        tokens.push({ t: 'durM', len: content.length });
      } else if (/^s+$/i.test(content)) {
        tokens.push({ t: 'durS', len: content.length });
      }
      // otherwise: a condition tag such as [>100] — skipped
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '_') {
      tokens.push({ t: 'lit', v: ' ' });
      i += 2;
      continue;
    }
    if (c === '*') {
      i += 2;
      continue;
    }
    if (/^AM\/PM/i.test(section.slice(i, i + 5))) {
      const matched = section.slice(i, i + 5);
      tokens.push({ t: 'ampm', variant: matched === matched.toUpperCase() ? 'AM/PM' : 'am/pm' });
      i += 5;
      continue;
    }
    if (/^A\/P/i.test(section.slice(i, i + 3))) {
      const matched = section.slice(i, i + 3);
      tokens.push({ t: 'ampm', variant: matched === matched.toUpperCase() ? 'A/P' : 'a/p' });
      i += 3;
      continue;
    }
    if (section.slice(i, i + 4) === 'aaaa') {
      tokens.push({ t: 'weekdayJp', long: true });
      i += 4;
      continue;
    }
    if (section.slice(i, i + 3) === 'aaa') {
      tokens.push({ t: 'weekdayJp', long: false });
      i += 3;
      continue;
    }
    if (c === 'y' || c === 'Y') {
      let j = i;
      while (j < n && (section[j] === 'y' || section[j] === 'Y')) j++;
      tokens.push({ t: 'year', len: j - i });
      i = j;
      continue;
    }
    if (c === 'm' || c === 'M') {
      let j = i;
      while (j < n && (section[j] === 'm' || section[j] === 'M')) j++;
      tokens.push({ t: 'monthOrMinute', len: j - i });
      i = j;
      continue;
    }
    if (c === 'd' || c === 'D') {
      let j = i;
      while (j < n && (section[j] === 'd' || section[j] === 'D')) j++;
      tokens.push({ t: 'day', len: j - i });
      i = j;
      continue;
    }
    if (c === 'h' || c === 'H') {
      let j = i;
      while (j < n && (section[j] === 'h' || section[j] === 'H')) j++;
      tokens.push({ t: 'hour', len: j - i });
      i = j;
      continue;
    }
    if (c === 's' || c === 'S') {
      let j = i;
      while (j < n && (section[j] === 's' || section[j] === 'S')) j++;
      const len = j - i;
      tokens.push({ t: 'second', len });
      if (section[j] === '.' && section[j + 1] === '0') {
        let k = j + 1;
        while (k < n && section[k] === '0') k++;
        tokens.push({ t: 'secFrac', len: k - (j + 1) });
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    if (c === 'E' || c === 'e') {
      const m = section.slice(i).match(/^[Ee]([+-])(0+)/);
      if (m) {
        tokens.push({ t: 'exp', sign: m[1] as '+' | '-', digits: m[2].length, lower: c === 'e' });
        i += m[0].length;
        continue;
      }
      tokens.push({ t: 'lit', v: c });
      i += 1;
      continue;
    }
    if (c === '0' || c === '#' || c === '?') {
      tokens.push({ t: 'digit', c });
      i += 1;
      continue;
    }
    if (c === ',') {
      tokens.push({ t: 'comma' });
      i += 1;
      continue;
    }
    if (c === '.') {
      tokens.push({ t: 'dot' });
      i += 1;
      continue;
    }
    if (c === '%') {
      tokens.push({ t: 'percent' });
      i += 1;
      continue;
    }
    // Anything else (spaces, symbols, kanji literals such as 年月日時分秒, etc.) passes through as-is.
    tokens.push({ t: 'lit', v: c });
    i += 1;
  }
  return { tokens, color };
}

/** Resolve ambiguous m/mm runs into month or minute based on neighboring h/s tokens. */
function resolveMonthMinute(tokens: Token[]): Token[] {
  return tokens.map((tok, i) => {
    if (tok.t !== 'monthOrMinute') return tok;
    let isMinute = false;
    for (let j = i - 1; j >= 0; j--) {
      if (tokens[j].t === 'lit') continue;
      isMinute = tokens[j].t === 'hour' || tokens[j].t === 'durH';
      break;
    }
    if (!isMinute) {
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].t === 'lit') continue;
        isMinute = tokens[j].t === 'second' || tokens[j].t === 'durS';
        break;
      }
    }
    return isMinute ? { t: 'minute', len: tok.len } : { t: 'month', len: tok.len };
  });
}

function isDateMode(tokens: Token[]): boolean {
  return tokens.some((t) => DATE_TOKEN_TYPES.has(t.t));
}

// ============================================================
// Date/time section rendering
// ============================================================

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_JP_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

function renderDateSection(tokens: Token[], value: number): string {
  const resolved = resolveMonthMinute(tokens);
  const hasAmPm = resolved.some((t) => t.t === 'ampm');
  const parts = serialToParts(value);
  let out = '';
  for (const tok of resolved) {
    switch (tok.t) {
      case 'lit':
        out += tok.v;
        break;
      case 'year':
        out += tok.len >= 3 ? String(parts.year).padStart(4, '0') : String(parts.year % 100).padStart(2, '0');
        break;
      case 'month':
        if (tok.len === 1) out += String(parts.month);
        else if (tok.len === 2) out += String(parts.month).padStart(2, '0');
        else if (tok.len === 3) out += MONTH_SHORT[parts.month - 1];
        else out += MONTH_LONG[parts.month - 1];
        break;
      case 'minute':
        out += tok.len === 1 ? String(parts.minute) : String(parts.minute).padStart(2, '0');
        break;
      case 'day':
        if (tok.len === 1) out += String(parts.day);
        else if (tok.len === 2) out += String(parts.day).padStart(2, '0');
        else if (tok.len === 3) out += WEEKDAY_SHORT[parts.weekday];
        else out += WEEKDAY_LONG[parts.weekday];
        break;
      case 'hour': {
        let h = parts.hour;
        if (hasAmPm) {
          h = h % 12;
          if (h === 0) h = 12;
        }
        out += tok.len === 1 ? String(h) : String(h).padStart(2, '0');
        break;
      }
      case 'second':
        out += tok.len === 1 ? String(parts.second) : String(parts.second).padStart(2, '0');
        break;
      case 'secFrac': {
        const factor = Math.pow(10, tok.len);
        const fracVal = Math.round((parts.millisecond / 1000) * factor);
        out += '.' + String(fracVal).padStart(tok.len, '0');
        break;
      }
      case 'ampm': {
        const pm = parts.hour >= 12;
        if (tok.variant === 'AM/PM') out += pm ? 'PM' : 'AM';
        else if (tok.variant === 'am/pm') out += pm ? 'pm' : 'am';
        else if (tok.variant === 'A/P') out += pm ? 'P' : 'A';
        else out += pm ? 'p' : 'a';
        break;
      }
      case 'weekdayJp': {
        const name = WEEKDAY_JP_SHORT[parts.weekday];
        out += tok.long ? name + '曜日' : name;
        break;
      }
      case 'durH': {
        const total = Math.floor(value * 24 + 1e-9);
        out += tok.len === 1 ? String(total) : String(total).padStart(tok.len, '0');
        break;
      }
      case 'durM': {
        const total = Math.floor(value * 1440 + 1e-9);
        out += tok.len === 1 ? String(total) : String(total).padStart(tok.len, '0');
        break;
      }
      case 'durS': {
        const total = Math.floor(value * 86400 + 1e-9);
        out += tok.len === 1 ? String(total) : String(total).padStart(tok.len, '0');
        break;
      }
      case 'comma':
        out += ',';
        break;
      case 'dot':
        out += '.';
        break;
      case 'percent':
        out += '%';
        break;
      default:
        break; // digit/exp/monthOrMinute never appear in a date section
    }
  }
  return out;
}

// ============================================================
// Numeric section rendering
// ============================================================

interface DigitInfo {
  idx: number;
  c: '0' | '#' | '?';
}

function roundHalfUp(absValue: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(absValue * factor + 1e-9) / factor;
}

function insertThousands(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function findExpToken(tokens: Token[]): Extract<Token, { t: 'exp' }> | undefined {
  for (const t of tokens) if (t.t === 'exp') return t;
  return undefined;
}

function renderNumericSection(tokens: Token[], absValue: number, forceNegative: boolean): string {
  const dotIndex = tokens.findIndex((t) => t.t === 'dot');
  const isIntRegion = (idx: number) => dotIndex === -1 || idx < dotIndex;
  const expTok = findExpToken(tokens);

  const allDigits: DigitInfo[] = [];
  tokens.forEach((t, idx) => { if (t.t === 'digit') allDigits.push({ idx, c: t.c }); });
  const intDigitTokens = allDigits.filter((d) => isIntRegion(d.idx));
  const decDigitTokens = allDigits.filter((d) => !isIntRegion(d.idx));

  const lastDigitIdx = allDigits.length > 0 ? allDigits[allDigits.length - 1].idx : -1;
  const commaIdxs: number[] = [];
  tokens.forEach((t, idx) => { if (t.t === 'comma') commaIdxs.push(idx); });
  const scaleCommaCount = commaIdxs.filter((idx) => idx > lastDigitIdx).length;
  const groupingEnabled = commaIdxs.some((idx) => idx <= lastDigitIdx);

  const percentCount = tokens.filter((t) => t.t === 'percent').length;
  const minIntDigits = intDigitTokens.filter((d) => d.c === '0' || d.c === '?').length;
  const decDigits = decDigitTokens.length;

  let scaledAbsValue = absValue / Math.pow(1000, scaleCommaCount);
  scaledAbsValue *= Math.pow(100, percentCount);

  let intPart: string;
  let decPart: string;
  let expSignStr = '';
  let expDigitsStr = '';

  if (expTok) {
    const mantissaIntDigits = intDigitTokens.length || 1;
    let expValue = 0;
    let mantissa = 0;
    if (scaledAbsValue !== 0) {
      expValue = Math.floor(Math.log10(scaledAbsValue)) - (mantissaIntDigits - 1);
      const m = scaledAbsValue / Math.pow(10, expValue);
      let mRounded = Number(m.toFixed(decDigits));
      if (mRounded >= Math.pow(10, mantissaIntDigits)) {
        mRounded = mRounded / 10;
        expValue += 1;
      }
      mantissa = mRounded;
    }
    const mantissaStr = mantissa.toFixed(decDigits);
    const dotPos = mantissaStr.indexOf('.');
    intPart = (dotPos === -1 ? mantissaStr : mantissaStr.slice(0, dotPos)).padStart(mantissaIntDigits, '0');
    decPart = dotPos === -1 ? '' : mantissaStr.slice(dotPos + 1);
    const expSignChar = expValue < 0 ? '-' : expTok.sign === '+' ? '+' : '';
    expSignStr = expSignChar;
    expDigitsStr = String(Math.abs(expValue)).padStart(expTok.digits, '0');
  } else {
    const rounded = roundHalfUp(scaledAbsValue, decDigits);
    const fixedStr = rounded.toFixed(decDigits);
    const dotPos = fixedStr.indexOf('.');
    intPart = dotPos === -1 ? fixedStr : fixedStr.slice(0, dotPos);
    decPart = dotPos === -1 ? '' : fixedStr.slice(dotPos + 1);
    if (intPart.length < minIntDigits) intPart = intPart.padStart(minIntDigits, '0');
    if (minIntDigits === 0 && intPart === '0') intPart = '';
    for (let k = decDigitTokens.length - 1; k >= 0; k--) {
      if (decDigitTokens[k].c === '#' && decPart[k] === '0' && decPart.length === k + 1) {
        decPart = decPart.slice(0, k);
      } else if (decDigitTokens[k].c === '?' && decPart[k] === '0') {
        decPart = decPart.slice(0, k) + ' ' + decPart.slice(k + 1);
      } else {
        break;
      }
    }
    if (groupingEnabled) intPart = insertThousands(intPart);
  }

  let out = '';
  let intEmitted = false;
  let decEmitted = false;
  tokens.forEach((tok, idx) => {
    switch (tok.t) {
      case 'lit':
        out += tok.v;
        break;
      case 'digit':
        if (isIntRegion(idx)) {
          if (!intEmitted) { out += intPart; intEmitted = true; }
        } else if (!decEmitted) {
          if (decPart.length > 0) out += '.' + decPart;
          decEmitted = true;
        }
        break;
      case 'percent':
        out += '%';
        break;
      case 'exp':
        out += (tok.lower ? 'e' : 'E') + expSignStr + expDigitsStr;
        break;
      default:
        break; // comma/dot are already folded into intPart/decPart
    }
  });
  return forceNegative ? '-' + out : out;
}

// ============================================================
// Text section rendering (4th section, and plain string values)
// ============================================================

function renderTextSection(section: string, value: string): FormattedValue {
  let out = '';
  let color: string | undefined;
  let i = 0;
  const n = section.length;
  while (i < n) {
    const c = section[i];
    if (c === '"') {
      const end = section.indexOf('"', i + 1);
      out += end === -1 ? section.slice(i + 1) : section.slice(i + 1, end);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '\\') {
      if (i + 1 < n) out += section[i + 1];
      i += 2;
      continue;
    }
    if (c === '[') {
      const end = section.indexOf(']', i + 1);
      const content = end === -1 ? '' : section.slice(i + 1, end);
      const lower = content.toLowerCase();
      if (!color && COLOR_NAMES.has(lower)) color = COLOR_MAP[lower];
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '@') {
      out += value;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return color ? { text: out, color } : { text: out };
}

// ============================================================
// formatWithPattern
// ============================================================

export function formatWithPattern(value: number | string | boolean, pattern: string): FormattedValue {
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };

  const trimmedPattern = pattern.trim();
  if (trimmedPattern === '@') return { text: String(value) };
  if (/^general$/i.test(trimmedPattern)) {
    return { text: typeof value === 'number' ? formatGeneral(value) : String(value) };
  }

  const sections = splitSections(pattern);

  if (typeof value === 'string') {
    if (sections.length >= 4) return renderTextSection(sections[3], value);
    return { text: value };
  }

  let sectionIndex: number;
  let forceNegative = false;
  if (value < 0) {
    if (sections.length >= 2) {
      sectionIndex = 1;
    } else {
      sectionIndex = 0;
      forceNegative = true;
    }
  } else if (value === 0 && sections.length >= 3) {
    sectionIndex = 2;
  } else {
    sectionIndex = 0;
  }
  const rawSection = sections[sectionIndex];

  // Fractions (`# ?/?`) are unsupported — fall back to the automatic display.
  if (/\?\s*\/\s*\?/.test(rawSection)) {
    return { text: formatGeneral(value) };
  }

  const { tokens, color } = tokenizeSection(rawSection);

  const text = isDateMode(tokens)
    ? renderDateSection(tokens, value)
    : renderNumericSection(tokens, Math.abs(value), forceNegative);

  return color ? { text, color } : { text };
}

// ============================================================
// formatDisplayValue (compat API)
// ============================================================

export function formatDisplayValue(displayValue: string, format: NumberFormat, pattern?: string): string {
  if (displayValue === '') return '';

  let pat = pattern;
  if (!pat) {
    if (format === 'auto' || format === 'plainText' || format === 'custom') return displayValue;
    pat = PRESET_PATTERNS[format];
  }

  const trimmed = displayValue.trim();
  const num = Number(trimmed);
  if (trimmed !== '' && Number.isFinite(num)) {
    return formatWithPattern(num, pat).text;
  }

  if (/[ymdhs]/i.test(pat)) {
    const m = displayValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      const serial = ymdToSerial(Number(m[1]), Number(m[2]), Number(m[3]));
      return formatWithPattern(serial, pat).text;
    }
  }

  return displayValue;
}

// ============================================================
// adjustDecimals
// ============================================================

function autoDecimalDigits(value: number): number {
  if (Number.isInteger(value)) return 0;
  const s = formatGeneral(value);
  const dotIdx = s.indexOf('.');
  if (dotIdx === -1) return 0;
  const eIdx = s.search(/e/i);
  const decPart = eIdx === -1 ? s.slice(dotIdx + 1) : s.slice(dotIdx + 1, eIdx);
  return decPart.length;
}

function adjustSectionDecimals(section: string, delta: 1 | -1): string {
  const m = section.match(/\.(0+)/);
  const baseCount = m ? m[1].length : 0;
  const next = Math.max(0, Math.min(10, baseCount + delta));
  if (next === baseCount) return section;
  if (m && m.index !== undefined) {
    const replacement = next > 0 ? '.' + '0'.repeat(next) : '';
    return section.slice(0, m.index) + replacement + section.slice(m.index + m[0].length);
  }
  if (next === 0) return section;
  let insertAt = -1;
  for (let i = section.length - 1; i >= 0; i--) {
    if (section[i] === '0' || section[i] === '#' || section[i] === '?') {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === -1) return section;
  return section.slice(0, insertAt) + '.' + '0'.repeat(next) + section.slice(insertAt);
}

export function adjustDecimals(pattern: string | undefined, delta: 1 | -1, value?: number): string {
  if (pattern === undefined) {
    const base = value === undefined ? 0 : Number.isInteger(value) ? 0 : autoDecimalDigits(value);
    const next = Math.max(0, Math.min(10, base + delta));
    return next > 0 ? `#,##0.${'0'.repeat(next)}` : '#,##0';
  }
  return splitSections(pattern)
    .map((section) => adjustSectionDecimals(section, delta))
    .join(';');
}
