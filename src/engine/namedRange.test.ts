import { describe, it, expect } from 'vite-plus/test';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { evaluate, extractDependencies } from './evaluator';
import { TokenType } from './types';
import type { FormulaResult, NamedRangeResolver, RangeExpander } from './types';

const expandRange: RangeExpander = (start: string, end: string): string[] => {
  // Simple single-column range expander for testing
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

describe('Named Range - Tokenizer', () => {
  it('tokenizes a Japanese name as NamedRef', () => {
    const tokens = tokenize('月次売上');
    expect(tokens[0]).toEqual({ type: TokenType.NamedRef, value: '月次売上' });
    expect(tokens[1].type).toBe(TokenType.EOF);
  });

  it('tokenizes an English name as NamedRef', () => {
    const tokens = tokenize('SalesData');
    // SalesData is not followed by '(' so it should be NamedRef (not a cell ref, not a function)
    expect(tokens[0]).toEqual({ type: TokenType.NamedRef, value: 'SalesData' });
  });

  it('tokenizes underscore-prefixed name as NamedRef', () => {
    const tokens = tokenize('_myRange');
    expect(tokens[0]).toEqual({ type: TokenType.NamedRef, value: '_myRange' });
  });

  it('distinguishes cell reference from named ref (AA1 is a cell ref)', () => {
    const tokens = tokenize('AA1');
    expect(tokens[0].type).toBe(TokenType.CellRef);
    expect(tokens[0].value).toBe('AA1');
  });

  it('treats AZ100 as a cell reference', () => {
    const tokens = tokenize('AZ100');
    expect(tokens[0].type).toBe(TokenType.CellRef);
    expect(tokens[0].value).toBe('AZ100');
  });

  it('treats ZZ99 as a cell reference', () => {
    const tokens = tokenize('ZZ99');
    expect(tokens[0].type).toBe(TokenType.CellRef);
    expect(tokens[0].value).toBe('ZZ99');
  });

  it('treats A as NamedRef (not a cell ref)', () => {
    const tokens = tokenize('A');
    // 'A' has no digits following it, so it's a NamedRef
    expect(tokens[0].type).toBe(TokenType.NamedRef);
  });

  it('tokenizes named ref in a formula', () => {
    const tokens = tokenize('SUM(売上データ)');
    expect(tokens[0]).toEqual({ type: TokenType.FunctionName, value: 'SUM' });
    expect(tokens[1]).toEqual({ type: TokenType.LeftParen, value: '(' });
    expect(tokens[2]).toEqual({ type: TokenType.NamedRef, value: '売上データ' });
    expect(tokens[3]).toEqual({ type: TokenType.RightParen, value: ')' });
  });
});

describe('Named Range - Parser', () => {
  it('parses a NamedRef into NamedRefNode', () => {
    const ast = parse('売上データ');
    expect(ast).toEqual({ kind: 'NamedRef', name: '売上データ' });
  });

  it('parses NamedRef as function argument', () => {
    const ast = parse('SUM(売上データ)');
    expect(ast).toEqual({
      kind: 'FunctionCall',
      name: 'SUM',
      args: [{ kind: 'NamedRef', name: '売上データ' }],
    });
  });
});

describe('Named Range - Evaluator', () => {
  const cellValues: Record<string, FormulaResult> = {
    A1: 10,
    A2: 20,
    A3: 30,
    B1: 100,
  };

  const resolve = (key: string): FormulaResult => {
    return cellValues[key] ?? '';
  };

  const resolveNamedRange: NamedRangeResolver = (name: string) => {
    if (name === '売上データ') return { keys: ['A1', 'A2', 'A3'] };
    if (name === '単一セル') return { keys: ['B1'] };
    return undefined;
  };

  it('evaluates =SUM(売上データ) correctly', () => {
    const ast = parse('SUM(売上データ)');
    const result = evaluate(ast, resolve, expandRange, undefined, resolveNamedRange);
    expect(result).toBe(60);
  });

  it('evaluates =AVERAGE(売上データ) correctly', () => {
    const ast = parse('AVERAGE(売上データ)');
    const result = evaluate(ast, resolve, expandRange, undefined, resolveNamedRange);
    expect(result).toBe(20);
  });

  it('evaluates a single-cell named range standalone', () => {
    const ast = parse('単一セル');
    const result = evaluate(ast, resolve, expandRange, undefined, resolveNamedRange);
    expect(result).toBe(100);
  });

  it('spills a multi-cell named range used standalone', () => {
    // A multi-cell named range referenced standalone now spills, like a bare `=A1:A3` range.
    const ast = parse('売上データ');
    const result = evaluate(ast, resolve, expandRange, undefined, resolveNamedRange);
    expect(result).toEqual({ type: 'spill', values: [[10], [20], [30]] });
  });

  it('returns #NAME? for undefined named range', () => {
    const ast = parse('存在しない名前');
    const result = evaluate(ast, resolve, expandRange, undefined, resolveNamedRange);
    expect(result).toEqual({ type: 'error', code: '#NAME?' });
  });

  it('returns #NAME? when no resolveNamedRange is provided', () => {
    const ast = parse('売上データ');
    const result = evaluate(ast, resolve, expandRange, undefined, undefined);
    expect(result).toEqual({ type: 'error', code: '#NAME?' });
  });
});

describe('Named Range - Dependencies', () => {
  const resolveNamedRange: NamedRangeResolver = (name: string) => {
    if (name === '売上データ') return { keys: ['A1', 'A2', 'A3'] };
    return undefined;
  };

  it('extracts dependencies from named range in formula', () => {
    const ast = parse('SUM(売上データ)');
    const deps = extractDependencies(ast, expandRange, undefined, resolveNamedRange);
    expect(deps).toEqual(expect.arrayContaining(['A1', 'A2', 'A3']));
    expect(deps).toHaveLength(3);
  });

  it('returns no deps for undefined named range', () => {
    const ast = parse('SUM(未定義)');
    const deps = extractDependencies(ast, expandRange, undefined, resolveNamedRange);
    expect(deps).toHaveLength(0);
  });
});

describe('Named Range - Name Validation', () => {
  // These tests validate the rules; actual validation is in useGridData but we test the patterns
  it('cell reference patterns should not be named ranges', () => {
    // A1, B99, AA1 are cell refs
    expect(tokenize('A1')[0].type).toBe(TokenType.CellRef);
    expect(tokenize('B99')[0].type).toBe(TokenType.CellRef);
    expect(tokenize('AA1')[0].type).toBe(TokenType.CellRef);
  });

  it('TRUE/FALSE are boolean literals, not named refs', () => {
    expect(tokenize('TRUE')[0].type).toBe(TokenType.Boolean);
    expect(tokenize('FALSE')[0].type).toBe(TokenType.Boolean);
  });
});
