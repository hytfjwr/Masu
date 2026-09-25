import type {
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
  FunctionReturnValue,
} from '../types';
import { isFormulaError, makeError } from '../types';
import { argToFlat, makeSpill, resolveNumber, resolveScalar, resolveString } from './helpers';
import { toBoolean } from '../coerce';
import { parseUserInput } from '../../utils/valueParser';
import { formatWithPattern } from '../../utils/numberFormat';

// ============================================================
// CONCAT
// ============================================================
const CONCAT: FunctionMeta = {
  name: 'CONCAT',
  signature: 'CONCAT(text1, [text2], ...)',
  description: 'Joins several text strings into one text string',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');

    let result = '';
    for (const arg of args) {
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (isFormulaError(val)) return val;
          result += String(typeof val === 'boolean' ? (val ? 'TRUE' : 'FALSE') : val);
        }
      } else {
        const str = resolveString(arg, ctx);
        if (isFormulaError(str)) return str;
        result += str;
      }
    }
    return result;
  },
};

// ============================================================
// CONCATENATE (Google Sheets/Excel compatible: ranges concatenate every cell,
// not just the top-left one — same behavior as CONCAT)
// ============================================================
const CONCATENATE: FunctionMeta = {
  name: 'CONCATENATE',
  signature: 'CONCATENATE(text1, [text2], ...)',
  description: '複数の文字列を1つの文字列に連結します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    return CONCAT.impl(args, ctx);
  },
};

// ============================================================
// LEN
// ============================================================
const LEN: FunctionMeta = {
  name: 'LEN',
  signature: 'LEN(text)',
  description: 'Returns the number of characters in a text string',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return str.length;
  },
};

// ============================================================
// UPPER
// ============================================================
const UPPER: FunctionMeta = {
  name: 'UPPER',
  signature: 'UPPER(text)',
  description: 'Converts text to uppercase',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return str.toUpperCase();
  },
};

// ============================================================
// LOWER
// ============================================================
const LOWER: FunctionMeta = {
  name: 'LOWER',
  signature: 'LOWER(text)',
  description: 'Converts text to lowercase',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return str.toLowerCase();
  },
};

// ============================================================
// PROPER
// ============================================================
const PROPER: FunctionMeta = {
  name: 'PROPER',
  signature: 'PROPER(text)',
  description: '各単語の先頭文字を大文字に、それ以外を小文字に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return str.replace(/[A-Za-z]+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  },
};

// ============================================================
// LEFT
// ============================================================
const LEFT: FunctionMeta = {
  name: 'LEFT',
  signature: 'LEFT(text, [num_chars])',
  description: 'Returns the leftmost characters from a text value',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;

    let n = 1; // default
    if (args.length === 2) {
      const numVal = resolveNumber(args[1], ctx);
      if (isFormulaError(numVal)) return numVal;
      n = Math.trunc(numVal);
      if (n < 0) return makeError('#VALUE!');
    }
    return str.substring(0, n);
  },
};

// ============================================================
// RIGHT
// ============================================================
const RIGHT: FunctionMeta = {
  name: 'RIGHT',
  signature: 'RIGHT(text, [num_chars])',
  description: 'Returns the rightmost characters from a text value',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;

    let n = 1; // default
    if (args.length === 2) {
      const numVal = resolveNumber(args[1], ctx);
      if (isFormulaError(numVal)) return numVal;
      n = Math.trunc(numVal);
      if (n < 0) return makeError('#VALUE!');
    }
    return str.substring(Math.max(0, str.length - n));
  },
};

// ============================================================
// TRIM
// ============================================================
const TRIM: FunctionMeta = {
  name: 'TRIM',
  signature: 'TRIM(text)',
  description: 'Removes extra spaces from text',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return str.trim();
  },
};

// ============================================================
// SUBSTITUTE
// ============================================================
const SUBSTITUTE: FunctionMeta = {
  name: 'SUBSTITUTE',
  signature: 'SUBSTITUTE(text, old_text, new_text)',
  description: 'Substitutes new_text for old_text in a text string',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');

    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;

    const oldText = resolveString(args[1], ctx);
    if (isFormulaError(oldText)) return oldText;

    const newText = resolveString(args[2], ctx);
    if (isFormulaError(newText)) return newText;

    // Replace all occurrences
    return text.split(oldText).join(newText);
  },
};

// ============================================================
// REPLACE
// ============================================================
const REPLACE: FunctionMeta = {
  name: 'REPLACE',
  signature: 'REPLACE(old_text, start_num, num_chars, new_text)',
  description: '指定した位置から指定した文字数の文字列を新しい文字列に置き換えます',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 4) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const startNum = resolveNumber(args[1], ctx);
    if (isFormulaError(startNum)) return startNum;
    const numChars = resolveNumber(args[2], ctx);
    if (isFormulaError(numChars)) return numChars;
    const newText = resolveString(args[3], ctx);
    if (isFormulaError(newText)) return newText;

    const start = Math.trunc(startNum);
    const count = Math.trunc(numChars);
    if (start < 1 || count < 0) return makeError('#VALUE!');
    const idx = start - 1;
    return text.slice(0, idx) + newText + text.slice(idx + count);
  },
};

// ============================================================
// MID
// ============================================================
const MID: FunctionMeta = {
  name: 'MID',
  signature: 'MID(text, start_num, num_chars)',
  description: 'Returns a specific number of characters from a text string, starting at the position you specify',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    const start = resolveNumber(args[1], ctx);
    if (isFormulaError(start)) return start;
    const numChars = resolveNumber(args[2], ctx);
    if (isFormulaError(numChars)) return numChars;
    if (start < 1 || numChars < 0) return makeError('#VALUE!');
    return str.substring(Math.trunc(start) - 1, Math.trunc(start) - 1 + Math.trunc(numChars));
  },
};

// ============================================================
// FIND
// ============================================================
const FIND: FunctionMeta = {
  name: 'FIND',
  signature: 'FIND(find_text, within_text, [start_num])',
  description: 'Finds one text string within another (case-sensitive)',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const findText = resolveString(args[0], ctx);
    if (isFormulaError(findText)) return findText;
    const withinText = resolveString(args[1], ctx);
    if (isFormulaError(withinText)) return withinText;

    let startNum = 1;
    if (args.length === 3) {
      const s = resolveNumber(args[2], ctx);
      if (isFormulaError(s)) return s;
      startNum = Math.trunc(s);
      if (startNum < 1) return makeError('#VALUE!');
    }

    const index = withinText.indexOf(findText, startNum - 1);
    if (index === -1) return makeError('#VALUE!');
    return index + 1; // 1-based
  },
};

// ============================================================
// Shared regex helpers (SEARCH wildcards, SPLIT/TEXTSPLIT delimiters)
// ============================================================
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a case-insensitive matcher for SEARCH's wildcard syntax: `*`, `?`, and `~*`/`~?`/`~~` escapes. */
function buildSearchRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '~' && i + 1 < pattern.length && (pattern[i + 1] === '*' || pattern[i + 1] === '?' || pattern[i + 1] === '~')) {
      out += escapeRegExp(pattern[i + 1]);
      i++;
      continue;
    }
    if (c === '*') { out += '.*'; continue; }
    if (c === '?') { out += '.'; continue; }
    out += escapeRegExp(c);
  }
  return new RegExp(out, 'i');
}

// ============================================================
// SEARCH
// ============================================================
const SEARCH: FunctionMeta = {
  name: 'SEARCH',
  signature: 'SEARCH(find_text, within_text, [start_num])',
  description: '指定した文字列を検索して位置を返します(大文字小文字を区別せず、ワイルドカードに対応)',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');
    const findText = resolveString(args[0], ctx);
    if (isFormulaError(findText)) return findText;
    const withinText = resolveString(args[1], ctx);
    if (isFormulaError(withinText)) return withinText;

    let startNum = 1;
    if (args.length === 3) {
      const s = resolveNumber(args[2], ctx);
      if (isFormulaError(s)) return s;
      startNum = Math.trunc(s);
      if (startNum < 1) return makeError('#VALUE!');
    }

    const regex = buildSearchRegex(findText);
    const slice = withinText.slice(startNum - 1);
    const m = regex.exec(slice);
    if (!m) return makeError('#VALUE!');
    return startNum + m.index;
  },
};

// ============================================================
// TEXTJOIN
// ============================================================
const TEXTJOIN: FunctionMeta = {
  name: 'TEXTJOIN',
  signature: 'TEXTJOIN(delimiter, ignore_empty, text1, [text2], ...)',
  description: '区切り文字付きでテキストを結合します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3) return makeError('#VALUE!');

    const delimiter = resolveString(args[0], ctx);
    if (isFormulaError(delimiter)) return delimiter;

    const ignoreEmptyVal = resolveNumber(args[1], ctx);
    if (isFormulaError(ignoreEmptyVal)) return ignoreEmptyVal;
    const ignoreEmpty = ignoreEmptyVal !== 0;

    const parts: string[] = [];
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (isFormulaError(val)) return val;
          const str = String(typeof val === 'boolean' ? (val ? 'TRUE' : 'FALSE') : val);
          if (ignoreEmpty && str === '') continue;
          parts.push(str);
        }
      } else {
        const str = resolveString(arg, ctx);
        if (isFormulaError(str)) return str;
        if (ignoreEmpty && str === '') continue;
        parts.push(str);
      }
    }
    return parts.join(delimiter);
  },
};

// ============================================================
// JOIN (Google Sheets)
// ============================================================
const JOIN: FunctionMeta = {
  name: 'JOIN',
  signature: 'JOIN(delimiter, value_or_array1, [value_or_array2, ...])',
  description: '指定した区切り文字で配列や範囲の値を結合します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2) return makeError('#VALUE!');
    const delimiter = resolveString(args[0], ctx);
    if (isFormulaError(delimiter)) return delimiter;

    const parts: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (isFormulaError(val)) return val;
          parts.push(String(typeof val === 'boolean' ? (val ? 'TRUE' : 'FALSE') : val));
        }
      } else {
        const str = resolveString(arg, ctx);
        if (isFormulaError(str)) return str;
        parts.push(str);
      }
    }
    return parts.join(delimiter);
  },
};

// ============================================================
// NUMBERVALUE
// ============================================================
const NUMBERVALUE: FunctionMeta = {
  name: 'NUMBERVALUE',
  signature: 'NUMBERVALUE(text, [decimal_separator], [group_separator])',
  description: 'ロケール対応の数値変換を行います',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');

    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;

    let decimalSep = '.';
    if (args.length >= 2) {
      const ds = resolveString(args[1], ctx);
      if (isFormulaError(ds)) return ds;
      if (ds.length > 0) decimalSep = ds[0];
    }

    let groupSep = ',';
    if (args.length >= 3) {
      const gs = resolveString(args[2], ctx);
      if (isFormulaError(gs)) return gs;
      if (gs.length > 0) groupSep = gs[0];
    }

    // Remove group separators, replace decimal separator with '.'
    let normalized = text.trim();
    if (groupSep) {
      normalized = normalized.split(groupSep).join('');
    }
    if (decimalSep !== '.') {
      normalized = normalized.replace(decimalSep, '.');
    }

    // Handle percentage
    let multiplier = 1;
    if (normalized.endsWith('%')) {
      normalized = normalized.slice(0, -1);
      multiplier = 0.01;
    }

    const num = Number(normalized);
    if (isNaN(num) || normalized === '') return makeError('#VALUE!');
    return num * multiplier;
  },
};

// ============================================================
// REPT / CHAR / CODE / UNICHAR / UNICODE / EXACT / CLEAN
// ============================================================
const REPT: FunctionMeta = {
  name: 'REPT',
  signature: 'REPT(text, number_times)',
  description: '文字列を指定した回数だけ繰り返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const n = resolveNumber(args[1], ctx);
    if (isFormulaError(n)) return n;
    const count = Math.trunc(n);
    if (count < 0) return makeError('#VALUE!');
    return text.repeat(count);
  },
};

const CHAR_FN: FunctionMeta = {
  name: 'CHAR',
  signature: 'CHAR(number)',
  description: '文字コードに対応する文字を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const n = resolveNumber(args[0], ctx);
    if (isFormulaError(n)) return n;
    const code = Math.trunc(n);
    if (code < 1 || code > 255) return makeError('#VALUE!');
    return String.fromCharCode(code);
  },
};

const CODE: FunctionMeta = {
  name: 'CODE',
  signature: 'CODE(text)',
  description: '文字列の先頭文字の文字コードを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    if (str.length === 0) return makeError('#VALUE!');
    return str.charCodeAt(0);
  },
};

const UNICHAR: FunctionMeta = {
  name: 'UNICHAR',
  signature: 'UNICHAR(number)',
  description: 'Unicodeコードポイントに対応する文字を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const n = resolveNumber(args[0], ctx);
    if (isFormulaError(n)) return n;
    const code = Math.trunc(n);
    if (code < 1) return makeError('#VALUE!');
    try {
      return String.fromCodePoint(code);
    } catch {
      return makeError('#VALUE!');
    }
  },
};

const UNICODE: FunctionMeta = {
  name: 'UNICODE',
  signature: 'UNICODE(text)',
  description: '文字列の先頭文字のUnicodeコードポイントを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    if (str.length === 0) return makeError('#VALUE!');
    return str.codePointAt(0)!;
  },
};

const EXACT: FunctionMeta = {
  name: 'EXACT',
  signature: 'EXACT(text1, text2)',
  description: '2つの文字列が完全に一致する場合にTRUEを返します(大文字小文字を区別)',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const a = resolveString(args[0], ctx);
    if (isFormulaError(a)) return a;
    const b = resolveString(args[1], ctx);
    if (isFormulaError(b)) return b;
    return a === b;
  },
};

const CLEAN: FunctionMeta = {
  name: 'CLEAN',
  signature: 'CLEAN(text)',
  description: '印字できない文字を文字列から削除します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    let out = '';
    for (const ch of str) {
      const code = ch.codePointAt(0)!;
      if (code >= 32 && code !== 127) out += ch;
    }
    return out;
  },
};

// ============================================================
// T / VALUE / TEXT
// ============================================================
const T_FN: FunctionMeta = {
  name: 'T',
  signature: 'T(value)',
  description: '値が文字列の場合はそのまま返し、それ以外は空文字列を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    return typeof val === 'string' ? val : '';
  },
};

const VALUE_FN: FunctionMeta = {
  name: 'VALUE',
  signature: 'VALUE(text)',
  description: '数値を表す文字列を数値に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return makeError('#VALUE!');
    const parsed = parseUserInput(val);
    if (typeof parsed.value === 'number') return parsed.value;
    return makeError('#VALUE!');
  },
};

const TEXT_FN: FunctionMeta = {
  name: 'TEXT',
  signature: 'TEXT(value, format_text)',
  description: '数値を指定した表示形式の文字列に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const val = resolveScalar(args[0], ctx);
    if (isFormulaError(val)) return val;
    const pattern = resolveString(args[1], ctx);
    if (isFormulaError(pattern)) return pattern;

    let formatValue: number | string | boolean;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      const n = Number(trimmed);
      formatValue = trimmed !== '' && !isNaN(n) ? n : val;
    } else {
      formatValue = val;
    }
    return formatWithPattern(formatValue, pattern).text;
  },
};

// ============================================================
// FIXED / DOLLAR
// ============================================================
/** Round `number` to `decimals` places (half-away-from-zero) and format the magnitude as a string. */
function fixedParts(number: number, decimals: number, noCommas: boolean): { negative: boolean; digits: string } {
  const factor = Math.pow(10, decimals);
  const scaled = number * factor;
  const roundedScaled = scaled >= 0 ? Math.round(scaled + 1e-9) : -Math.round(-scaled + 1e-9);
  const rounded = roundedScaled / factor;
  const negative = rounded < 0;
  const dispDecimals = Math.max(decimals, 0);
  let digits = Math.abs(rounded).toFixed(dispDecimals);
  if (!noCommas) {
    const dotIdx = digits.indexOf('.');
    const intPart = dotIdx === -1 ? digits : digits.slice(0, dotIdx);
    const decPart = dotIdx === -1 ? '' : digits.slice(dotIdx);
    digits = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decPart;
  }
  return { negative, digits };
}

const FIXED: FunctionMeta = {
  name: 'FIXED',
  signature: 'FIXED(number, [decimals], [no_commas])',
  description: '数値を指定した桁数に丸め、文字列として返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 3) return makeError('#VALUE!');
    const number = resolveNumber(args[0], ctx);
    if (isFormulaError(number)) return number;

    let decimals = 2;
    if (args.length >= 2 && args[1].kind !== 'omitted') {
      const d = resolveNumber(args[1], ctx);
      if (isFormulaError(d)) return d;
      decimals = Math.trunc(d);
    }

    let noCommas = false;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const b = resolveScalar(args[2], ctx);
      if (isFormulaError(b)) return b;
      const bb = toBoolean(b);
      if (isFormulaError(bb)) return bb;
      noCommas = bb;
    }

    const { negative, digits } = fixedParts(number, decimals, noCommas);
    return (negative ? '-' : '') + digits;
  },
};

const DOLLAR: FunctionMeta = {
  name: 'DOLLAR',
  signature: 'DOLLAR(number, [decimals])',
  description: '数値を通貨形式(¥表記)の文字列に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');
    const number = resolveNumber(args[0], ctx);
    if (isFormulaError(number)) return number;

    let decimals = 2;
    if (args.length >= 2 && args[1].kind !== 'omitted') {
      const d = resolveNumber(args[1], ctx);
      if (isFormulaError(d)) return d;
      decimals = Math.trunc(d);
    }

    const { negative, digits } = fixedParts(number, decimals, false);
    return (negative ? '-¥' : '¥') + digits;
  },
};

// ============================================================
// TEXTBEFORE / TEXTAFTER
// ============================================================
function textBeforeAfter(args: FunctionArgValue[], ctx: FunctionContext, mode: 'before' | 'after'): FormulaResult {
  if (args.length < 2 || args.length > 6) return makeError('#VALUE!');
  const text = resolveString(args[0], ctx);
  if (isFormulaError(text)) return text;
  const delimiter = resolveString(args[1], ctx);
  if (isFormulaError(delimiter)) return delimiter;

  let instanceNum = 1;
  if (args.length >= 3 && args[2].kind !== 'omitted') {
    const n = resolveNumber(args[2], ctx);
    if (isFormulaError(n)) return n;
    instanceNum = Math.trunc(n);
  }
  if (instanceNum === 0) return makeError('#VALUE!');

  let matchMode = 0;
  if (args.length >= 4 && args[3].kind !== 'omitted') {
    const m = resolveNumber(args[3], ctx);
    if (isFormulaError(m)) return m;
    matchMode = m;
  }

  let matchEnd = 0;
  if (args.length >= 5 && args[4].kind !== 'omitted') {
    const m = resolveNumber(args[4], ctx);
    if (isFormulaError(m)) return m;
    matchEnd = m;
  }

  let ifNotFound: FormulaResult = makeError('#N/A');
  if (args.length >= 6 && args[5].kind !== 'omitted') {
    ifNotFound = resolveScalar(args[5], ctx);
  }

  if (delimiter === '') return ifNotFound;

  const caseInsensitive = matchMode === 1;
  const hay = caseInsensitive ? text.toLowerCase() : text;
  const needle = caseInsensitive ? delimiter.toLowerCase() : delimiter;

  const positions: { pos: number; len: number }[] = [];
  let searchFrom = 0;
  while (true) {
    const found = hay.indexOf(needle, searchFrom);
    if (found === -1) break;
    positions.push({ pos: found, len: needle.length });
    searchFrom = found + needle.length;
  }
  if (matchEnd === 1) positions.push({ pos: text.length, len: 0 });

  if (positions.length === 0) return ifNotFound;

  const idx = instanceNum > 0 ? instanceNum - 1 : positions.length + instanceNum;
  if (idx < 0 || idx >= positions.length) return ifNotFound;

  const { pos, len } = positions[idx];
  return mode === 'before' ? text.slice(0, pos) : text.slice(pos + len);
}

const TEXTBEFORE: FunctionMeta = {
  name: 'TEXTBEFORE',
  signature: 'TEXTBEFORE(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])',
  description: '区切り文字より前の部分文字列を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    return textBeforeAfter(args, ctx, 'before');
  },
};

const TEXTAFTER: FunctionMeta = {
  name: 'TEXTAFTER',
  signature: 'TEXTAFTER(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])',
  description: '区切り文字より後の部分文字列を返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    return textBeforeAfter(args, ctx, 'after');
  },
};

// ============================================================
// SPLIT (Google Sheets)
// ============================================================
const SPLIT: FunctionMeta = {
  name: 'SPLIT',
  signature: 'SPLIT(text, delimiter, [split_by_each], [remove_empty_text])',
  description: '区切り文字でテキストを分割し、横方向の配列として返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 4) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const delimiter = resolveString(args[1], ctx);
    if (isFormulaError(delimiter)) return delimiter;

    let splitByEach = true;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const v = resolveScalar(args[2], ctx);
      if (isFormulaError(v)) return v;
      const b = toBoolean(v);
      if (isFormulaError(b)) return b;
      splitByEach = b;
    }

    let removeEmpty = true;
    if (args.length >= 4 && args[3].kind !== 'omitted') {
      const v = resolveScalar(args[3], ctx);
      if (isFormulaError(v)) return v;
      const b = toBoolean(v);
      if (isFormulaError(b)) return b;
      removeEmpty = b;
    }

    let parts: string[];
    if (delimiter === '') {
      parts = [text];
    } else if (splitByEach) {
      const alternation = Array.from(delimiter).map(escapeRegExp).join('|');
      parts = text.split(new RegExp(alternation));
    } else {
      parts = text.split(delimiter);
    }
    if (removeEmpty) parts = parts.filter((p) => p !== '');
    if (parts.length === 0) parts = [''];

    return makeSpill([parts]);
  },
};

// ============================================================
// TEXTSPLIT
// ============================================================
const TEXTSPLIT: FunctionMeta = {
  name: 'TEXTSPLIT',
  signature: 'TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with])',
  description: '指定した区切り文字でテキストを行と列に分割します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 2 || args.length > 6) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const colDelim = resolveString(args[1], ctx);
    if (isFormulaError(colDelim)) return colDelim;

    let rowDelim = '';
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const r = resolveString(args[2], ctx);
      if (isFormulaError(r)) return r;
      rowDelim = r;
    }

    let ignoreEmpty = false;
    if (args.length >= 4 && args[3].kind !== 'omitted') {
      const v = resolveScalar(args[3], ctx);
      if (isFormulaError(v)) return v;
      const b = toBoolean(v);
      if (isFormulaError(b)) return b;
      ignoreEmpty = b;
    }

    let matchMode = 0;
    if (args.length >= 5 && args[4].kind !== 'omitted') {
      const m = resolveNumber(args[4], ctx);
      if (isFormulaError(m)) return m;
      matchMode = m;
    }

    let padWith: FormulaResult = makeError('#N/A');
    if (args.length >= 6 && args[5].kind !== 'omitted') {
      padWith = resolveScalar(args[5], ctx);
    }

    const caseInsensitive = matchMode === 1;
    const splitOn = (s: string, delim: string): string[] => {
      if (delim === '') return [s];
      if (caseInsensitive) return s.split(new RegExp(escapeRegExp(delim), 'gi'));
      return s.split(delim);
    };

    const rowParts = rowDelim === '' ? [text] : splitOn(text, rowDelim);
    let grid: string[][] = rowParts.map((rp) => (colDelim === '' ? [rp] : splitOn(rp, colDelim)));

    if (ignoreEmpty) {
      grid = grid.map((row) => row.filter((v) => v !== '')).filter((row) => row.length > 0);
    }
    if (grid.length === 0) grid = [['']];

    const maxCols = Math.max(...grid.map((r) => r.length));
    const values: FormulaResult[][] = grid.map((row) => {
      const padded: FormulaResult[] = [...row];
      while (padded.length < maxCols) padded.push(padWith);
      return padded;
    });
    return makeSpill(values);
  },
};

// ============================================================
// REGEXMATCH / REGEXEXTRACT / REGEXREPLACE
// ============================================================
const REGEXMATCH: FunctionMeta = {
  name: 'REGEXMATCH',
  signature: 'REGEXMATCH(text, regular_expression)',
  description: '文字列が正規表現に一致する場合にTRUEを返します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const pattern = resolveString(args[1], ctx);
    if (isFormulaError(pattern)) return pattern;
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return makeError('#VALUE!');
    }
    return re.test(text);
  },
};

const REGEXEXTRACT: FunctionMeta = {
  name: 'REGEXEXTRACT',
  signature: 'REGEXEXTRACT(text, regular_expression)',
  description: '正規表現に一致する部分文字列を抽出します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length !== 2) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const pattern = resolveString(args[1], ctx);
    if (isFormulaError(pattern)) return pattern;
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return makeError('#VALUE!');
    }
    const m = re.exec(text);
    if (!m) return makeError('#N/A');
    if (m.length <= 1) return m[0];
    if (m.length === 2) return m[1] ?? '';
    return makeSpill([m.slice(1).map((g) => g ?? '')]);
  },
};

const REGEXREPLACE: FunctionMeta = {
  name: 'REGEXREPLACE',
  signature: 'REGEXREPLACE(text, regular_expression, replacement)',
  description: '正規表現に一致する部分を置換文字列に全置換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 3) return makeError('#VALUE!');
    const text = resolveString(args[0], ctx);
    if (isFormulaError(text)) return text;
    const pattern = resolveString(args[1], ctx);
    if (isFormulaError(pattern)) return pattern;
    const replacement = resolveString(args[2], ctx);
    if (isFormulaError(replacement)) return replacement;
    let re: RegExp;
    try {
      re = new RegExp(pattern, 'g');
    } catch {
      return makeError('#VALUE!');
    }
    return text.replace(re, replacement);
  },
};

// ============================================================
// ASC / JIS (full-width <-> half-width conversion)
// ============================================================
const FULLWIDTH_TO_HALFWIDTH_KATAKANA: [string, string][] = [
  ['。', '｡'], ['「', '｢'], ['」', '｣'], ['、', '､'], ['・', '･'],
  ['ヲ', 'ｦ'], ['ァ', 'ｧ'], ['ィ', 'ｨ'], ['ゥ', 'ｩ'], ['ェ', 'ｪ'], ['ォ', 'ｫ'],
  ['ャ', 'ｬ'], ['ュ', 'ｭ'], ['ョ', 'ｮ'], ['ッ', 'ｯ'], ['ー', 'ｰ'],
  ['ア', 'ｱ'], ['イ', 'ｲ'], ['ウ', 'ｳ'], ['エ', 'ｴ'], ['オ', 'ｵ'],
  ['カ', 'ｶ'], ['キ', 'ｷ'], ['ク', 'ｸ'], ['ケ', 'ｹ'], ['コ', 'ｺ'],
  ['サ', 'ｻ'], ['シ', 'ｼ'], ['ス', 'ｽ'], ['セ', 'ｾ'], ['ソ', 'ｿ'],
  ['タ', 'ﾀ'], ['チ', 'ﾁ'], ['ツ', 'ﾂ'], ['テ', 'ﾃ'], ['ト', 'ﾄ'],
  ['ナ', 'ﾅ'], ['ニ', 'ﾆ'], ['ヌ', 'ﾇ'], ['ネ', 'ﾈ'], ['ノ', 'ﾉ'],
  ['ハ', 'ﾊ'], ['ヒ', 'ﾋ'], ['フ', 'ﾌ'], ['ヘ', 'ﾍ'], ['ホ', 'ﾎ'],
  ['マ', 'ﾏ'], ['ミ', 'ﾐ'], ['ム', 'ﾑ'], ['メ', 'ﾒ'], ['モ', 'ﾓ'],
  ['ヤ', 'ﾔ'], ['ユ', 'ﾕ'], ['ヨ', 'ﾖ'],
  ['ラ', 'ﾗ'], ['リ', 'ﾘ'], ['ル', 'ﾙ'], ['レ', 'ﾚ'], ['ロ', 'ﾛ'],
  ['ワ', 'ﾜ'], ['ン', 'ﾝ'],
];

const FULLWIDTH_TO_HALFWIDTH_VOICED: [string, string][] = [
  ['ガ', 'ｶﾞ'], ['ギ', 'ｷﾞ'], ['グ', 'ｸﾞ'], ['ゲ', 'ｹﾞ'], ['ゴ', 'ｺﾞ'],
  ['ザ', 'ｻﾞ'], ['ジ', 'ｼﾞ'], ['ズ', 'ｽﾞ'], ['ゼ', 'ｾﾞ'], ['ゾ', 'ｿﾞ'],
  ['ダ', 'ﾀﾞ'], ['ヂ', 'ﾁﾞ'], ['ヅ', 'ﾂﾞ'], ['デ', 'ﾃﾞ'], ['ド', 'ﾄﾞ'],
  ['バ', 'ﾊﾞ'], ['ビ', 'ﾋﾞ'], ['ブ', 'ﾌﾞ'], ['ベ', 'ﾍﾞ'], ['ボ', 'ﾎﾞ'],
  ['ヴ', 'ｳﾞ'],
  ['パ', 'ﾊﾟ'], ['ピ', 'ﾋﾟ'], ['プ', 'ﾌﾟ'], ['ペ', 'ﾍﾟ'], ['ポ', 'ﾎﾟ'],
];

const FULL_TO_HALF_MAP = new Map<string, string>([...FULLWIDTH_TO_HALFWIDTH_KATAKANA, ...FULLWIDTH_TO_HALFWIDTH_VOICED]);
const HALF_SINGLE_TO_FULL_MAP = new Map<string, string>(FULLWIDTH_TO_HALFWIDTH_KATAKANA.map(([f, h]) => [h, f]));
const HALF_VOICED_TO_FULL_MAP = new Map<string, string>(FULLWIDTH_TO_HALFWIDTH_VOICED.map(([f, h]) => [h, f]));

function toHalfWidth(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
      continue;
    }
    if (ch === '　') { out += ' '; continue; }
    out += FULL_TO_HALF_MAP.get(ch) ?? ch;
  }
  return out;
}

function toFullWidth(text: string): string {
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (next === 'ﾞ' || next === 'ﾟ') {
      const combo = HALF_VOICED_TO_FULL_MAP.get(ch + next);
      if (combo) { out += combo; i++; continue; }
    }
    const single = HALF_SINGLE_TO_FULL_MAP.get(ch);
    if (single) { out += single; continue; }
    const code = ch.codePointAt(0)!;
    if (code >= 0x21 && code <= 0x7e) { out += String.fromCharCode(code + 0xfee0); continue; }
    if (ch === ' ') { out += '　'; continue; }
    out += ch;
  }
  return out;
}

const ASC: FunctionMeta = {
  name: 'ASC',
  signature: 'ASC(text)',
  description: '全角の英数字・記号・カタカナを半角に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return toHalfWidth(str);
  },
};

const JIS: FunctionMeta = {
  name: 'JIS',
  signature: 'JIS(text)',
  description: '半角の英数字・記号・カタカナを全角に変換します',
  lift: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    const str = resolveString(args[0], ctx);
    if (isFormulaError(str)) return str;
    return toFullWidth(str);
  },
};

export const textFunctions: FunctionMeta[] = [
  CONCAT, CONCATENATE, LEN, UPPER, LOWER, PROPER, LEFT, RIGHT, TRIM, SUBSTITUTE, REPLACE, MID, FIND, SEARCH,
  TEXTJOIN, JOIN, NUMBERVALUE,
  REPT, CHAR_FN, CODE, UNICHAR, UNICODE, EXACT, CLEAN, T_FN, VALUE_FN, TEXT_FN, FIXED, DOLLAR,
  TEXTBEFORE, TEXTAFTER, SPLIT, TEXTSPLIT,
  REGEXMATCH, REGEXEXTRACT, REGEXREPLACE, ASC, JIS,
];
