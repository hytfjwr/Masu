import { describe, it, expect } from 'vite-plus/test';
import { parseCSV } from './csvParser';

describe('parseCSV', () => {
  it('parses basic comma-separated rows', () => {
    const result = parseCSV('a,b,c\n1,2,3');
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles double-quoted fields', () => {
    const result = parseCSV('"hello","world"');
    expect(result).toEqual([['hello', 'world']]);
  });

  it('handles commas inside double-quoted fields', () => {
    const result = parseCSV('"a,b",c');
    expect(result).toEqual([['a,b', 'c']]);
  });

  it('handles newlines inside double-quoted fields', () => {
    const result = parseCSV('"line1\nline2",b');
    expect(result).toEqual([['line1\nline2', 'b']]);
  });

  it('handles escaped double quotes ("")', () => {
    const result = parseCSV('"he said ""hi""",b');
    expect(result).toEqual([['he said "hi"', 'b']]);
  });

  it('handles empty fields as empty strings', () => {
    const result = parseCSV(',b,\n,,');
    expect(result).toEqual([
      ['', 'b', ''],
      ['', '', ''],
    ]);
  });

  it('returns empty array for empty string input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseCSV('   \n  ')).toEqual([]);
  });

  it('does not produce extra empty row when input ends with a newline', () => {
    const result = parseCSV('a,b\n1,2\n');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const result = parseCSV('a,b\r\n1,2');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CR-only line endings', () => {
    const result = parseCSV('a,b\r1,2');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips UTF-8 BOM and does not include it in values', () => {
    const bom = '\uFEFF';
    const result = parseCSV(bom + 'name,age\nAlice,30');
    expect(result).toEqual([
      ['name', 'age'],
      ['Alice', '30'],
    ]);
    // Verify BOM is not in the first field
    expect(result[0][0]).toBe('name');
    expect(result[0][0].charCodeAt(0)).toBe(110); // 'n'
  });

  it('handles a single value without trailing newline', () => {
    const result = parseCSV('hello');
    expect(result).toEqual([['hello']]);
  });

  it('handles a quoted field with CRLF inside', () => {
    const result = parseCSV('"a\r\nb",c');
    expect(result).toEqual([['a\r\nb', 'c']]);
  });

  it('handles unterminated quote gracefully', () => {
    // Unterminated quote should not throw
    const result = parseCSV('"unterminated');
    expect(result).toEqual([['unterminated']]);
  });

  it('parses Japanese characters correctly', () => {
    const result = parseCSV('名前,年齢\n太郎,25');
    expect(result).toEqual([
      ['名前', '年齢'],
      ['太郎', '25'],
    ]);
  });
});
