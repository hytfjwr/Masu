import { describe, it, expect } from 'vitest';
import { generateJSON } from './jsonGenerator';

describe('generateJSON', () => {
  it('generates array-of-objects from headers and rows', () => {
    const result = generateJSON(
      ['name', 'age'],
      [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    );
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('converts numeric strings to number type', () => {
    const result = generateJSON(['value'], [['42'], ['3.14'], ['-7']]);
    const parsed = JSON.parse(result);
    expect(parsed[0].value).toBe(42);
    expect(parsed[1].value).toBe(3.14);
    expect(parsed[2].value).toBe(-7);
  });

  it('converts boolean strings to boolean type', () => {
    const result = generateJSON(['flag'], [['true'], ['false']]);
    const parsed = JSON.parse(result);
    expect(parsed[0].flag).toBe(true);
    expect(parsed[1].flag).toBe(false);
  });

  it('converts "null" string to null', () => {
    const result = generateJSON(['val'], [['null']]);
    const parsed = JSON.parse(result);
    expect(parsed[0].val).toBeNull();
  });

  it('keeps non-numeric strings as strings', () => {
    const result = generateJSON(['text'], [['hello'], ['world']]);
    const parsed = JSON.parse(result);
    expect(parsed[0].text).toBe('hello');
    expect(parsed[1].text).toBe('world');
  });

  it('handles empty values as empty strings', () => {
    const result = generateJSON(['a', 'b'], [['', 'test']]);
    const parsed = JSON.parse(result);
    expect(parsed[0].a).toBe('');
    expect(parsed[0].b).toBe('test');
  });

  it('handles rows shorter than headers', () => {
    const result = generateJSON(['a', 'b', 'c'], [['1']]);
    const parsed = JSON.parse(result);
    expect(parsed[0]).toEqual({ a: 1, b: '', c: '' });
  });

  it('generates empty array for empty rows', () => {
    const result = generateJSON(['a'], []);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([]);
  });

  it('outputs pretty-printed JSON', () => {
    const result = generateJSON(['x'], [['1']]);
    expect(result).toContain('\n');
    expect(result).toContain('  ');
  });
});
