import type {
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { resolveNumber, resolveScalar, resolveString, argToFlat } from './helpers';
import { toBoolean } from '../coerce';
import {
  ymdToSerial,
  serialToParts,
  timeToFraction,
  todaySerial,
  nowSerial,
} from '../../utils/dateSerial';
import { parseUserInput } from '../../utils/valueParser';

// ============================================================
// Date argument coercion
// ============================================================

/**
 * Coerce an already-resolved scalar value into a date serial number.
 * Numbers/booleans use the usual numeric coercion; strings are parsed with the
 * same rules as user cell input (so date/time-shaped text such as "2026/4/10"
 * resolves to its serial number, matching Excel's implicit argument coercion).
 */
function toSerial(v: FormulaResult): number | FormulaError {
  if (isFormulaError(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === '') return 0;
  const parsed = parseUserInput(v);
  if (typeof parsed.value === 'number') return parsed.value;
  return makeError('#VALUE!');
}

/** Resolve a function argument to a date serial number (see {@link toSerial}). */
function resolveSerial(arg: FunctionArgValue, ctx: FunctionContext): number | FormulaError {
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  return toSerial(val);
}

/** Number of days in `month` (1-12) of `year`. */
function daysInMonth(year: number, month: number): number {
  return ymdToSerial(year, month + 1, 1) - ymdToSerial(year, month, 1);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// ============================================================
// TODAY
// ============================================================
const TODAY: FunctionMeta = {
  name: 'TODAY',
  signature: 'TODAY()',
  description: 'Returns the current date as a serial number',
  volatile: true,
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return todaySerial();
  },
};

// ============================================================
// NOW
// ============================================================
const NOW: FunctionMeta = {
  name: 'NOW',
  signature: 'NOW()',
  description: 'Returns the current date and time as a serial number',
  volatile: true,
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 0) return makeError('#VALUE!');
    return nowSerial();
  },
};

// ============================================================
// DATE
// ============================================================
const DATE: FunctionMeta = {
  name: 'DATE',
  signature: 'DATE(year, month, day)',
  description: 'Returns the serial number for a given date',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const year = resolveNumber(args[0], ctx);
    if (isFormulaError(year)) return year;
    const month = resolveNumber(args[1], ctx);
    if (isFormulaError(month)) return month;
    const day = resolveNumber(args[2], ctx);
    if (isFormulaError(day)) return day;

    let y = Math.trunc(year);
    const m = Math.trunc(month);
    const d = Math.trunc(day);
    // Two-digit years (0-99) are treated as 1900-1999, as Excel also does.
    if (y >= 0 && y <= 99) y += 1900;

    const serial = ymdToSerial(y, m, d);
    if (serial < 1) return makeError('#NUM!');
    return serial;
  },
};

// ============================================================
// YEAR / MONTH / DAY
// ============================================================
const YEAR: FunctionMeta = {
  name: 'YEAR',
  signature: 'YEAR(serial_number)',
  description: 'Returns the year from a date serial number',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    if (serial < 1) return makeError('#NUM!');
    return serialToParts(serial).year;
  },
};

const MONTH: FunctionMeta = {
  name: 'MONTH',
  signature: 'MONTH(serial_number)',
  description: 'Returns the month (1-12) from a date serial number',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    if (serial < 1) return makeError('#NUM!');
    return serialToParts(serial).month;
  },
};

const DAY: FunctionMeta = {
  name: 'DAY',
  signature: 'DAY(serial_number)',
  description: 'Returns the day of the month (1-31) from a date serial number',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    if (serial < 1) return makeError('#NUM!');
    return serialToParts(serial).day;
  },
};

// ============================================================
// TIME / HOUR / MINUTE / SECOND
// ============================================================
const TIME: FunctionMeta = {
  name: 'TIME',
  signature: 'TIME(hour, minute, second)',
  description: '指定した時・分・秒から時刻のシリアル値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const h = resolveNumber(args[0], ctx);
    if (isFormulaError(h)) return h;
    const m = resolveNumber(args[1], ctx);
    if (isFormulaError(m)) return m;
    const s = resolveNumber(args[2], ctx);
    if (isFormulaError(s)) return s;

    const totalSeconds = Math.trunc(h) * 3600 + Math.trunc(m) * 60 + Math.trunc(s);
    if (totalSeconds < 0) return makeError('#NUM!');
    const wrapped = totalSeconds % 86400;
    const wh = Math.floor(wrapped / 3600);
    const wm = Math.floor((wrapped % 3600) / 60);
    const ws = wrapped % 60;
    return timeToFraction(wh, wm, ws);
  },
};

function partsOfSerialArg(
  arg: FunctionArgValue,
  ctx: FunctionContext,
): ReturnType<typeof serialToParts> | FormulaError {
  const serial = resolveSerial(arg, ctx);
  if (isFormulaError(serial)) return serial;
  if (serial < 0) return makeError('#NUM!');
  return serialToParts(serial);
}

const HOUR: FunctionMeta = {
  name: 'HOUR',
  signature: 'HOUR(serial_number)',
  description: 'シリアル値から時(0-23)を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const parts = partsOfSerialArg(args[0], ctx);
    if (isFormulaError(parts)) return parts;
    return parts.hour;
  },
};

const MINUTE: FunctionMeta = {
  name: 'MINUTE',
  signature: 'MINUTE(serial_number)',
  description: 'シリアル値から分(0-59)を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const parts = partsOfSerialArg(args[0], ctx);
    if (isFormulaError(parts)) return parts;
    return parts.minute;
  },
};

const SECOND: FunctionMeta = {
  name: 'SECOND',
  signature: 'SECOND(serial_number)',
  description: 'シリアル値から秒(0-59)を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const parts = partsOfSerialArg(args[0], ctx);
    if (isFormulaError(parts)) return parts;
    return parts.second;
  },
};

// ============================================================
// WEEKDAY / WEEKNUM / ISOWEEKNUM
// ============================================================
const WEEKDAY_START_DAY: Record<number, number> = {
  1: 0,
  17: 0,
  2: 1,
  11: 1,
  12: 2,
  13: 3,
  14: 4,
  15: 5,
  16: 6,
};

const WEEKDAY: FunctionMeta = {
  name: 'WEEKDAY',
  signature: 'WEEKDAY(serial_number, [return_type])',
  description: 'シリアル値から曜日を表す数値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;

    let type = 1;
    if (args.length >= 2 && args[1].kind !== 'omitted') {
      const t = resolveNumber(args[1], ctx);
      if (isFormulaError(t)) return t;
      type = Math.trunc(t);
    }

    const weekday = serialToParts(serial).weekday; // 0=Sun..6=Sat
    if (type === 3) return (weekday + 6) % 7;
    const startDay = WEEKDAY_START_DAY[type];
    if (startDay === undefined) return makeError('#NUM!');
    return ((weekday - startDay + 7) % 7) + 1;
  },
};

function weeknumSimple(serial: number, startDay: 0 | 1): number {
  const { year } = serialToParts(serial);
  const jan1Serial = ymdToSerial(year, 1, 1);
  const jan1Weekday = serialToParts(jan1Serial).weekday;
  const offset = (jan1Weekday - startDay + 7) % 7;
  const daysSinceJan1 = serial - jan1Serial;
  return Math.floor((daysSinceJan1 + offset) / 7) + 1;
}

function isoWeekNum(serial: number): number {
  const parts = serialToParts(serial);
  const isoWeekday = parts.weekday === 0 ? 7 : parts.weekday; // Mon=1..Sun=7
  const thursdaySerial = Math.floor(serial) - isoWeekday + 4;
  const thursdayYear = serialToParts(thursdaySerial).year;
  const jan1OfThursdayYear = ymdToSerial(thursdayYear, 1, 1);
  return Math.floor((thursdaySerial - jan1OfThursdayYear) / 7) + 1;
}

const WEEKNUM: FunctionMeta = {
  name: 'WEEKNUM',
  signature: 'WEEKNUM(serial_number, [return_type])',
  description: 'シリアル値が年の何週目かを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;

    let type = 1;
    if (args.length >= 2 && args[1].kind !== 'omitted') {
      const t = resolveNumber(args[1], ctx);
      if (isFormulaError(t)) return t;
      type = Math.trunc(t);
    }

    if (type === 21) return isoWeekNum(Math.floor(serial));
    if (type === 1) return weeknumSimple(Math.floor(serial), 0);
    if (type === 2) return weeknumSimple(Math.floor(serial), 1);
    return makeError('#NUM!');
  },
};

const ISOWEEKNUM: FunctionMeta = {
  name: 'ISOWEEKNUM',
  signature: 'ISOWEEKNUM(serial_number)',
  description: 'ISO 8601に基づく週番号を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    return isoWeekNum(Math.floor(serial));
  },
};

// ============================================================
// EDATE / EOMONTH
// ============================================================
function addMonths(serial: number, months: number): number {
  const { year, month, day } = serialToParts(serial);
  const totalMonths = year * 12 + (month - 1) + months;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = totalMonths - newYear * 12 + 1;
  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return ymdToSerial(newYear, newMonth, newDay);
}

function eomonth(serial: number, months: number): number {
  const { year, month } = serialToParts(serial);
  const totalMonths = year * 12 + (month - 1) + months + 1; // target 1st of the following month
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = totalMonths - newYear * 12 + 1;
  return ymdToSerial(newYear, newMonth, 1) - 1;
}

const EDATE: FunctionMeta = {
  name: 'EDATE',
  signature: 'EDATE(start_date, months)',
  description: '起算日から指定した月数だけ前後した日付のシリアル値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    const months = resolveNumber(args[1], ctx);
    if (isFormulaError(months)) return months;
    const result = addMonths(Math.floor(serial), Math.trunc(months));
    if (result < 1) return makeError('#NUM!');
    return result;
  },
};

const EOMONTH: FunctionMeta = {
  name: 'EOMONTH',
  signature: 'EOMONTH(start_date, months)',
  description: '起算日から指定した月数だけ前後した月の最終日のシリアル値を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const serial = resolveSerial(args[0], ctx);
    if (isFormulaError(serial)) return serial;
    const months = resolveNumber(args[1], ctx);
    if (isFormulaError(months)) return months;
    const result = eomonth(Math.floor(serial), Math.trunc(months));
    if (result < 1) return makeError('#NUM!');
    return result;
  },
};

// ============================================================
// DATEDIF
// ============================================================
function dateDiff(startSerial: number, endSerial: number, unit: string): number | FormulaError {
  if (startSerial > endSerial) return makeError('#NUM!');
  const s = serialToParts(startSerial);
  const e = serialToParts(endSerial);

  switch (unit.toUpperCase()) {
    case 'D':
      return endSerial - startSerial;
    case 'Y': {
      let years = e.year - s.year;
      if (e.month < s.month || (e.month === s.month && e.day < s.day)) years--;
      return years;
    }
    case 'M': {
      let months = (e.year - s.year) * 12 + (e.month - s.month);
      if (e.day < s.day) months--;
      return months;
    }
    case 'MD': {
      let day = e.day - s.day;
      if (day < 0) {
        const prevMonth = e.month === 1 ? 12 : e.month - 1;
        const prevYear = e.month === 1 ? e.year - 1 : e.year;
        day += daysInMonth(prevYear, prevMonth);
      }
      return day;
    }
    case 'YM': {
      const months = e.month - s.month;
      return ((months % 12) + 12) % 12;
    }
    case 'YD': {
      let alignedYear = e.year;
      let startInEndYear = ymdToSerial(alignedYear, s.month, s.day);
      if (startInEndYear > endSerial) {
        alignedYear -= 1;
        startInEndYear = ymdToSerial(alignedYear, s.month, s.day);
      }
      return endSerial - startInEndYear;
    }
    default:
      return makeError('#NUM!');
  }
}

const DATEDIF: FunctionMeta = {
  name: 'DATEDIF',
  signature: 'DATEDIF(start_date, end_date, unit)',
  description: '2つの日付の間隔を指定した単位で返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const end = resolveSerial(args[1], ctx);
    if (isFormulaError(end)) return end;
    const unit = resolveString(args[2], ctx);
    if (isFormulaError(unit)) return unit;
    return dateDiff(Math.floor(start), Math.floor(end), unit);
  },
};

// ============================================================
// DAYS / DAYS360 / YEARFRAC
// ============================================================
const DAYS: FunctionMeta = {
  name: 'DAYS',
  signature: 'DAYS(end_date, start_date)',
  description: '2つの日付の間の日数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const end = resolveSerial(args[0], ctx);
    if (isFormulaError(end)) return end;
    const start = resolveSerial(args[1], ctx);
    if (isFormulaError(start)) return start;
    return Math.floor(end) - Math.floor(start);
  },
};

function days360(startSerial: number, endSerial: number, european: boolean): number {
  const s = serialToParts(startSerial);
  const e = serialToParts(endSerial);
  let d1 = s.day;
  let d2 = e.day;
  const { year: y1, month: m1 } = s;
  const { year: y2, month: m2 } = e;

  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    const lastDayOfFeb = m1 === 2 && d1 === daysInMonth(y1, 2);
    if (lastDayOfFeb || d1 === 31) d1 = 30;
    if (d2 === 31 && d1 === 30) d2 = 30;
  }
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

const DAYS360: FunctionMeta = {
  name: 'DAYS360',
  signature: 'DAYS360(start_date, end_date, [method])',
  description: '1年を360日として2つの日付の間の日数を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const end = resolveSerial(args[1], ctx);
    if (isFormulaError(end)) return end;

    let method = false;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const v = resolveScalar(args[2], ctx);
      if (isFormulaError(v)) return v;
      const b = toBoolean(v);
      if (isFormulaError(b)) return b;
      method = b;
    }

    return days360(Math.floor(start), Math.floor(end), method);
  },
};

function yearFrac(startSerial: number, endSerial: number, basis: number): number | FormulaError {
  const s = Math.min(startSerial, endSerial);
  const e = Math.max(startSerial, endSerial);
  switch (basis) {
    case 0:
      return days360(s, e, false) / 360;
    case 1: {
      const sp = serialToParts(s);
      const ep = serialToParts(e);
      const actualDays = e - s;
      if (sp.year === ep.year) {
        return actualDays / (isLeapYear(sp.year) ? 366 : 365);
      }
      let totalDays = 0;
      for (let y = sp.year; y <= ep.year; y++) totalDays += isLeapYear(y) ? 366 : 365;
      const avgDaysPerYear = totalDays / (ep.year - sp.year + 1);
      return actualDays / avgDaysPerYear;
    }
    case 2:
      return (e - s) / 360;
    case 3:
      return (e - s) / 365;
    case 4:
      return days360(s, e, true) / 360;
    default:
      return makeError('#NUM!');
  }
}

const YEARFRAC: FunctionMeta = {
  name: 'YEARFRAC',
  signature: 'YEARFRAC(start_date, end_date, [basis])',
  description: '2つの日付の間の期間を1年に対する割合で返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const end = resolveSerial(args[1], ctx);
    if (isFormulaError(end)) return end;

    let basis = 0;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const b = resolveNumber(args[2], ctx);
      if (isFormulaError(b)) return b;
      basis = Math.trunc(b);
    }

    return yearFrac(Math.floor(start), Math.floor(end), basis);
  },
};

// ============================================================
// DATEVALUE / TIMEVALUE
// ============================================================
const DATEVALUE: FunctionMeta = {
  name: 'DATEVALUE',
  signature: 'DATEVALUE(date_text)',
  description: '日付を表す文字列をシリアル値に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    if (typeof val !== 'string') return makeError('#VALUE!');
    const parsed = parseUserInput(val);
    if (
      typeof parsed.value !== 'number' ||
      !parsed.formatHint ||
      (parsed.formatHint.numberFormat !== 'date' && parsed.formatHint.numberFormat !== 'datetime')
    ) {
      return makeError('#VALUE!');
    }
    return Math.floor(parsed.value);
  },
};

const TIMEVALUE: FunctionMeta = {
  name: 'TIMEVALUE',
  signature: 'TIMEVALUE(time_text)',
  description: '時刻を表す文字列をシリアル値(小数部)に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    if (typeof val !== 'string') return makeError('#VALUE!');
    const parsed = parseUserInput(val);
    if (
      typeof parsed.value !== 'number' ||
      !parsed.formatHint ||
      (parsed.formatHint.numberFormat !== 'time' && parsed.formatHint.numberFormat !== 'datetime')
    ) {
      return makeError('#VALUE!');
    }
    return parsed.value - Math.floor(parsed.value);
  },
};

// ============================================================
// NETWORKDAYS / NETWORKDAYS.INTL / WORKDAY / WORKDAY.INTL
// (holidays is a range/array argument, read directly — not scalar-lifted)
// ============================================================
function collectHolidays(
  arg: FunctionArgValue | undefined,
  ctx: FunctionContext,
): Set<number> | FormulaError {
  const set = new Set<number>();
  if (!arg || arg.kind === 'omitted') return set;
  for (const v of argToFlat(arg, ctx)) {
    if (isFormulaError(v)) return v;
    if (typeof v === 'string' && v === '') continue;
    const s = toSerial(v);
    if (isFormulaError(s)) return s;
    set.add(Math.floor(s));
  }
  return set;
}

function isWeekendDefault(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

const WEEKEND_CODE_DAYS: Record<number, number[]> = {
  1: [6, 0],
  2: [0, 1],
  3: [1, 2],
  4: [2, 3],
  5: [3, 4],
  6: [4, 5],
  7: [5, 6],
  11: [0],
  12: [1],
  13: [2],
  14: [3],
  15: [4],
  16: [5],
  17: [6],
};

function isWeekendFromString(s: string): ((weekday: number) => boolean) | null {
  if (s.length !== 7 || !/^[01]+$/.test(s)) return null;
  return (weekday: number) => {
    const idx = weekday === 0 ? 6 : weekday - 1; // string is Monday-first
    return s[idx] === '1';
  };
}

/** Resolve the optional `weekend` argument (numeric code or a 7-char '0'/'1' string) into a predicate. */
function resolveWeekend(
  arg: FunctionArgValue | undefined,
  ctx: FunctionContext,
): ((weekday: number) => boolean) | FormulaError {
  if (!arg || arg.kind === 'omitted') return isWeekendDefault;
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  if (typeof val === 'string' && !/^-?\d+$/.test(val.trim())) {
    const fn = isWeekendFromString(val);
    if (!fn) return makeError('#NUM!');
    return fn;
  }
  const code = Math.trunc(Number(val));
  const days = WEEKEND_CODE_DAYS[code];
  if (!days) return makeError('#NUM!');
  return (weekday: number) => days.includes(weekday);
}

function networkdays(
  start: number,
  end: number,
  holidays: Set<number>,
  isWeekend: (weekday: number) => boolean,
): number {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    const weekday = serialToParts(d).weekday;
    if (isWeekend(weekday)) continue;
    if (holidays.has(d)) continue;
    count++;
  }
  return start <= end ? count : -count;
}

function workday(
  start: number,
  days: number,
  holidays: Set<number>,
  isWeekend: (weekday: number) => boolean,
): number {
  let remaining = Math.abs(Math.trunc(days));
  let current = start;
  const step = days >= 0 ? 1 : -1;
  while (remaining > 0) {
    current += step;
    const weekday = serialToParts(current).weekday;
    if (isWeekend(weekday)) continue;
    if (holidays.has(current)) continue;
    remaining--;
  }
  return current;
}

const NETWORKDAYS: FunctionMeta = {
  name: 'NETWORKDAYS',
  signature: 'NETWORKDAYS(start_date, end_date, [holidays])',
  description: '2つの日付の間の稼働日数(土日と祝日を除く)を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const end = resolveSerial(args[1], ctx);
    if (isFormulaError(end)) return end;
    const holidays = collectHolidays(args[2], ctx);
    if (isFormulaError(holidays)) return holidays;
    return networkdays(Math.floor(start), Math.floor(end), holidays, isWeekendDefault);
  },
};

const NETWORKDAYS_INTL: FunctionMeta = {
  name: 'NETWORKDAYS.INTL',
  signature: 'NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])',
  description: '週末の曜日を指定できる稼働日数を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 4) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const end = resolveSerial(args[1], ctx);
    if (isFormulaError(end)) return end;
    const isWeekend = resolveWeekend(args[2], ctx);
    if (isFormulaError(isWeekend)) return isWeekend;
    const holidays = collectHolidays(args[3], ctx);
    if (isFormulaError(holidays)) return holidays;
    return networkdays(Math.floor(start), Math.floor(end), holidays, isWeekend);
  },
};

const WORKDAY: FunctionMeta = {
  name: 'WORKDAY',
  signature: 'WORKDAY(start_date, days, [holidays])',
  description: '起算日から指定した稼働日数だけ前後した日付を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const days = resolveNumber(args[1], ctx);
    if (isFormulaError(days)) return days;
    const holidays = collectHolidays(args[2], ctx);
    if (isFormulaError(holidays)) return holidays;
    const result = workday(Math.floor(start), days, holidays, isWeekendDefault);
    if (result < 1) return makeError('#NUM!');
    return result;
  },
};

const WORKDAY_INTL: FunctionMeta = {
  name: 'WORKDAY.INTL',
  signature: 'WORKDAY.INTL(start_date, days, [weekend], [holidays])',
  description: '週末の曜日を指定できる稼働日ベースの日付計算を行います',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 4) return makeError('#VALUE!');
    const start = resolveSerial(args[0], ctx);
    if (isFormulaError(start)) return start;
    const days = resolveNumber(args[1], ctx);
    if (isFormulaError(days)) return days;
    const isWeekend = resolveWeekend(args[2], ctx);
    if (isFormulaError(isWeekend)) return isWeekend;
    const holidays = collectHolidays(args[3], ctx);
    if (isFormulaError(holidays)) return holidays;
    const result = workday(Math.floor(start), days, holidays, isWeekend);
    if (result < 1) return makeError('#NUM!');
    return result;
  },
};

export const dateFunctions: FunctionMeta[] = [
  TODAY,
  NOW,
  DATE,
  YEAR,
  MONTH,
  DAY,
  TIME,
  HOUR,
  MINUTE,
  SECOND,
  WEEKDAY,
  WEEKNUM,
  ISOWEEKNUM,
  EDATE,
  EOMONTH,
  DATEDIF,
  DAYS,
  DAYS360,
  YEARFRAC,
  DATEVALUE,
  TIMEVALUE,
  NETWORKDAYS,
  NETWORKDAYS_INTL,
  WORKDAY,
  WORKDAY_INTL,
];
