import { describe, it, expect } from 'vite-plus/test';
import { getCellDisplay } from './cellDisplay';
import type { CellData } from '../types/grid';

function cell(overrides: Partial<CellData>): CellData {
  return { rawValue: '', displayValue: '', ...overrides };
}

describe('getCellDisplay', () => {
  it('right-aligns numbers by default', () => {
    const result = getCellDisplay(
      cell({ rawValue: '42', displayValue: '42', computed: 42 }),
      undefined,
    );
    expect(result.align).toBe('right');
    expect(result.kind).toBe('number');
    expect(result.text).toBe('42');
  });

  it('applies a custom numberFormatPattern to a number', () => {
    const result = getCellDisplay(
      cell({ rawValue: '1234', displayValue: '1234', computed: 1234 }),
      { numberFormat: 'custom', numberFormatPattern: '#,##0.00' },
    );
    expect(result.text).toBe('1,234.00');
    expect(result.align).toBe('right');
  });

  it('reflects [Red] color from the pattern for negative numbers', () => {
    const result = getCellDisplay(cell({ rawValue: '-5', displayValue: '-5', computed: -5 }), {
      numberFormat: 'custom',
      numberFormatPattern: '#,##0;[Red]-#,##0',
    });
    expect(result.color).toBe('#d93025');
  });

  it('centers boolean TRUE', () => {
    const result = getCellDisplay(
      cell({ rawValue: 'TRUE', displayValue: 'TRUE', computed: true }),
      undefined,
    );
    expect(result.align).toBe('center');
    expect(result.kind).toBe('boolean');
    expect(result.text).toBe('TRUE');
  });

  it('centers error text', () => {
    const result = getCellDisplay(
      cell({ rawValue: '=1/0', displayValue: '#DIV/0!', error: '#DIV/0!' }),
      undefined,
    );
    expect(result.align).toBe('center');
    expect(result.kind).toBe('error');
    expect(result.text).toBe('#DIV/0!');
  });

  it('shows the raw value unformatted for plainText even when numeric', () => {
    const result = getCellDisplay(cell({ rawValue: '007', displayValue: '007', computed: 7 }), {
      numberFormat: 'plainText',
    });
    expect(result.kind).toBe('text');
    expect(result.text).toBe('007');
  });

  it('lets an explicit textAlign override the kind default', () => {
    const result = getCellDisplay(cell({ rawValue: '42', displayValue: '42', computed: 42 }), {
      textAlign: 'left',
    });
    expect(result.align).toBe('left');
  });

  it('treats a numeric displayValue as a number even without a computed value', () => {
    const result = getCellDisplay(cell({ rawValue: '12', displayValue: '12' }), undefined);
    expect(result.kind).toBe('number');
    expect(result.align).toBe('right');
    expect(result.text).toBe('12');
  });

  it('returns empty display for an absent cell', () => {
    const result = getCellDisplay(undefined, undefined);
    expect(result).toEqual({ text: '', align: 'left', kind: 'empty' });
  });
});
