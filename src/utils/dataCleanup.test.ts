import { describe, it, expect } from 'vitest';
import { detectDelimiter, findDuplicateRows, normalizeWhitespace, splitText } from './dataCleanup';

describe('findDuplicateRows', () => {
  it('keeps the first occurrence and flags later duplicates', () => {
    const rows = [['a', '1'], ['b', '2'], ['a', '1'], ['a', '3']];
    const result = findDuplicateRows(rows, [0, 1]);
    expect(result.keptRowIndices).toEqual([0, 1, 3]);
    expect(result.duplicateCount).toBe(1);
  });

  it('only compares the given check columns', () => {
    const rows = [['a', '1'], ['a', '2']];
    const result = findDuplicateRows(rows, [0]);
    expect(result.keptRowIndices).toEqual([0]);
    expect(result.duplicateCount).toBe(1);
  });

  it('is case-sensitive', () => {
    const rows = [['Apple'], ['apple']];
    const result = findDuplicateRows(rows, [0]);
    expect(result.keptRowIndices).toEqual([0, 1]);
    expect(result.duplicateCount).toBe(0);
  });

  it('returns no duplicates for an empty input', () => {
    expect(findDuplicateRows([], [0])).toEqual({ keptRowIndices: [], duplicateCount: 0 });
  });
});

describe('normalizeWhitespace', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeWhitespace('a   b\t\tc\n\nd')).toBe('a b c d');
  });

  it('leaves already-normalized text unchanged', () => {
    expect(normalizeWhitespace('a b c')).toBe('a b c');
  });
});

describe('detectDelimiter', () => {
  it('picks the earliest-occurring candidate delimiter', () => {
    expect(detectDelimiter('a;b,c')).toBe(';');
    expect(detectDelimiter('a b,c')).toBe(' ');
    expect(detectDelimiter('a.b;c')).toBe('.');
  });

  it('falls back to comma when no candidate is found', () => {
    expect(detectDelimiter('abcdef')).toBe(',');
  });
});

describe('splitText', () => {
  it('splits on the given delimiter', () => {
    expect(splitText('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('splits on a multi-character delimiter', () => {
    expect(splitText('a::b::c', '::')).toEqual(['a', 'b', 'c']);
  });

  it('returns the text unsplit for an empty delimiter', () => {
    expect(splitText('abc', '')).toEqual(['abc']);
  });
});
