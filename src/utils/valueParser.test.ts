import { describe, it, expect } from 'vite-plus/test';
import { parseUserInput } from './valueParser';

describe('parseUserInput', () => {
  it('1. empty string', () => {
    expect(parseUserInput('')).toEqual({ value: '' });
  });

  it('2. leading apostrophe forces text', () => {
    expect(parseUserInput("'123")).toEqual({ value: '123' });
  });

  it('3. TRUE/FALSE (case-insensitive) become booleans', () => {
    expect(parseUserInput('TRUE')).toEqual({ value: true });
    expect(parseUserInput('false')).toEqual({ value: false });
  });

  it('4. plain numbers', () => {
    expect(parseUserInput('42')).toEqual({ value: 42 });
    expect(parseUserInput('-3.14')).toEqual({ value: -3.14 });
  });

  it('4b. leading zeros parse like Google Sheets', () => {
    expect(parseUserInput('00123')).toEqual({ value: 123 });
  });

  it('5. thousands-grouped numbers get a number hint', () => {
    expect(parseUserInput('1,234')).toEqual({
      value: 1234,
      formatHint: { numberFormat: 'number', pattern: '#,##0' },
    });
    expect(parseUserInput('1,234.5')).toEqual({
      value: 1234.5,
      formatHint: { numberFormat: 'number', pattern: '#,##0.0' },
    });
  });

  it('6. percentages get a percent hint', () => {
    expect(parseUserInput('10%')).toEqual({
      value: 0.1,
      formatHint: { numberFormat: 'percent', pattern: '0%' },
    });
  });

  it('7. currency symbols get a currency hint', () => {
    expect(parseUserInput('¥1,000')).toEqual({
      value: 1000,
      formatHint: { numberFormat: 'currency', pattern: '"¥"#,##0' },
    });
    expect(parseUserInput('1000円')).toEqual({
      value: 1000,
      formatHint: { numberFormat: 'currency', pattern: '#,##0"円"' },
    });
  });

  it('8. dates get a date hint', () => {
    expect(parseUserInput('2026/1/5')).toEqual({
      value: 46027,
      formatHint: { numberFormat: 'date', pattern: 'yyyy/mm/dd' },
    });
    expect(parseUserInput('2026-1-5')).toEqual({
      value: 46027,
      formatHint: { numberFormat: 'date', pattern: 'yyyy-mm-dd' },
    });
    expect(parseUserInput('2026年1月5日')).toEqual({
      value: 46027,
      formatHint: { numberFormat: 'date', pattern: 'yyyy"年"m"月"d"日"' },
    });
    expect(parseUserInput('2026/1/5 12:30')).toEqual({
      value: 46027.520833333336,
      formatHint: { numberFormat: 'datetime', pattern: 'yyyy/mm/dd h:mm' },
    });
  });

  it('8b. m/d without a year uses the current year', () => {
    const year = new Date().getFullYear();
    const result = parseUserInput('3/15');
    expect(result.formatHint).toEqual({ numberFormat: 'date', pattern: 'm/d' });
    expect(typeof result.value).toBe('number');
    const y = String(year);
    expect(y.length).toBe(4);
  });

  it('9. times get a time hint', () => {
    expect(parseUserInput('12:30')).toEqual({
      value: 0.5208333333333334,
      formatHint: { numberFormat: 'time', pattern: 'h:mm' },
    });
    expect(parseUserInput('1:30 PM')).toEqual({
      value: 0.5625,
      formatHint: { numberFormat: 'time', pattern: 'h:mm AM/PM' },
    });
  });

  it('10. anything else is returned as text', () => {
    expect(parseUserInput('hello world')).toEqual({ value: 'hello world' });
  });

  it('rejects malformed thousands separators as text', () => {
    expect(parseUserInput('1,23')).toEqual({ value: '1,23' });
  });

  it('rejects invalid calendar dates as text', () => {
    expect(parseUserInput('2026/2/30')).toEqual({ value: '2026/2/30' });
  });

  it('rejects out-of-range times as text', () => {
    expect(parseUserInput('25:00')).toEqual({ value: '25:00' });
  });
});

describe('parseUserInput full-width input', () => {
  it('treats full-width digits and symbols as numbers', () => {
    expect(parseUserInput('１２３').value).toBe(123);
    expect(parseUserInput('５０％').value).toBeCloseTo(0.5);
    expect(parseUserInput('①').value).toBe('①');
  });
});
