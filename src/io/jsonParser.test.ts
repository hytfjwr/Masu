import { describe, it, expect } from 'vite-plus/test';
import { parseJSON } from './jsonParser';

describe('parseJSON', () => {
  it('parses basic array-of-objects', () => {
    const input = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    const result = parseJSON(input);
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
  });

  it('returns empty headers and rows for empty array', () => {
    const result = parseJSON('[]');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('collects union of all keys across objects', () => {
    const input = JSON.stringify([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ]);
    const result = parseJSON(input);
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([
      ['1', '2', ''],
      ['', '3', '4'],
    ]);
  });

  it('handles null and undefined values as empty strings', () => {
    const input = JSON.stringify([{ a: null, b: 'hello' }]);
    const result = parseJSON(input);
    expect(result.rows).toEqual([['', 'hello']]);
  });

  it('handles boolean values', () => {
    const input = JSON.stringify([{ flag: true, other: false }]);
    const result = parseJSON(input);
    expect(result.rows).toEqual([['true', 'false']]);
  });

  it('stringifies nested objects and arrays', () => {
    const input = JSON.stringify([{ data: { nested: true }, list: [1, 2] }]);
    const result = parseJSON(input);
    expect(result.rows[0][0]).toBe('{"nested":true}');
    expect(result.rows[0][1]).toBe('[1,2]');
  });

  it('throws on invalid JSON string', () => {
    expect(() => parseJSON('not json')).toThrow('Invalid JSON: parsing failed');
  });

  it('throws on non-array JSON', () => {
    expect(() => parseJSON('{"a": 1}')).toThrow('expected an array of objects');
  });

  it('throws on array of non-objects', () => {
    expect(() => parseJSON('[1, 2, 3]')).toThrow('expected an array of objects');
  });

  it('throws on array containing arrays', () => {
    expect(() => parseJSON('[[1, 2]]')).toThrow('expected an array of objects');
  });

  it('handles Japanese text', () => {
    const input = JSON.stringify([{ 名前: '太郎', 年齢: 25 }]);
    const result = parseJSON(input);
    expect(result.headers).toEqual(['名前', '年齢']);
    expect(result.rows).toEqual([['太郎', '25']]);
  });
});
