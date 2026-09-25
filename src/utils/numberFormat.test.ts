import { describe, it, expect } from 'vitest';
import {
  formatDisplayValue,
  formatWithPattern,
  formatGeneral,
  adjustDecimals,
  patternForStyle,
} from './numberFormat';

describe('formatDisplayValue', () => {
  it('returns value as-is for "auto" format', () => {
    expect(formatDisplayValue('42', 'auto')).toBe('42');
  });

  it('returns empty string for empty input', () => {
    expect(formatDisplayValue('', 'number')).toBe('');
  });

  it('formats number with 2 decimal places', () => {
    expect(formatDisplayValue('1234', 'number')).toBe('1,234.00');
    expect(formatDisplayValue('0.5', 'number')).toBe('0.50');
  });

  it('formats currency with yen sign and 2 decimal places', () => {
    expect(formatDisplayValue('1234', 'currency')).toBe('\u00A51,234.00');
  });

  it('formats percent by multiplying by 100', () => {
    expect(formatDisplayValue('0.15', 'percent')).toBe('15.00%');
    expect(formatDisplayValue('1', 'percent')).toBe('100.00%');
  });

  it('formats ISO date string', () => {
    expect(formatDisplayValue('2026-04-10', 'date')).toBe('2026/04/10');
  });

  it('returns non-numeric value as-is for numeric formats', () => {
    expect(formatDisplayValue('hello', 'number')).toBe('hello');
    expect(formatDisplayValue('hello', 'currency')).toBe('hello');
    expect(formatDisplayValue('hello', 'percent')).toBe('hello');
  });

  it('returns non-date value as-is for date format', () => {
    expect(formatDisplayValue('not-a-date', 'date')).toBe('not-a-date');
  });

  it('handles negative numbers', () => {
    expect(formatDisplayValue('-42.5', 'number')).toBe('-42.50');
  });

  it('handles zero', () => {
    expect(formatDisplayValue('0', 'number')).toBe('0.00');
    expect(formatDisplayValue('0', 'percent')).toBe('0.00%');
  });

  it('formats a serial number directly with an explicit date pattern', () => {
    expect(formatDisplayValue('46122', 'date')).toBe('2026/04/10');
  });

  it('respects an explicit custom pattern override', () => {
    expect(formatDisplayValue('0.5', 'number', '0.0')).toBe('0.5');
  });
});

describe('formatWithPattern', () => {
  it('formats thousands grouping and fixed decimals', () => {
    expect(formatWithPattern(1234.567, '#,##0.00')).toEqual({ text: '1,234.57' });
    expect(formatWithPattern(-1234.5, '#,##0.00')).toEqual({ text: '-1,234.50' });
  });

  it('formats percent', () => {
    expect(formatWithPattern(0.256, '0.0%')).toEqual({ text: '25.6%' });
  });

  it('rounds half-away-from-zero, avoiding float rounding artifacts', () => {
    expect(formatWithPattern(1.005, '0.00')).toEqual({ text: '1.01' });
  });

  it('pads with leading zeros', () => {
    expect(formatWithPattern(5, '000')).toEqual({ text: '005' });
  });

  it('divides by 1000 per trailing comma', () => {
    expect(formatWithPattern(1234567, '#,##0,')).toEqual({ text: '1,235' });
  });

  it('formats scientific notation with a zero-padded exponent', () => {
    expect(formatWithPattern(12345, '0.00E+00')).toEqual({ text: '1.23E+04' });
  });

  it('applies a color from the matching negative section', () => {
    expect(formatWithPattern(-5, '#,##0;[Red](#,##0)')).toEqual({ text: '(5)', color: '#d93025' });
  });

  it('picks the zero section when present', () => {
    expect(formatWithPattern(0, '0.00;-0.00;"zero"')).toEqual({ text: 'zero' });
  });

  it('renders the text section with @ substitution', () => {
    expect(formatWithPattern('abc', '0;0;0;"text: "@')).toEqual({ text: 'text: abc' });
  });

  it('formats dates', () => {
    expect(formatWithPattern(46122, 'yyyy/mm/dd')).toEqual({ text: '2026/04/10' });
    expect(formatWithPattern(46122, 'yyyy"年"m"月"d"日"')).toEqual({ text: '2026年4月10日' });
    expect(formatWithPattern(46122, 'yyyy年m月d日(aaa)')).toEqual({ text: '2026年4月10日(金)' });
  });

  it('formats month/weekday names', () => {
    expect(formatWithPattern(46122, 'mmm d, yyyy')).toEqual({ text: 'Apr 10, 2026' });
    expect(formatWithPattern(46122, 'dddd')).toEqual({ text: 'Friday' });
  });

  it('formats time, with and without AM/PM', () => {
    expect(formatWithPattern(0.5625, 'h:mm')).toEqual({ text: '13:30' });
    expect(formatWithPattern(0.5625, 'h:mm AM/PM')).toEqual({ text: '1:30 PM' });
    expect(formatWithPattern(46122.75, 'yyyy/mm/dd hh:mm:ss')).toEqual({
      text: '2026/04/10 18:00:00',
    });
  });

  it('formats elapsed duration hours', () => {
    expect(formatWithPattern(1.5, '[h]:mm')).toEqual({ text: '36:00' });
  });

  it('formats currency with a literal symbol', () => {
    expect(formatWithPattern(1234.5, '"¥"#,##0')).toEqual({ text: '¥1,235' });
  });
});

describe('formatGeneral', () => {
  it('matches the documented examples', () => {
    expect(formatGeneral(1 / 3)).toBe('0.3333333333');
    expect(formatGeneral(0.1 + 0.2)).toBe('0.3');
    expect(formatGeneral(123456789012)).toBe('123456789012');
    expect(formatGeneral(1e20)).toBe('1E+20');
    expect(formatGeneral(-2.5)).toBe('-2.5');
    expect(formatGeneral(0)).toBe('0');
  });
});

describe('adjustDecimals', () => {
  it('increases/decreases the decimal digit count of an existing pattern', () => {
    expect(adjustDecimals('#,##0.00', 1)).toBe('#,##0.000');
    expect(adjustDecimals('0.0%', -1)).toBe('0%');
    expect(adjustDecimals('0', -1)).toBe('0');
  });

  it('builds a pattern from the current automatic decimal digit count when none is given', () => {
    expect(adjustDecimals(undefined, 1, 1.5)).toBe('#,##0.00');
    expect(adjustDecimals(undefined, -1, 1.25)).toBe('#,##0.0');
  });
});

describe('patternForStyle', () => {
  it('prefers numberFormatPattern over the preset', () => {
    expect(patternForStyle({ numberFormat: 'percent' })).toBe('0.00%');
    expect(patternForStyle({ numberFormat: 'number', numberFormatPattern: '0.0' })).toBe('0.0');
    expect(patternForStyle(undefined)).toBeUndefined();
  });
});

describe('formatWithPattern placeholders', () => {
  it('pads trailing ? decimals with spaces and drops a lone # integer zero', () => {
    expect(formatWithPattern(3, '0.0?').text).toBe('3.0 ');
    expect(formatWithPattern(0.5, '#.00').text).toBe('.50');
    expect(formatWithPattern(1234.5, '#,##0.##').text).toBe('1,234.5');
  });
});
