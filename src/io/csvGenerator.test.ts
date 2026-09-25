import { describe, it, expect } from 'vite-plus/test';
import { generateCSV } from './csvGenerator';

describe('generateCSV', () => {
  it('generates basic CSV from 2D array', () => {
    const result = generateCSV([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    // Should have BOM prefix
    expect(result.charCodeAt(0)).toBe(0xfeff);
    // Remove BOM and check content
    const content = result.slice(1);
    expect(content).toBe('a,b,c\r\n1,2,3\r\n');
  });

  it('prepends UTF-8 BOM', () => {
    const result = generateCSV([['hello']]);
    expect(result.charCodeAt(0)).toBe(0xfeff);
  });

  it('wraps fields containing commas in double quotes', () => {
    const result = generateCSV([['hello,world', 'ok']]);
    const content = result.slice(1);
    expect(content).toBe('"hello,world",ok\r\n');
  });

  it('escapes double quotes within fields', () => {
    const result = generateCSV([['he said "hi"']]);
    const content = result.slice(1);
    expect(content).toBe('"he said ""hi"""\r\n');
  });

  it('wraps fields containing newlines in double quotes', () => {
    const result = generateCSV([['line1\nline2']]);
    const content = result.slice(1);
    expect(content).toBe('"line1\nline2"\r\n');
  });

  it('handles empty rows array', () => {
    const result = generateCSV([]);
    const content = result.slice(1);
    expect(content).toBe('\r\n');
  });

  it('handles row with empty strings', () => {
    const result = generateCSV([['', '', '']]);
    const content = result.slice(1);
    expect(content).toBe(',,\r\n');
  });

  it('wraps fields containing carriage return in double quotes', () => {
    const result = generateCSV([['a\rb']]);
    const content = result.slice(1);
    expect(content).toBe('"a\rb"\r\n');
  });
});
