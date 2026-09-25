/**
 * Excel 1900 date serial system.
 *
 * Serial 1 = 1900-01-01. Serial 60 is the phantom "1900-02-29" that never
 * actually existed (Excel/Lotus 1-2-3 compatibility bug), and 61 = 1900-03-01.
 *
 * All conversions use Date.UTC / getUTC* accessors only — never the local
 * timezone Date constructor or getters — so results never shift with DST or
 * the host timezone.
 */

/** Days between the Unix epoch (1970-01-01) and 1900-01-01, minus 1, so that
 *  Date.UTC-based day counts line up with serial 1 = 1900-01-01. */
const EPOCH_DAY_OFFSET = 25568;

/** Convert a (possibly overflowing) year/month/day into an Excel 1900 serial. */
export function ymdToSerial(year: number, month: number, day: number): number {
  const ms = Date.UTC(year, month - 1, day);
  const daysSinceEpoch = ms / 86400000;
  const serialRaw = daysSinceEpoch + EPOCH_DAY_OFFSET;
  return serialRaw < 60 ? serialRaw : serialRaw + 1;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 = Sunday */
  weekday: number;
}

/** Resolve the calendar y/m/d (+ weekday) for an integer day serial. */
function datePartsForDaySerial(daySerial: number): { year: number; month: number; day: number; weekday: number } {
  if (daySerial === 60) {
    // Phantom 1900-02-29: no real UTC date exists for this serial.
    return { year: 1900, month: 2, day: 29, weekday: 3 };
  }
  const serialRaw = daySerial < 60 ? daySerial : daySerial - 1;
  const ms = (serialRaw - EPOCH_DAY_OFFSET) * 86400000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

/** Split a serial (integer part = date, fractional part = time-of-day) into parts. */
export function serialToParts(serial: number): DateParts {
  let daySerial = Math.floor(serial);
  const frac = serial - daySerial;
  let msOfDay = Math.round(frac * 86400000);
  if (msOfDay >= 86400000) {
    msOfDay -= 86400000;
    daySerial += 1;
  }
  const { year, month, day, weekday } = datePartsForDaySerial(daySerial);
  const hour = Math.floor(msOfDay / 3600000);
  const minute = Math.floor((msOfDay % 3600000) / 60000);
  const second = Math.floor((msOfDay % 60000) / 1000);
  const millisecond = msOfDay % 1000;
  return { year, month, day, hour, minute, second, millisecond, weekday };
}

/** Time-of-day as a fraction of a day (0..1). */
export function timeToFraction(hour: number, minute: number, second: number): number {
  return (hour * 3600 + minute * 60 + second) / 86400;
}

/** Serial for the current local date+time. */
export function nowSerial(now: Date = new Date()): number {
  return (
    ymdToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate()) +
    timeToFraction(now.getHours(), now.getMinutes(), now.getSeconds())
  );
}

/** Serial for the current local date (time-of-day truncated). */
export function todaySerial(now: Date = new Date()): number {
  return ymdToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
