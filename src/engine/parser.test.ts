import { describe, it, expect } from 'vite-plus/test';
import { parse } from './parser';

describe('parser - sheet references', () => {
  it('parses bare sheet cell reference (Sheet2!A1)', () => {
    const ast = parse('Sheet2!A1');
    expect(ast).toEqual({
      kind: 'SheetCellRef',
      sheetName: 'Sheet2',
      key: 'A1',
    });
  });

  it("parses quoted sheet cell reference ('My Sheet'!A1)", () => {
    const ast = parse("'My Sheet'!A1");
    expect(ast).toEqual({
      kind: 'SheetCellRef',
      sheetName: 'My Sheet',
      key: 'A1',
    });
  });

  it('parses bare sheet range reference (Sheet2!A1:B3)', () => {
    const ast = parse('Sheet2!A1:B3');
    expect(ast).toEqual({
      kind: 'SheetRangeRef',
      sheetName: 'Sheet2',
      start: 'A1',
      end: 'B3',
    });
  });

  it('parses quoted sheet range reference', () => {
    const ast = parse("'My Sheet'!A1:C5");
    expect(ast).toEqual({
      kind: 'SheetRangeRef',
      sheetName: 'My Sheet',
      start: 'A1',
      end: 'C5',
    });
  });

  it('parses sheet reference in binary expression', () => {
    const ast = parse('Sheet1!A1+Sheet2!B2');
    expect(ast).toEqual({
      kind: 'BinaryOp',
      op: '+',
      left: { kind: 'SheetCellRef', sheetName: 'Sheet1', key: 'A1' },
      right: { kind: 'SheetCellRef', sheetName: 'Sheet2', key: 'B2' },
    });
  });

  it('parses sheet reference in function call', () => {
    const ast = parse('SUM(Sheet1!A1:A5)');
    expect(ast).toEqual({
      kind: 'FunctionCall',
      name: 'SUM',
      args: [
        {
          kind: 'SheetRangeRef',
          sheetName: 'Sheet1',
          start: 'A1',
          end: 'A5',
        },
      ],
    });
  });

  it('parses mixed local and sheet references', () => {
    const ast = parse('A1+Sheet2!B1');
    expect(ast).toEqual({
      kind: 'BinaryOp',
      op: '+',
      left: { kind: 'CellRef', key: 'A1' },
      right: { kind: 'SheetCellRef', sheetName: 'Sheet2', key: 'B1' },
    });
  });
});

describe('parser - absolute references ($)', () => {
  it('strips $ markers and produces same AST as relative ref', () => {
    expect(parse('$A$1+B2')).toEqual(parse('A1+B2'));
  });

  it('handles mixed absolute markers', () => {
    expect(parse('$A1+A$1')).toEqual(parse('A1+A1'));
  });

  it('handles $ in sheet references', () => {
    expect(parse('Sheet2!$A$1')).toEqual(parse('Sheet2!A1'));
  });

  it('handles $ in range references', () => {
    expect(parse('SUM($A$1:$B$10)')).toEqual(parse('SUM(A1:B10)'));
  });

  it('does not strip $ inside string literals', () => {
    const ast = parse('"$100"');
    expect(ast).toEqual({ kind: 'StringLiteral', value: '$100' });
  });
});

describe('parser - basic expressions', () => {
  it('parses a number literal', () => {
    const ast = parse('42');
    expect(ast).toEqual({ kind: 'NumberLiteral', value: 42 });
  });

  it('parses a cell reference', () => {
    const ast = parse('A1');
    expect(ast).toEqual({ kind: 'CellRef', key: 'A1' });
  });

  it('parses a range reference', () => {
    const ast = parse('A1:B3');
    expect(ast).toEqual({ kind: 'RangeRef', start: 'A1', end: 'B3' });
  });

  it('parses a binary operation', () => {
    const ast = parse('1+2');
    expect(ast).toEqual({
      kind: 'BinaryOp',
      op: '+',
      left: { kind: 'NumberLiteral', value: 1 },
      right: { kind: 'NumberLiteral', value: 2 },
    });
  });

  it('parses unary minus', () => {
    const ast = parse('-5');
    expect(ast).toEqual({
      kind: 'UnaryOp',
      op: '-',
      operand: { kind: 'NumberLiteral', value: 5 },
    });
  });
});
