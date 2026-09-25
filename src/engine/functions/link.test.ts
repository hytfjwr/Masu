import { describe, it, expect } from 'vite-plus/test';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type { FormulaResult, RangeExpander } from '../types';

const expandRange: RangeExpander = (start: string, end: string): string[] => {
  const startCol = start.charCodeAt(0) - 65;
  const endCol = end.charCodeAt(0) - 65;
  const startRow = parseInt(start.slice(1), 10);
  const endRow = parseInt(end.slice(1), 10);
  const keys: string[] = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      keys.push(`${String.fromCharCode(65 + c)}${r}`);
    }
  }
  return keys;
};

const emptyResolve = (key: string): FormulaResult => (key ? '' : '');

describe('HYPERLINK', () => {
  it('returns the label as display value with 2 args', () => {
    const ast = parse('HYPERLINK("https://example.com","表示テキスト")');
    const result = evaluate(ast, emptyResolve, expandRange);
    expect(result).toBe('表示テキスト');
  });

  it('returns the URL as display value with 1 arg', () => {
    const ast = parse('HYPERLINK("https://example.com")');
    const result = evaluate(ast, emptyResolve, expandRange);
    expect(result).toBe('https://example.com');
  });

  it('calls setHyperlinkMeta with correct url and label', () => {
    const ast = parse('HYPERLINK("https://example.com","テスト")');
    let capturedUrl = '';
    let capturedLabel = '';
    const setHyperlinkMeta = (url: string, label: string) => {
      capturedUrl = url;
      capturedLabel = label;
    };
    evaluate(ast, emptyResolve, expandRange, undefined, undefined, setHyperlinkMeta);
    expect(capturedUrl).toBe('https://example.com');
    expect(capturedLabel).toBe('テスト');
  });

  it('returns #VALUE! with no args', () => {
    const ast = parse('HYPERLINK()');
    const result = evaluate(ast, emptyResolve, expandRange);
    expect(result).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('returns #VALUE! with too many args', () => {
    const ast = parse('HYPERLINK("a","b","c")');
    const result = evaluate(ast, emptyResolve, expandRange);
    expect(result).toEqual({ type: 'error', code: '#VALUE!' });
  });
});
