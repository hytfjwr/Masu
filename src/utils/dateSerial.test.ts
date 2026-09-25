import { describe, it, expect } from 'vitest';
import { ymdToSerial, serialToParts } from './dateSerial';

describe('ymdToSerial', () => {
  it('matches known Excel 1900 serials', () => {
    expect(ymdToSerial(1900, 1, 1)).toBe(1);
    expect(ymdToSerial(1900, 2, 28)).toBe(59);
    expect(ymdToSerial(1900, 3, 1)).toBe(61);
    expect(ymdToSerial(2026, 4, 10)).toBe(46122);
    expect(ymdToSerial(1899, 12, 31)).toBe(0);
  });

  it('lets Date.UTC handle month/day overflow', () => {
    expect(ymdToSerial(2026, 13, 1)).toBe(ymdToSerial(2027, 1, 1));
  });
});

describe('serialToParts', () => {
  it('resolves date and weekday', () => {
    const parts = serialToParts(46122);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(4);
    expect(parts.day).toBe(10);
    expect(parts.weekday).toBe(5); // Friday
  });

  it('resolves fractional time-of-day', () => {
    const parts = serialToParts(46122.5);
    expect(parts.hour).toBe(12);
  });

  it('returns the phantom 1900-02-29 for serial 60', () => {
    const parts = serialToParts(60);
    expect(parts.year).toBe(1900);
    expect(parts.month).toBe(2);
    expect(parts.day).toBe(29);
  });

  it('round-trips through a year of dates unaffected by DST/TZ', () => {
    const start = Date.UTC(2026, 2, 8); // 2026-03-08
    const end = Date.UTC(2026, 10, 1); // 2026-11-01
    for (let ms = start; ms <= end; ms += 86400000) {
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const serial = ymdToSerial(y, m, day);
      const parts = serialToParts(serial);
      expect([parts.year, parts.month, parts.day]).toEqual([y, m, day]);
    }
  });
});
