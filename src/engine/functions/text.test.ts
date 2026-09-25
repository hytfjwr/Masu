import { describe, it, expect } from 'vite-plus/test';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type { FormulaResult, RangeExpander, SpillResult } from '../types';

const expandRange: RangeExpander = (start: string, end: string): string[] => {
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

function evalFormula(formula: string, cellValues: Record<string, FormulaResult>): FormulaResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  const result = evaluate(ast, resolve, expandRange);
  if (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    result.type === 'spill'
  ) {
    return { type: 'error', code: '#VALUE!' };
  }
  return result as FormulaResult;
}

/** Like evalFormula, but preserves spill results (for SPLIT/TEXTSPLIT/REGEXEXTRACT). */
function evalToSpill(
  formula: string,
  cellValues: Record<string, FormulaResult> = {},
): FormulaResult | SpillResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  return evaluate(ast, resolve, expandRange);
}

describe('TEXTJOIN', () => {
  it('joins text with delimiter', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Hello',
      A2: 'World',
      A3: 'Test',
    };
    expect(evalFormula('TEXTJOIN(",",TRUE,A1:A3)', vals)).toBe('Hello,World,Test');
  });

  it('ignores empty cells when ignore_empty is TRUE', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Hello',
      A3: 'Test',
      // A2 is empty
    };
    expect(evalFormula('TEXTJOIN(",",TRUE,A1:A3)', vals)).toBe('Hello,Test');
  });

  it('includes empty cells when ignore_empty is FALSE', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'Hello',
      A3: 'Test',
    };
    expect(evalFormula('TEXTJOIN(",",FALSE,A1:A3)', vals)).toBe('Hello,,Test');
  });

  it('works with range arguments', () => {
    const vals: Record<string, FormulaResult> = {
      A1: 'A',
      A2: 'B',
      A3: 'C',
    };
    expect(evalFormula('TEXTJOIN("-",TRUE,A1:A3)', vals)).toBe('A-B-C');
  });
});

describe('NUMBERVALUE', () => {
  it('converts a basic numeric string', () => {
    expect(evalFormula('NUMBERVALUE("123")', {})).toBe(123);
  });

  it('converts with custom decimal separator', () => {
    expect(evalFormula('NUMBERVALUE("1.234,56",",",".")', {})).toBe(1234.56);
  });

  it('converts with default separators', () => {
    expect(evalFormula('NUMBERVALUE("1,234.56")', {})).toBe(1234.56);
  });

  it('converts percentage', () => {
    expect(evalFormula('NUMBERVALUE("50%")', {})).toBeCloseTo(0.5);
  });

  it('returns #VALUE! for invalid input', () => {
    expect(evalFormula('NUMBERVALUE("abc")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('returns #VALUE! for empty string', () => {
    expect(evalFormula('NUMBERVALUE("")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('CONCATENATE', () => {
  it('joins scalar arguments', () => {
    expect(evalFormula('CONCATENATE("a","b",1)', {})).toBe('ab1');
  });

  it('concatenates every cell in a range (not just the top-left one)', () => {
    const vals: Record<string, FormulaResult> = { A1: 'x', A2: 'y', A3: 'z' };
    expect(evalFormula('CONCATENATE(A1:A3)', vals)).toBe('xyz');
  });
});

describe('PROPER', () => {
  it('capitalizes each word', () => {
    expect(evalFormula('PROPER("hello world")', {})).toBe('Hello World');
  });

  it('capitalizes after non-letter separators (Excel quirk with apostrophes)', () => {
    expect(evalFormula('PROPER("mcdonald\'s")', {})).toBe("Mcdonald'S");
  });
});

describe('REPLACE', () => {
  it('replaces a substring at a given position', () => {
    expect(evalFormula('REPLACE("abcdef",2,3,"XY")', {})).toBe('aXYef');
  });

  it('returns #VALUE! for an invalid start position', () => {
    expect(evalFormula('REPLACE("abc",0,1,"X")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('SEARCH', () => {
  it('is case-insensitive', () => {
    expect(evalFormula('SEARCH("WORLD","hello world")', {})).toBe(7);
  });

  it('supports wildcards', () => {
    expect(evalFormula('SEARCH("w*d","hello world")', {})).toBe(7);
  });

  it('returns #VALUE! when not found', () => {
    expect(evalFormula('SEARCH("xyz","hello world")', {})).toEqual({
      type: 'error',
      code: '#VALUE!',
    });
  });
});

describe('JOIN', () => {
  it('joins a range with a delimiter', () => {
    const vals: Record<string, FormulaResult> = { A1: 'a', A2: 'b', A3: 'c' };
    expect(evalFormula('JOIN("-",A1:A3)', vals)).toBe('a-b-c');
  });

  it('joins multiple arguments', () => {
    expect(evalFormula('JOIN(",","a","b")', {})).toBe('a,b');
  });
});

describe('REPT / CHAR / CODE / UNICHAR / UNICODE / EXACT / CLEAN', () => {
  it('REPT repeats text', () => {
    expect(evalFormula('REPT("ab",3)', {})).toBe('ababab');
  });

  it('REPT returns #VALUE! for negative counts', () => {
    expect(evalFormula('REPT("a",-1)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('CHAR returns the character for a code', () => {
    expect(evalFormula('CHAR(65)', {})).toBe('A');
  });

  it('CHAR returns #VALUE! out of range', () => {
    expect(evalFormula('CHAR(0)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('CODE returns the code of the first character', () => {
    expect(evalFormula('CODE("A")', {})).toBe(65);
  });

  it('CODE returns #VALUE! for empty text', () => {
    expect(evalFormula('CODE("")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('UNICHAR returns the character for a code point', () => {
    expect(evalFormula('UNICHAR(9731)', {})).toBe('☃');
  });

  it('UNICHAR returns #VALUE! for code point < 1', () => {
    expect(evalFormula('UNICHAR(0)', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('UNICODE returns the code point of the first character', () => {
    expect(evalFormula('UNICODE("☃")', {})).toBe(9731);
  });

  it('UNICODE returns #VALUE! for empty text', () => {
    expect(evalFormula('UNICODE("")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('EXACT is case-sensitive', () => {
    expect(evalFormula('EXACT("Abc","abc")', {})).toBe(false);
    expect(evalFormula('EXACT("Abc","Abc")', {})).toBe(true);
  });

  it('CLEAN removes control characters', () => {
    expect(evalFormula('CLEAN("a" & CHAR(9) & "b")', {})).toBe('ab');
  });

  it('CLEAN leaves normal text unchanged', () => {
    expect(evalFormula('CLEAN("hello")', {})).toBe('hello');
  });
});

describe('T / VALUE / TEXT', () => {
  it('T returns the text as-is', () => {
    expect(evalFormula('T("hello")', {})).toBe('hello');
  });

  it('T returns "" for non-text values', () => {
    expect(evalFormula('T(123)', {})).toBe('');
  });

  it('VALUE converts a numeric string', () => {
    expect(evalFormula('VALUE("123.5")', {})).toBe(123.5);
  });

  it('VALUE returns #VALUE! for non-numeric text', () => {
    expect(evalFormula('VALUE("abc")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('TEXT formats a number with a pattern', () => {
    expect(evalFormula('TEXT(1234.5,"#,##0.00")', {})).toBe('1,234.50');
  });

  it('TEXT coerces a numeric string before formatting', () => {
    expect(evalFormula('TEXT("5","0.00")', {})).toBe('5.00');
  });
});

describe('FIXED / DOLLAR', () => {
  it('FIXED rounds and inserts thousands separators', () => {
    expect(evalFormula('FIXED(1234.567,2)', {})).toBe('1,234.57');
  });

  it('FIXED without commas', () => {
    expect(evalFormula('FIXED(1234.567,1,TRUE)', {})).toBe('1234.6');
  });

  it('DOLLAR formats a positive number with the yen sign', () => {
    expect(evalFormula('DOLLAR(1234,0)', {})).toBe('¥1,234');
  });

  it('DOLLAR formats a negative number', () => {
    expect(evalFormula('DOLLAR(-1234,0)', {})).toBe('-¥1,234');
  });
});

describe('TEXTBEFORE / TEXTAFTER', () => {
  it('TEXTBEFORE returns the text before the delimiter', () => {
    expect(evalFormula('TEXTBEFORE("a-b-c","-")', {})).toBe('a');
  });

  it('TEXTBEFORE supports a negative instance number (from the end)', () => {
    expect(evalFormula('TEXTBEFORE("a-b-c","-",-1)', {})).toBe('a-b');
  });

  it('TEXTBEFORE returns #N/A by default when not found', () => {
    expect(evalFormula('TEXTBEFORE("abc","-")', {})).toEqual({ type: 'error', code: '#N/A' });
  });

  it('TEXTAFTER returns the text after the delimiter', () => {
    expect(evalFormula('TEXTAFTER("a-b-c","-")', {})).toBe('b-c');
  });

  it('TEXTAFTER supports case-insensitive matching', () => {
    expect(evalFormula('TEXTAFTER("hello WORLD","world",1,1)', {})).toBe('');
  });

  it('TEXTAFTER supports a custom if_not_found value', () => {
    expect(evalFormula('TEXTAFTER("abc","-",1,0,0,"none")', {})).toBe('none');
  });
});

describe('SPLIT', () => {
  it('splits text on a delimiter into a horizontal array', () => {
    expect(evalToSpill('SPLIT("a,b,c",",")')).toEqual({ type: 'spill', values: [['a', 'b', 'c']] });
  });

  it('splits on each character of the delimiter when split_by_each is TRUE', () => {
    expect(evalToSpill('SPLIT("a,b;c",",;")')).toEqual({
      type: 'spill',
      values: [['a', 'b', 'c']],
    });
  });

  it('keeps empty segments when remove_empty_text is FALSE', () => {
    expect(evalToSpill('SPLIT("a,,b",",",TRUE,FALSE)')).toEqual({
      type: 'spill',
      values: [['a', '', 'b']],
    });
  });
});

describe('TEXTSPLIT', () => {
  it('splits into a 2D array using row and column delimiters', () => {
    expect(evalToSpill('TEXTSPLIT("a,b;c,d",",",";")')).toEqual({
      type: 'spill',
      values: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
  });

  it('pads ragged rows with pad_with', () => {
    expect(evalToSpill('TEXTSPLIT("a,b;c",",",";",FALSE,0,"-")')).toEqual({
      type: 'spill',
      values: [
        ['a', 'b'],
        ['c', '-'],
      ],
    });
  });
});

describe('REGEXMATCH / REGEXEXTRACT / REGEXREPLACE', () => {
  it('REGEXMATCH tests a pattern', () => {
    expect(evalFormula('REGEXMATCH("hello123","[0-9]+")', {})).toBe(true);
    expect(evalFormula('REGEXMATCH("hello","[0-9]+")', {})).toBe(false);
  });

  it('REGEXEXTRACT returns the whole match when there is no capture group', () => {
    expect(evalFormula('REGEXEXTRACT("hello123","[0-9]+")', {})).toBe('123');
  });

  it('REGEXEXTRACT returns the single capture group', () => {
    expect(evalFormula('REGEXEXTRACT("abc-123","([0-9]+)")', {})).toBe('123');
  });

  it('REGEXEXTRACT returns a horizontal array for multiple capture groups', () => {
    expect(evalToSpill('REGEXEXTRACT("abc-123","([a-z]+)-([0-9]+)")')).toEqual({
      type: 'spill',
      values: [['abc', '123']],
    });
  });

  it('REGEXEXTRACT returns #N/A when there is no match', () => {
    expect(evalFormula('REGEXEXTRACT("abc","[0-9]+")', {})).toEqual({
      type: 'error',
      code: '#N/A',
    });
  });

  it('REGEXREPLACE replaces every match', () => {
    expect(evalFormula('REGEXREPLACE("a1b2c3","[0-9]","-")', {})).toBe('a-b-c-');
  });

  it('invalid regular expressions return #VALUE!', () => {
    expect(evalFormula('REGEXMATCH("abc","(")', {})).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('ASC / JIS', () => {
  it('ASC converts full-width ASCII and katakana to half-width', () => {
    expect(evalFormula('ASC("ＡＢＣ１２３")', {})).toBe('ABC123');
  });

  it('ASC converts voiced katakana to a half-width base + dakuten', () => {
    expect(evalFormula('ASC("ガ")', {})).toBe('ｶﾞ');
  });

  it('JIS converts half-width ASCII and katakana to full-width', () => {
    expect(evalFormula('JIS("ABC123")', {})).toBe('ＡＢＣ１２３');
  });

  it('JIS converts a half-width base + dakuten back to voiced katakana', () => {
    expect(evalFormula('JIS("ｶﾞ")', {})).toBe('ガ');
  });
});
