import { describe, it, expect } from 'vite-plus/test';
import { parseSignature } from './signatureParser';

describe('parseSignature', () => {
  it('parses basic signature with required args', () => {
    const result = parseSignature(
      'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
    );
    expect(result.funcName).toBe('VLOOKUP');
    expect(result.args).toHaveLength(4);
    expect(result.args[0]).toEqual({ name: 'lookup_value', required: true, variadic: false });
    expect(result.args[1]).toEqual({ name: 'table_array', required: true, variadic: false });
    expect(result.args[2]).toEqual({ name: 'col_index_num', required: true, variadic: false });
    expect(result.args[3]).toEqual({ name: 'range_lookup', required: false, variadic: false });
  });

  it('parses variadic signature (SUM-style)', () => {
    const result = parseSignature('SUM(number1, [number2], ...)');
    expect(result.funcName).toBe('SUM');
    expect(result.args).toHaveLength(2);
    expect(result.args[0]).toEqual({ name: 'number1', required: true, variadic: false });
    expect(result.args[1]).toEqual({ name: 'number2', required: false, variadic: true });
  });

  it('parses no-argument function', () => {
    const result = parseSignature('NOW()');
    expect(result.funcName).toBe('NOW');
    expect(result.args).toHaveLength(0);
  });

  it('parses IF function', () => {
    const result = parseSignature('IF(logical_test, value_if_true, [value_if_false])');
    expect(result.funcName).toBe('IF');
    expect(result.args).toHaveLength(3);
    expect(result.args[0].required).toBe(true);
    expect(result.args[1].required).toBe(true);
    expect(result.args[2].required).toBe(false);
  });

  it('handles single required argument', () => {
    const result = parseSignature('ABS(number)');
    expect(result.funcName).toBe('ABS');
    expect(result.args).toHaveLength(1);
    expect(result.args[0]).toEqual({ name: 'number', required: true, variadic: false });
  });

  it('handles invalid signature gracefully', () => {
    const result = parseSignature('INVALID');
    expect(result.funcName).toBe('INVALID');
    expect(result.args).toHaveLength(0);
  });

  it('parses XLOOKUP signature', () => {
    const result = parseSignature(
      'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])',
    );
    expect(result.funcName).toBe('XLOOKUP');
    expect(result.args).toHaveLength(6);
    expect(result.args[0].required).toBe(true);
    expect(result.args[1].required).toBe(true);
    expect(result.args[2].required).toBe(true);
    expect(result.args[3].required).toBe(false);
    expect(result.args[4].required).toBe(false);
    expect(result.args[5].required).toBe(false);
  });
});
