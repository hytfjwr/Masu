import { describe, it, expect } from 'vite-plus/test';
import { tokenize } from './tokenizer';
import { TokenType } from './types';

describe('Tokenizer - dotted identifiers', () => {
  it('tokenizes dotted function names', () => {
    expect(tokenize('STDEV.S(A1:A3)')[0]).toEqual({
      type: TokenType.FunctionName,
      value: 'STDEV.S',
    });
    expect(tokenize('NORM.S.DIST(1,TRUE)')[0]).toEqual({
      type: TokenType.FunctionName,
      value: 'NORM.S.DIST',
    });
  });

  it('keeps cell refs and decimals intact', () => {
    const tokens = tokenize('A1+.5');
    expect(tokens[0]).toEqual({ type: TokenType.CellRef, value: 'A1' });
    expect(tokens[2]).toEqual({ type: TokenType.Number, value: '.5' });
  });
});
