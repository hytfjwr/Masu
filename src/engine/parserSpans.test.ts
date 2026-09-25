import { describe, it, expect } from 'vitest';
import { getNodeSpan, parse, parseWithTokens } from './parser';
import { FormulaSyntaxError } from './syntaxError';
import type { ASTNode } from './types';

/** Catch the FormulaSyntaxError thrown for `formula`. */
function syntaxErrorOf(formula: string): FormulaSyntaxError {
  try {
    parse(formula);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return e;
    throw e;
  }
  throw new Error(`expected ${formula} to fail`);
}

const slice = (formula: string, node: ASTNode) => {
  const span = getNodeSpan(node)!;
  return formula.slice(span.start, span.end);
};

describe('parser source spans', () => {
  it("records each node's range in the original text, $ markers included", () => {
    const f = 'SUM($A$1:A3)*-2^2%';
    const ast = parse(f);
    expect(slice(f, ast)).toBe(f);
    if (ast.kind !== 'BinaryOp') throw new Error('expected BinaryOp');
    expect(slice(f, ast.left)).toBe('SUM($A$1:A3)');
    if (ast.left.kind !== 'FunctionCall') throw new Error('expected FunctionCall');
    expect(slice(f, ast.left.args[0])).toBe('$A$1:A3');
    expect(slice(f, ast.right)).toBe('-2^2%');
  });

  it('gives omitted arguments a zero-width span before the separator', () => {
    const ast = parse('IF(A1,,1)');
    if (ast.kind !== 'FunctionCall') throw new Error('expected FunctionCall');
    expect(getNodeSpan(ast.args[1])).toEqual({ start: 6, end: 6 });
  });

  it('returns the token stream with original-text ranges', () => {
    const { tokens } = parseWithTokens('$B$2 + 1');
    expect(tokens.map((t) => [t.value, t.start, t.end])).toEqual([
      ['B2', 0, 4],
      ['+', 5, 6],
      ['1', 7, 8],
      ['', 8, 8],
    ]);
  });
});

describe('parser syntax errors carry a message and position', () => {
  it.each([
    ['SUM(A1', "式が途中で終わっています（')' が必要です）", 6, 6],
    ['1+*2', 'ここに * は置けません', 2, 3],
    ['"abc', '文字列が閉じられていません（" が必要です）', 0, 4],
    ['A1 B1', '余分な記述があります: B1', 3, 5],
    ['$A$1+@', '使用できない文字です: @', 5, 6],
    ['{1,2;3}', '配列の各行の要素数が揃っていません', 0, 7],
    ['A1:+', '範囲の終点にはセル参照が必要です（+ があります）', 3, 4],
    ['#FOO', '不明なエラー値です: #FOO', 0, 4],
    ['IF(A1>0, "ok" "ng")', `',' か ')' が必要です（"ng" があります）`, 14, 18],
  ])('%s', (formula, message, start, end) => {
    const e = syntaxErrorOf(formula);
    expect(e.message).toBe(message);
    expect([e.start, e.end]).toEqual([start, end]);
  });
});
