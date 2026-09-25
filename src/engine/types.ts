// ============================================================
// Token types for the formula tokenizer
// ============================================================

export const TokenType = {
  Number: 'Number',
  String: 'String',
  Boolean: 'Boolean',
  CellRef: 'CellRef',
  RangeRef: 'RangeRef',
  SheetCellRef: 'SheetCellRef',
  SheetRangeRef: 'SheetRangeRef',
  FunctionName: 'FunctionName',
  NamedRef: 'NamedRef',
  Plus: 'Plus',
  Minus: 'Minus',
  Multiply: 'Multiply',
  Divide: 'Divide',
  Ampersand: 'Ampersand',
  Caret: 'Caret',
  Percent: 'Percent',
  LeftBrace: 'LeftBrace',
  RightBrace: 'RightBrace',
  Semicolon: 'Semicolon',
  ErrorLiteral: 'ErrorLiteral',
  ColRangeRef: 'ColRangeRef',
  RowRangeRef: 'RowRangeRef',
  OpenRangeRef: 'OpenRangeRef',
  SheetOpenRangeRef: 'SheetOpenRangeRef',
  GreaterThan: 'GreaterThan',
  LessThan: 'LessThan',
  GreaterEqual: 'GreaterEqual',
  LessEqual: 'LessEqual',
  Equal: 'Equal',
  NotEqual: 'NotEqual',
  LeftParen: 'LeftParen',
  RightParen: 'RightParen',
  Comma: 'Comma',
  Colon: 'Colon',
  EOF: 'EOF',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  value: string;
}

// ============================================================
// AST node types for the formula parser
// ============================================================

export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ErrorLiteralNode
  | ArrayLiteralNode
  | EmptyArgNode
  | CellRefNode
  | RangeRefNode
  | SheetCellRefNode
  | SheetRangeRefNode
  | OpenRangeNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | NamedRefNode;

export interface NamedRefNode {
  kind: 'NamedRef';
  name: string;
}

export interface NumberLiteral {
  kind: 'NumberLiteral';
  value: number;
}

export interface StringLiteral {
  kind: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral {
  kind: 'BooleanLiteral';
  value: boolean;
}

export interface ErrorLiteralNode {
  kind: 'ErrorLiteral';
  code: ErrorCode;
}

/** Array literal `{1,2;3,4}`. Rows are ragged only during parse validation; each row's elements are constant nodes. */
export interface ArrayLiteralNode {
  kind: 'ArrayLiteral';
  rows: ASTNode[][];
}

/** An omitted function argument, e.g. the middle argument of `IF(A1,,1)`. */
export interface EmptyArgNode {
  kind: 'EmptyArg';
}

export interface CellRefNode {
  kind: 'CellRef';
  key: string; // Normalized, e.g. "A1"
}

export interface RangeRefNode {
  kind: 'RangeRef';
  start: string; // e.g. "A1"
  end: string; // e.g. "B10"
}

export interface SheetCellRefNode {
  kind: 'SheetCellRef';
  sheetName: string; // e.g. "Sheet2"
  key: string; // e.g. "A1"
}

export interface SheetRangeRefNode {
  kind: 'SheetRangeRef';
  sheetName: string; // e.g. "Sheet2"
  start: string; // e.g. "A1"
  end: string; // e.g. "B10"
}

/**
 * A column-full, row-full, or end-open range reference (e.g. `A:C`, `1:3`, `A2:C`).
 * 0-indexed. `null` means "to the end of the used range".
 */
export interface OpenRangeNode {
  kind: 'OpenRange';
  sheetName?: string;
  startCol: number;
  startRow: number;
  endCol: number | null;
  endRow: number | null;
}

export type BinaryOperator = '+' | '-' | '*' | '/' | '&' | '^' | '>' | '<' | '>=' | '<=' | '=' | '<>';

export interface BinaryOpNode {
  kind: 'BinaryOp';
  op: BinaryOperator;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  kind: 'UnaryOp';
  op: '-' | '+' | '%';
  operand: ASTNode;
}

export interface FunctionCallNode {
  kind: 'FunctionCall';
  name: string; // Uppercase, e.g. "SUM"
  args: ASTNode[];
}

// ============================================================
// Evaluation result types
// ============================================================

export type ErrorCode =
  | '#VALUE!'
  | '#DIV/0!'
  | '#REF!'
  | '#NAME?'
  | '#NUM!'
  | '#N/A'
  | '#ERROR!'
  | '#SPILL!'
  | '#NULL!'
  | '#CALC!';

export interface FormulaError {
  type: 'error';
  code: ErrorCode;
}

/** The result of evaluating a formula expression */
export type FormulaValue = number | string | boolean;
export type FormulaResult = FormulaValue | FormulaError;

/** Spill result for array functions */
export interface SpillResult {
  type: 'spill';
  values: FormulaResult[][]; // [row][col] 2D array
}

export function isSpillResult(val: unknown): val is SpillResult {
  return typeof val === 'object' && val !== null && (val as SpillResult).type === 'spill';
}

/** Return type for function implementations (scalar or spill) */
export type FunctionReturnValue = FormulaResult | SpillResult;

export function isFormulaError(val: unknown): val is FormulaError {
  return typeof val === 'object' && val !== null && (val as FormulaError).type === 'error';
}

export function makeError(code: ErrorCode): FormulaError {
  return { type: 'error', code };
}

/** A user-defined function value produced by LAMBDA (optionally bound via LET). */
export interface LambdaValue {
  type: 'lambda';
  params: string[]; // Uppercased parameter names
  body: ASTNode;
  closure: Map<string, EvalValue>; // LET/LAMBDA binding scope (keys uppercased)
}

export function isLambdaValue(v: unknown): v is LambdaValue {
  return typeof v === 'object' && v !== null && (v as LambdaValue).type === 'lambda';
}

/** The value that flows through evaluation. Only FormulaResult / SpillResult are ever stored in a cell. */
export type EvalValue = FormulaResult | SpillResult | LambdaValue;

// ============================================================
// Function registry types
// ============================================================

/**
 * A function that can resolve a cell reference to its evaluated value.
 */
export type CellValueResolver = (key: string) => FormulaResult;

/**
 * A function that expands a range reference into an array of cell keys.
 */
export type RangeExpander = (startKey: string, endKey: string) => string[];

/**
 * Resolves a sheet name to a sheet ID. Returns undefined if the sheet doesn't exist.
 */
export type SheetNameResolver = (sheetName: string) => string | undefined;

/**
 * Resolves a named range name to its cell keys and optional sheet ID.
 */
export type NamedRangeResolver = (name: string) => { keys: string[]; sheetId?: string } | undefined;

/**
 * Context passed to built-in function implementations.
 */
export interface FunctionContext {
  resolve: CellValueResolver;
  expandRange: RangeExpander;
  resolveSheetName?: SheetNameResolver;
  resolveNamedRange?: NamedRangeResolver;
  setHyperlinkMeta?: (url: string, label: string) => void;
  /** Bounds of the used range, for resolving column/row-wide references. sheetId omitted = evaluating sheet. */
  getSheetBounds?: (sheetId?: string) => { rows: number; cols: number };
  /** The cell currently being evaluated (for zero-arg ROW()/COLUMN()). 0-indexed. */
  currentCell?: { col: number; row: number; sheetId?: string };
  /** See EvaluateOptions.rangeCache. Values are frozen: never mutate grids obtained from argToGrid. */
  rangeCache?: Map<string, FormulaResult[][]>;
  /** See EvaluateOptions.callCache. */
  callCache?: Map<string, FunctionReturnValue>;
  /** See EvaluateOptions.passStats. */
  passStats?: PassCacheStats;
  /** Evaluate an AST node to an EvalValue, optionally within a child scope. Always set by the evaluator. */
  evalNode?: (node: ASTNode, scope?: Map<string, EvalValue>) => EvalValue;
  /** Invoke a LambdaValue with the given arguments. Always set by the evaluator. */
  callLambda?: (fn: LambdaValue, args: EvalValue[]) => EvalValue;
  /** The current LET/LAMBDA binding scope. */
  scope?: Map<string, EvalValue>;
}

/**
 * Each argument to a function can be a scalar value, a cell range, an array
 * (literal or the result of a nested function/array operation), a lambda, or omitted.
 */
export type FunctionArgValue =
  | { kind: 'value'; value: FormulaResult }
  | {
      kind: 'range';
      keys: string[]; // Row-major. Local 'A1' or 'sheetId:A1'
      rows: number;
      cols: number;
      startRow: number; // 0-indexed
      startCol: number;
      sheetId?: string; // Set when referencing another sheet
    }
  | { kind: 'array'; values: FormulaResult[][] }
  | { kind: 'lambda'; lambda: LambdaValue }
  | { kind: 'omitted' };

/**
 * A built-in function implementation.
 * Receives raw AST args and a context for resolving references.
 * May return a SpillResult for array functions.
 */
export type FunctionImplementation = (
  args: FunctionArgValue[],
  ctx: FunctionContext,
) => FunctionReturnValue;

/**
 * Metadata for a built-in function (used for autocomplete).
 */
export interface FunctionMeta {
  name: string;
  signature: string;
  description: string;
  impl: FunctionImplementation;
  /** true: treat all arguments as scalars, broadcasting element-wise over arrays/multi-cell ranges. */
  lift?: boolean;
  /** Argument indices (0-based) excluded from lift broadcasting (kept as range/array). */
  liftExclude?: number[];
  /** Volatile functions (TODAY, NOW, RAND, RANDBETWEEN, OFFSET, INDIRECT) recalculate on every edit. */
  volatile?: boolean;
  /** Lazy-evaluation special form. When set, called instead of impl. */
  special?: (argNodes: ASTNode[], ctx: FunctionContext) => EvalValue;
}

// ============================================================
// Evaluator options
// ============================================================

export interface EvaluateOptions {
  getSheetBounds?: (sheetId?: string) => { rows: number; cols: number };
  currentCell?: { col: number; row: number; sheetId?: string };
  /**
   * Resolved-range cache shared by several evaluate() calls (e.g. one recalculation pass, where the
   * topological order guarantees a range's contents are final before any formula reads it).
   * When omitted, a fresh cache is used for this single evaluation.
   */
  rangeCache?: Map<string, FormulaResult[][]>;
  /**
   * Memo of pure function calls keyed by function name + argument identity (same lifetime rules as
   * rangeCache): 3000 × SUM(A:A) in one pass computes the sum once.
   */
  callCache?: Map<string, FunctionReturnValue>;
  /** Hit/miss counters for the two caches above; only set while the recalculation profiler records. */
  passStats?: PassCacheStats;
}

/** Cache effectiveness counters of one recalculation pass (developer tooling). */
export interface PassCacheStats {
  callHits: number;
  callMisses: number;
  rangeHits: number;
  rangeMisses: number;
}
