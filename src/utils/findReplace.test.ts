import { describe, it, expect } from 'vite-plus/test';
import { findMatches, replaceInText } from './findReplace';
import type { FindReplaceOptions, SearchableCell } from './findReplace';

const baseOptions: FindReplaceOptions = {
  caseSensitive: false,
  wholeCell: false,
  useRegex: false,
  searchFormulas: false,
};

function cell(partial: Partial<SearchableCell>): SearchableCell {
  return {
    sheetId: 'sheet1',
    col: 0,
    row: 0,
    cellKey: 'A1',
    displayValue: '',
    rawValue: '',
    isFormula: false,
    ...partial,
  };
}

describe('findMatches', () => {
  it('matches case-insensitively by default', () => {
    const cells = [cell({ cellKey: 'A1', displayValue: 'Hello World' })];
    expect(findMatches(cells, 'hello', baseOptions)).toHaveLength(1);
  });

  it('respects caseSensitive', () => {
    const cells = [cell({ cellKey: 'A1', displayValue: 'Hello World' })];
    expect(findMatches(cells, 'hello', { ...baseOptions, caseSensitive: true })).toHaveLength(0);
    expect(findMatches(cells, 'Hello', { ...baseOptions, caseSensitive: true })).toHaveLength(1);
  });

  it('requires a whole-cell match when wholeCell is set', () => {
    const cells = [
      cell({ cellKey: 'A1', displayValue: 'foobar' }),
      cell({ cellKey: 'A2', displayValue: 'foo' }),
    ];
    const matches = findMatches(cells, 'foo', { ...baseOptions, wholeCell: true });
    expect(matches.map((m) => m.cellKey)).toEqual(['A2']);
  });

  it('supports regex search', () => {
    const cells = [
      cell({ cellKey: 'A1', displayValue: '123' }),
      cell({ cellKey: 'A2', displayValue: 'abc' }),
    ];
    const matches = findMatches(cells, '^\\d+$', { ...baseOptions, useRegex: true });
    expect(matches.map((m) => m.cellKey)).toEqual(['A1']);
  });

  it('treats an invalid regex as no matches instead of throwing', () => {
    const cells = [cell({ cellKey: 'A1', displayValue: 'abc' })];
    expect(findMatches(cells, '(', { ...baseOptions, useRegex: true })).toEqual([]);
  });

  it('searches rawValue (formula text) when searchFormulas is on', () => {
    const cells = [
      cell({ cellKey: 'A1', displayValue: '3', rawValue: '=SUM(A2:A3)', isFormula: true }),
    ];
    expect(findMatches(cells, 'SUM', { ...baseOptions, searchFormulas: false })).toEqual([]);
    const matches = findMatches(cells, 'SUM', { ...baseOptions, searchFormulas: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].isFormula).toBe(true);
  });

  it('returns no matches for an empty query', () => {
    const cells = [cell({ displayValue: 'anything' })];
    expect(findMatches(cells, '', baseOptions)).toEqual([]);
  });
});

describe('replaceInText', () => {
  it('replaces a plain substring, case-insensitively by default', () => {
    expect(replaceInText('Hello World', 'world', 'there', baseOptions)).toBe('Hello there');
  });

  it('replaces all occurrences', () => {
    expect(replaceInText('a-a-a', 'a', 'b', baseOptions)).toBe('b-b-b');
  });

  it('supports $1 back-references in regex mode', () => {
    const result = replaceInText('John Smith', '(\\w+) (\\w+)', '$2 $1', {
      ...baseOptions,
      useRegex: true,
    });
    expect(result).toBe('Smith John');
  });

  it('only replaces the whole cell content when wholeCell is set', () => {
    expect(replaceInText('foobar', 'foo', 'X', { ...baseOptions, wholeCell: true })).toBe('foobar');
    expect(replaceInText('foo', 'foo', 'X', { ...baseOptions, wholeCell: true })).toBe('X');
  });

  it('returns the original text for an empty query', () => {
    expect(replaceInText('abc', '', 'X', baseOptions)).toBe('abc');
  });
});
