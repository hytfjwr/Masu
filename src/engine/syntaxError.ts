/**
 * A formula syntax error with the offending character range, so the UI can point at it.
 * `start`/`end` are offsets into the formula text *without* the leading '=' (end exclusive;
 * start === end marks a position between characters, e.g. "the formula ends too early").
 */
export class FormulaSyntaxError extends Error {
  readonly start: number;
  readonly end: number;

  constructor(message: string, start: number, end: number) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.start = start;
    this.end = end;
  }
}
