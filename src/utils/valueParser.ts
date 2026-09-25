import type { NumberFormat } from '../types/grid';
import { ymdToSerial, timeToFraction } from './dateSerial';

export interface ParsedInput {
  value: number | string | boolean;
  /** Format to auto-apply based on how the input looked. Omitted when no format should be applied. */
  formatHint?: { numberFormat: NumberFormat; pattern: string };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `1,234(.5)` style thousands-grouped numbers. */
function tryThousands(trimmed: string): ParsedInput | undefined {
  const m = trimmed.match(/^([+-]?)(\d{1,3}(?:,\d{3})+)(\.(\d+))?$/);
  if (!m) return undefined;
  const intPart = m[2].replace(/,/g, '');
  const decPart = m[4];
  const num = Number(m[1] + intPart + (decPart ? '.' + decPart : ''));
  const pattern = '#,##0' + (decPart ? '.' + '0'.repeat(decPart.length) : '');
  return { value: num, formatHint: { numberFormat: 'number', pattern } };
}

/** `10%`, `1,234.5%` style percentages. A digit part is required. */
function tryPercent(trimmed: string): ParsedInput | undefined {
  const m = trimmed.match(/^([+-]?)((\d{1,3}(?:,\d{3})+)|(\d+))?(\.(\d+))?%$/);
  if (!m || !/\d/.test(trimmed)) return undefined;
  const intPart = (m[3] || m[4] || '').replace(/,/g, '');
  const decPart = m[6];
  const num = Number(m[1] + intPart + (decPart ? '.' + decPart : '')) / 100;
  const pattern = decPart ? '0.' + '0'.repeat(decPart.length) + '%' : '0%';
  return { value: num, formatHint: { numberFormat: 'percent', pattern } };
}

const CURRENCY_SYMBOLS = ['¥', '￥', '$', '€', '£'];

/** `¥1,000`, `-$100`, `$-100`, `1000円` style currency amounts. */
function tryCurrency(trimmed: string): ParsedInput | undefined {
  for (const sym of CURRENCY_SYMBOLS) {
    const re = new RegExp(
      `^([+-]?)${escapeRegExp(sym)}\\s*([+-]?)(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.(\\d+))?$`,
    );
    const m = trimmed.match(re);
    if (!m) continue;
    const sign = m[1] || m[2] || '';
    const intPart = m[3].replace(/,/g, '');
    const decPart = m[5];
    const num = Number(sign + intPart + (decPart ? '.' + decPart : ''));
    const normSym = sym === '￥' ? '¥' : sym;
    const pattern = `"${normSym}"#,##0` + (decPart ? '.' + '0'.repeat(decPart.length) : '');
    return { value: num, formatHint: { numberFormat: 'currency', pattern } };
  }
  const m2 = trimmed.match(/^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.(\d+))?円$/);
  if (m2) {
    const intPart = m2[2].replace(/,/g, '');
    const decPart = m2[4];
    const num = Number(m2[1] + intPart + (decPart ? '.' + decPart : ''));
    const pattern = '#,##0' + (decPart ? '.' + '0'.repeat(decPart.length) : '') + '"円"';
    return { value: num, formatHint: { numberFormat: 'currency', pattern } };
  }
  return undefined;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

const DATE_VARIANTS: { re: RegExp; hint: string }[] = [
  { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, hint: 'yyyy/mm/dd' },
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, hint: 'yyyy-mm-dd' },
  { re: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, hint: 'yyyy/mm/dd' },
  { re: /^(\d{4})年(\d{1,2})月(\d{1,2})日$/, hint: 'yyyy"年"m"月"d"日"' },
];
const DATE_TIME_TAIL_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** `yyyy/m/d`, `yyyy-m-d`, `yyyy.m.d`, `yyyy年m月d日`, optionally followed by a time, and bare `m/d`. */
function tryDate(trimmed: string): ParsedInput | undefined {
  for (const variant of DATE_VARIANTS) {
    const dateOnlySource = variant.re.source.slice(1, -1);
    const dateOnlyMatch = trimmed.match(variant.re);
    if (dateOnlyMatch) {
      const y = Number(dateOnlyMatch[1]);
      const mo = Number(dateOnlyMatch[2]);
      const d = Number(dateOnlyMatch[3]);
      if (!isValidYmd(y, mo, d)) return undefined;
      return {
        value: ymdToSerial(y, mo, d),
        formatHint: { numberFormat: 'date', pattern: variant.hint },
      };
    }
    const withTimeMatch = trimmed.match(new RegExp('^' + dateOnlySource + '\\s+(.+)$'));
    if (withTimeMatch) {
      const y = Number(withTimeMatch[1]);
      const mo = Number(withTimeMatch[2]);
      const d = Number(withTimeMatch[3]);
      const timeMatch = withTimeMatch[4].match(DATE_TIME_TAIL_RE);
      if (!timeMatch) continue;
      const h = Number(timeMatch[1]);
      const mi = Number(timeMatch[2]);
      const s = timeMatch[3] !== undefined ? Number(timeMatch[3]) : 0;
      if (!isValidYmd(y, mo, d)) return undefined;
      if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return undefined;
      const serial = ymdToSerial(y, mo, d) + timeToFraction(h, mi, s);
      const timeHint = timeMatch[3] !== undefined ? 'h:mm:ss' : 'h:mm';
      return {
        value: serial,
        formatHint: { numberFormat: 'datetime', pattern: variant.hint + ' ' + timeHint },
      };
    }
  }

  const md = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) {
    const mo = Number(md[1]);
    const d = Number(md[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    const year = new Date().getFullYear();
    if (!isValidYmd(year, mo, d)) return undefined;
    return {
      value: ymdToSerial(year, mo, d),
      formatHint: { numberFormat: 'date', pattern: 'm/d' },
    };
  }

  return undefined;
}

/** `h:mm`, `h:mm:ss`, optionally followed by ` AM`/` PM`. */
function tryTime(trimmed: string): ParsedInput | undefined {
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+(AM|PM))?$/i);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] !== undefined ? Number(m[3]) : 0;
  const ampm = m[4];
  if (mi < 0 || mi > 59 || s < 0 || s > 59) return undefined;
  let hour24: number;
  if (ampm) {
    if (h < 1 || h > 12) return undefined;
    hour24 = h % 12;
    if (/pm/i.test(ampm)) hour24 += 12;
  } else {
    if (h < 0 || h > 23) return undefined;
    hour24 = h;
  }
  const base = m[3] !== undefined ? 'h:mm:ss' : 'h:mm';
  const pattern = ampm ? base + ' AM/PM' : base;
  return { value: timeToFraction(hour24, mi, s), formatHint: { numberFormat: 'time', pattern } };
}

export function parseUserInput(raw: string): ParsedInput {
  if (raw === '') return { value: '' };
  if (raw.startsWith("'")) return { value: raw.slice(1) };

  // Full-width ASCII (１２３, ％, －, ，) is treated like its half-width form, as Japanese IMEs often produce it
  const trimmed = raw
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .trim();

  if (/^(true|false)$/i.test(trimmed)) {
    return { value: trimmed.toLowerCase() === 'true' };
  }

  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return { value: Number(trimmed) };
  }

  const thousands = tryThousands(trimmed);
  if (thousands) return thousands;

  const percent = tryPercent(trimmed);
  if (percent) return percent;

  const currency = tryCurrency(trimmed);
  if (currency) return currency;

  const date = tryDate(trimmed);
  if (date) return date;

  const time = tryTime(trimmed);
  if (time) return time;

  return { value: raw };
}
