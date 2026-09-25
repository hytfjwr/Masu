import { describe, it, expect } from 'vite-plus/test';
import { tokenize } from './tokenizer';
import { TokenType } from './types';
import { FormulaSyntaxError } from './syntaxError';

describe('tokenizer - sheet references', () => {
  it('tokenizes bare sheet cell reference (Sheet2!A1)', () => {
    const tokens = tokenize('Sheet2!A1');
    expect(tokens[0]).toEqual({ type: TokenType.SheetCellRef, value: 'Sheet2!A1' });
    expect(tokens[1].type).toBe(TokenType.EOF);
  });

  it('tokenizes bare sheet cell reference case-insensitively for cell part', () => {
    const tokens = tokenize('Sheet2!a1');
    expect(tokens[0]).toEqual({ type: TokenType.SheetCellRef, value: 'Sheet2!A1' });
  });

  it("tokenizes quoted sheet cell reference ('My Sheet'!A1)", () => {
    const tokens = tokenize("'My Sheet'!A1");
    expect(tokens[0]).toEqual({ type: TokenType.SheetCellRef, value: 'My Sheet!A1' });
  });

  it('tokenizes bare sheet range reference (Sheet2!A1:B3)', () => {
    const tokens = tokenize('Sheet2!A1:B3');
    expect(tokens[0]).toEqual({ type: TokenType.SheetRangeRef, value: 'Sheet2!A1:B3' });
    expect(tokens[1].type).toBe(TokenType.EOF);
  });

  it("tokenizes quoted sheet range reference ('My Sheet'!A1:B3)", () => {
    const tokens = tokenize("'My Sheet'!A1:B3");
    expect(tokens[0]).toEqual({ type: TokenType.SheetRangeRef, value: 'My Sheet!A1:B3' });
  });

  it('tokenizes sheet reference in a formula expression', () => {
    const tokens = tokenize('Sheet1!A1+Sheet2!B2');
    expect(tokens[0]).toEqual({ type: TokenType.SheetCellRef, value: 'Sheet1!A1' });
    expect(tokens[1]).toEqual({ type: TokenType.Plus, value: '+' });
    expect(tokens[2]).toEqual({ type: TokenType.SheetCellRef, value: 'Sheet2!B2' });
    expect(tokens[3].type).toBe(TokenType.EOF);
  });

  it('throws on unterminated quoted sheet name', () => {
    expect(() => tokenize("'OpenQuote!A1")).toThrow(
      new FormulaSyntaxError("シート名が閉じられていません（' が必要です）", 0, 13),
    );
  });

  it('throws on quoted sheet name without ! separator', () => {
    expect(() => tokenize("'Sheet'A1")).toThrow('シート名の後に ! が必要です');
  });

  it('throws on invalid cell reference after sheet name', () => {
    expect(() => tokenize('Sheet2!XYZ')).toThrow('シート名の後のセル参照が正しくありません: XYZ');
  });

  it('tokenizes sheet reference with underscored sheet name', () => {
    const tokens = tokenize('My_Sheet!C5');
    expect(tokens[0]).toEqual({ type: TokenType.SheetCellRef, value: 'My_Sheet!C5' });
  });
});

describe('tokenizer - basic tokens', () => {
  it('tokenizes a simple cell reference', () => {
    const tokens = tokenize('A1');
    expect(tokens[0]).toEqual({ type: TokenType.CellRef, value: 'A1' });
  });

  it('tokenizes a range reference', () => {
    const tokens = tokenize('SUM(A1:B3)');
    expect(tokens[0]).toEqual({ type: TokenType.FunctionName, value: 'SUM' });
    expect(tokens[1]).toEqual({ type: TokenType.LeftParen, value: '(' });
    expect(tokens[2]).toEqual({ type: TokenType.CellRef, value: 'A1' });
    expect(tokens[3]).toEqual({ type: TokenType.Colon, value: ':' });
    expect(tokens[4]).toEqual({ type: TokenType.CellRef, value: 'B3' });
    expect(tokens[5]).toEqual({ type: TokenType.RightParen, value: ')' });
  });

  it('tokenizes boolean literals', () => {
    const tokens = tokenize('TRUE');
    expect(tokens[0]).toEqual({ type: TokenType.Boolean, value: 'TRUE' });
  });
});
