import { tokenizeWithSpans, type TokenSpan } from './tokenizer';
import { FormulaSyntaxError } from './syntaxError';
import type { ASTNode, BinaryOperator, ErrorCode, Token } from './types';
import { TokenType } from './types';
import { colLetterToIndex } from '../utils/coordinates';
import type { MessageKey } from '../i18n';
import { t } from '../i18n';

/**
 * Recursive descent parser for spreadsheet formulas.
 *
 * Grammar (from lowest to highest precedence):
 *   expression     -> comparison
 *   comparison     -> concat (( '>' | '<' | '>=' | '<=' | '=' | '<>' ) concat)*
 *   concat         -> additive ( '&' additive )*
 *   additive       -> multiplicative (( '+' | '-' ) multiplicative)*
 *   multiplicative -> power (( '*' | '/' ) power)*
 *   power          -> unary ( '^' unary )*          (left-associative: 2^3^2 = 64)
 *   unary          -> ('-' | '+') unary | postfix    (-2^2 = (-2)^2 = 4)
 *   postfix        -> primary ( '%' )*
 *   primary        -> NUMBER | STRING | BOOLEAN | ERROR | arrayLiteral | functionCall | refs | NamedRef | '(' expression ')'
 *   arrayLiteral   -> '{' row ( ';' row )* '}'
 *   row            -> constant ( ',' constant )*
 *   constant       -> ['-'|'+'] NUMBER | STRING | BOOLEAN | ERROR
 *   argList        -> arg (',' arg)*     // arg is an expression, or empty -> EmptyArg
 */
export function parse(formula: string): ASTNode {
  return parseWithTokens(formula).ast;
}

/** A token plus its character range in the original formula text (`$` markers included). */
export interface SpannedToken extends Token, TokenSpan {}

/**
 * Character range (in the original formula text, end exclusive) each AST node was parsed from.
 * Kept beside the AST rather than on the nodes, so node shapes stay plain for evaluation/tests.
 */
const nodeSpans = new WeakMap<ASTNode, TokenSpan>();

/** Source range of a node produced by parse(); undefined for nodes built elsewhere. */
export function getNodeSpan(node: ASTNode): TokenSpan | undefined {
  return nodeSpans.get(node);
}

/**
 * parse() that also returns the token stream (for tooling such as the AST visualizer).
 * Throws FormulaSyntaxError whose start/end point into `formula` itself.
 */
export function parseWithTokens(formula: string): { ast: ASTNode; tokens: SpannedToken[] } {
  const { text, offsets } = stripAbsoluteMarkers(formula);
  // Map a [start, end) range in the stripped text back onto the original formula. Only `$` markers
  // are ever removed, so a range starts right after the previous kept character: that pulls the `$`
  // of `$A$1` into the reference's range.
  const toOriginal = (span: TokenSpan): TokenSpan => {
    const start = span.start === 0 ? 0 : offsets[span.start - 1] + 1;
    return { start, end: span.end > span.start ? offsets[span.end - 1] + 1 : start };
  };

  let tokenized: ReturnType<typeof tokenizeWithSpans>;
  try {
    tokenized = tokenizeWithSpans(text);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) {
      const span = toOriginal({ start: e.start, end: e.end });
      throw new FormulaSyntaxError(e.message, span.start, span.end);
    }
    throw e;
  }
  const spans = tokenized.spans.map(toOriginal);
  const parser = new Parser(tokenized.tokens, spans, formula);
  const ast = parser.parseExpression();
  parser.expect(TokenType.EOF);
  return { ast, tokens: tokenized.tokens.map((t, i) => ({ ...t, ...spans[i] })) };
}

/**
 * Remove `$` markers from cell references so the tokenizer sees plain refs like A1.
 * Preserves `$` inside string literals ("...") and quoted sheet names ('...').
 * `offsets[i]` is the original index of stripped character i (`offsets[text.length]` = formula length).
 */
function stripAbsoluteMarkers(formula: string): { text: string; offsets: number[] } {
  let text = '';
  const offsets: number[] = [];
  let inDoubleQuote = false;
  let inSingleQuote = false;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i];
    if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (c === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    }
    if (c === '$' && !inDoubleQuote && !inSingleQuote) continue;
    text += c;
    offsets.push(i);
  }
  offsets.push(formula.length);
  return { text, offsets };
}

/** How an expected token reads in an error message. */
const EXPECTED_KEY: Partial<Record<TokenType, MessageKey>> = {
  [TokenType.RightParen]: 'engine.parser.expectedRightParen',
  [TokenType.RightBrace]: 'engine.parser.expectedRightBrace',
  [TokenType.LeftParen]: 'engine.parser.expectedLeftParen',
  [TokenType.CellRef]: 'engine.parser.expectedRangeEndCellRef',
  [TokenType.Number]: 'engine.parser.expectedNumberAfterSign',
};

/** Coordinates parsed from a normalized open-range string like 'A:C', '1:3', or 'A2:C'. */
interface OpenRangeCoords {
  startCol: number;
  startRow: number;
  endCol: number | null;
  endRow: number | null;
}

function parseOpenRangeCoords(rangeStr: string): OpenRangeCoords {
  // Row-full: '1:3'
  const rowFull = /^(\d+):(\d+)$/.exec(rangeStr);
  if (rowFull) {
    return {
      startCol: 0,
      startRow: parseInt(rowFull[1], 10) - 1,
      endCol: null,
      endRow: parseInt(rowFull[2], 10) - 1,
    };
  }
  // Column-full: 'A:C'
  const colFull = /^([A-Z]+):([A-Z]+)$/.exec(rangeStr);
  if (colFull) {
    return {
      startCol: colLetterToIndex(colFull[1]),
      startRow: 0,
      endCol: colLetterToIndex(colFull[2]),
      endRow: null,
    };
  }
  // End-open: 'A2:C' (start has a row, end doesn't)
  const openEnd = /^([A-Z]+)(\d+):([A-Z]+)$/.exec(rangeStr);
  if (openEnd) {
    return {
      startCol: colLetterToIndex(openEnd[1]),
      startRow: parseInt(openEnd[2], 10) - 1,
      endCol: colLetterToIndex(openEnd[3]),
      endRow: null,
    };
  }
  throw new Error(`Invalid open range: ${rangeStr}`);
}

class Parser {
  private tokens: Token[];
  private spans: TokenSpan[];
  private source: string;
  private pos: number;

  constructor(tokens: Token[], spans: TokenSpan[], source: string) {
    this.tokens = tokens;
    this.spans = spans;
    this.source = source;
    this.pos = 0;
  }

  /** Record `node` as spanning from token `startIdx` through the last consumed token. */
  private mark<T extends ASTNode>(node: T, startIdx: number): T {
    const last = Math.max(startIdx, this.pos - 1);
    nodeSpans.set(node, { start: this.spans[startIdx].start, end: this.spans[last].end });
    return node;
  }

  /** Syntax error located at token `index` (the current token by default). */
  private errorAt(message: string, index = this.pos): FormulaSyntaxError {
    const span = this.spans[index];
    return new FormulaSyntaxError(message, span.start, span.end);
  }

  /** Source text of the current token, for messages. */
  private currentText(): string {
    const span = this.spans[this.pos];
    return this.source.slice(span.start, span.end);
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private match(...types: TokenType[]): Token | null {
    if (types.includes(this.peek().type)) {
      return this.advance();
    }
    return null;
  }

  expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      const expectedKey = EXPECTED_KEY[type];
      if (type === TokenType.EOF) {
        throw this.errorAt(t('engine.parser.trailingText', { text: this.currentText() }));
      }
      if (token.type === TokenType.EOF) {
        throw this.errorAt(
          expectedKey
            ? t('engine.parser.unexpectedEndWithExpected', { expected: t(expectedKey) })
            : t('engine.parser.unexpectedEnd'),
        );
      }
      throw this.errorAt(
        expectedKey
          ? t('engine.parser.expectedButFound', {
              expected: t(expectedKey),
              text: this.currentText(),
            })
          : t('engine.parser.unexpectedToken', { text: this.currentText() }),
      );
    }
    return this.advance();
  }

  parseExpression(): ASTNode {
    return this.parseComparison();
  }

  private parseComparison(): ASTNode {
    const startIdx = this.pos;
    let left = this.parseConcat();

    while (true) {
      const token = this.match(
        TokenType.GreaterThan,
        TokenType.LessThan,
        TokenType.GreaterEqual,
        TokenType.LessEqual,
        TokenType.Equal,
        TokenType.NotEqual,
      );
      if (!token) break;

      const right = this.parseConcat();
      left = this.mark(
        {
          kind: 'BinaryOp',
          op: token.value as BinaryOperator,
          left,
          right,
        },
        startIdx,
      );
    }

    return left;
  }

  private parseConcat(): ASTNode {
    const startIdx = this.pos;
    let left = this.parseAdditive();

    while (true) {
      const token = this.match(TokenType.Ampersand);
      if (!token) break;

      const right = this.parseAdditive();
      left = this.mark({ kind: 'BinaryOp', op: '&', left, right }, startIdx);
    }

    return left;
  }

  private parseAdditive(): ASTNode {
    const startIdx = this.pos;
    let left = this.parseMultiplicative();

    while (true) {
      const token = this.match(TokenType.Plus, TokenType.Minus);
      if (!token) break;

      const right = this.parseMultiplicative();
      left = this.mark(
        {
          kind: 'BinaryOp',
          op: token.value as BinaryOperator,
          left,
          right,
        },
        startIdx,
      );
    }

    return left;
  }

  private parseMultiplicative(): ASTNode {
    const startIdx = this.pos;
    let left = this.parsePower();

    while (true) {
      const token = this.match(TokenType.Multiply, TokenType.Divide);
      if (!token) break;

      const right = this.parsePower();
      left = this.mark(
        {
          kind: 'BinaryOp',
          op: token.value as BinaryOperator,
          left,
          right,
        },
        startIdx,
      );
    }

    return left;
  }

  private parsePower(): ASTNode {
    const startIdx = this.pos;
    let left = this.parseUnary();

    while (true) {
      const token = this.match(TokenType.Caret);
      if (!token) break;

      const right = this.parseUnary();
      left = this.mark({ kind: 'BinaryOp', op: '^', left, right }, startIdx);
    }

    return left;
  }

  private parseUnary(): ASTNode {
    const startIdx = this.pos;
    const token = this.match(TokenType.Minus, TokenType.Plus);
    if (token) {
      const operand = this.parseUnary();
      return this.mark({ kind: 'UnaryOp', op: token.value as '-' | '+', operand }, startIdx);
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ASTNode {
    const startIdx = this.pos;
    let node = this.parsePrimary();
    while (this.match(TokenType.Percent)) {
      node = this.mark({ kind: 'UnaryOp', op: '%', operand: node }, startIdx);
    }
    return node;
  }

  private parsePrimary(): ASTNode {
    const startIdx = this.pos;
    const node = this.parsePrimaryNode();
    // A parenthesized expression keeps the span of its inner expression
    if (!nodeSpans.has(node)) this.mark(node, startIdx);
    return node;
  }

  private parsePrimaryNode(): ASTNode {
    const token = this.peek();

    // Number literal
    if (token.type === TokenType.Number) {
      this.advance();
      return { kind: 'NumberLiteral', value: parseFloat(token.value) };
    }

    // String literal
    if (token.type === TokenType.String) {
      this.advance();
      return { kind: 'StringLiteral', value: token.value };
    }

    // Boolean literal
    if (token.type === TokenType.Boolean) {
      this.advance();
      return { kind: 'BooleanLiteral', value: token.value === 'TRUE' };
    }

    // Error literal
    if (token.type === TokenType.ErrorLiteral) {
      this.advance();
      return { kind: 'ErrorLiteral', code: token.value as ErrorCode };
    }

    // Array literal
    if (token.type === TokenType.LeftBrace) {
      return this.parseArrayLiteral();
    }

    // Function call
    if (token.type === TokenType.FunctionName) {
      return this.parseFunctionCall();
    }

    // Sheet cell reference (Sheet2!A1)
    if (token.type === TokenType.SheetCellRef) {
      this.advance();
      const parts = token.value.split('!');
      const sheetName = parts[0];
      const key = parts[1];
      return { kind: 'SheetCellRef', sheetName, key };
    }

    // Sheet range reference (Sheet2!A1:B3)
    if (token.type === TokenType.SheetRangeRef) {
      this.advance();
      const bangIdx = token.value.indexOf('!');
      const sheetName = token.value.substring(0, bangIdx);
      const rangeStr = token.value.substring(bangIdx + 1);
      const colonIdx = rangeStr.indexOf(':');
      const start = rangeStr.substring(0, colonIdx);
      const end = rangeStr.substring(colonIdx + 1);
      return { kind: 'SheetRangeRef', sheetName, start, end };
    }

    // Sheet-qualified column/row-wide/end-open range (Sheet2!A:C, Sheet2!1:3, Sheet2!A2:C)
    if (token.type === TokenType.SheetOpenRangeRef) {
      this.advance();
      const bangIdx = token.value.indexOf('!');
      const sheetName = token.value.substring(0, bangIdx);
      const rangeStr = token.value.substring(bangIdx + 1);
      const coords = parseOpenRangeCoords(rangeStr);
      return { kind: 'OpenRange', sheetName, ...coords };
    }

    // Column-wide / row-wide / end-open range (A:C, 1:3, A2:C)
    if (
      token.type === TokenType.ColRangeRef ||
      token.type === TokenType.RowRangeRef ||
      token.type === TokenType.OpenRangeRef
    ) {
      this.advance();
      const coords = parseOpenRangeCoords(token.value);
      return { kind: 'OpenRange', ...coords };
    }

    // Cell reference (may be part of a range)
    if (token.type === TokenType.CellRef) {
      this.advance();
      const cellKey = token.value;

      // Check for range (A1:B10)
      if (this.peek().type === TokenType.Colon) {
        this.advance(); // consume ':'
        const endToken = this.expect(TokenType.CellRef);
        return {
          kind: 'RangeRef',
          start: cellKey,
          end: endToken.value,
        };
      }

      return { kind: 'CellRef', key: cellKey };
    }

    // Named range reference
    if (token.type === TokenType.NamedRef) {
      this.advance();
      return { kind: 'NamedRef', name: token.value };
    }

    // Parenthesized expression
    if (token.type === TokenType.LeftParen) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RightParen);
      return expr;
    }

    if (token.type === TokenType.EOF) throw this.errorAt(t('engine.parser.unexpectedEnd'));
    throw this.errorAt(t('engine.parser.unexpectedToken', { text: this.currentText() }));
  }

  private parseArrayLiteral(): ASTNode {
    const startIdx = this.pos;
    this.expect(TokenType.LeftBrace);
    const rows: ASTNode[][] = [this.parseArrayRow()];
    while (this.match(TokenType.Semicolon)) {
      rows.push(this.parseArrayRow());
    }
    this.expect(TokenType.RightBrace);

    const cols = rows[0].length;
    for (const row of rows) {
      if (row.length !== cols) {
        const span = { start: this.spans[startIdx].start, end: this.spans[this.pos - 1].end };
        throw new FormulaSyntaxError(
          t('engine.parser.arrayRowLengthMismatch'),
          span.start,
          span.end,
        );
      }
    }

    return { kind: 'ArrayLiteral', rows };
  }

  private parseArrayRow(): ASTNode[] {
    const row: ASTNode[] = [this.parseArrayConstant()];
    while (this.match(TokenType.Comma)) {
      row.push(this.parseArrayConstant());
    }
    return row;
  }

  private parseArrayConstant(): ASTNode {
    const startIdx = this.pos;
    const sign = this.match(TokenType.Minus, TokenType.Plus);
    if (sign) {
      const numToken = this.expect(TokenType.Number);
      const value = parseFloat(numToken.value);
      return this.mark(
        { kind: 'NumberLiteral', value: sign.value === '-' ? -value : value },
        startIdx,
      );
    }

    const token = this.peek();
    if (token.type === TokenType.Number) {
      this.advance();
      return this.mark({ kind: 'NumberLiteral', value: parseFloat(token.value) }, startIdx);
    }
    if (token.type === TokenType.String) {
      this.advance();
      return this.mark({ kind: 'StringLiteral', value: token.value }, startIdx);
    }
    if (token.type === TokenType.Boolean) {
      this.advance();
      return this.mark({ kind: 'BooleanLiteral', value: token.value === 'TRUE' }, startIdx);
    }
    if (token.type === TokenType.ErrorLiteral) {
      this.advance();
      return this.mark({ kind: 'ErrorLiteral', code: token.value as ErrorCode }, startIdx);
    }

    if (token.type === TokenType.EOF)
      throw this.errorAt(
        t('engine.parser.unexpectedEndWithExpected', {
          expected: t('engine.parser.expectedRightBrace'),
        }),
      );
    throw this.errorAt(t('engine.parser.arrayConstantOnly'));
  }

  private parseFunctionCall(): ASTNode {
    const nameToken = this.advance(); // function name
    this.expect(TokenType.LeftParen);

    const args: ASTNode[] = [];
    if (this.peek().type !== TokenType.RightParen) {
      args.push(this.parseArg());
      while (this.match(TokenType.Comma)) {
        args.push(this.parseArg());
      }
    }

    // Another value right after an argument usually means a forgotten ',' (e.g. IF(A1, "a" "b"))
    const next = this.peek().type;
    if (next !== TokenType.RightParen && next !== TokenType.EOF) {
      throw this.errorAt(
        t('engine.parser.expectedButFound', {
          expected: t('engine.parser.expectedCommaOrRightParen'),
          text: this.currentText(),
        }),
      );
    }
    this.expect(TokenType.RightParen);

    return {
      kind: 'FunctionCall',
      name: nameToken.value,
      args,
    };
  }

  /** An argument is an expression, or empty (e.g. the omitted middle argument of `IF(A1,,1)`). */
  private parseArg(): ASTNode {
    if (this.peek().type === TokenType.Comma || this.peek().type === TokenType.RightParen) {
      // Zero-width span just before the separator
      const at = this.spans[this.pos].start;
      const node: ASTNode = { kind: 'EmptyArg' };
      nodeSpans.set(node, { start: at, end: at });
      return node;
    }
    return this.parseExpression();
  }
}
