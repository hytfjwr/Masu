// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { toTSV, parseTSV, toHTMLTable, parseHTMLTable } from './clipboardFormat';

describe('toTSV / parseTSV', () => {
  it('round-trips values containing tabs, newlines, and double quotes', () => {
    const values = [
      ['a\tb', 'line1\nline2', 'He said "hi"'],
      ['plain', '', '123'],
    ];
    const tsv = toTSV(values);
    expect(parseTSV(tsv)).toEqual(values);
  });

  it('parses simple tab/newline separated text', () => {
    expect(parseTSV('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('returns a single blank cell for empty text', () => {
    expect(parseTSV('')).toEqual([['']]);
  });
});

describe('toHTMLTable / parseHTMLTable', () => {
  it('round-trips value, bold, textColor, and backgroundColor', () => {
    const cells = [
      [{ value: 'Hello', style: { bold: true, textColor: '#112233', backgroundColor: '#445566' } }],
    ];
    const html = toHTMLTable(cells);
    const parsed = parseHTMLTable(html);
    expect(parsed).toEqual([
      [{ value: 'Hello', style: { bold: true, textColor: '#112233', backgroundColor: '#445566' } }],
    ]);
  });

  it('parses Google Sheets style HTML with bold + textColor', () => {
    const html = '<google-sheets-html-origin><table><tbody><tr><td style="font-weight:bold;color:#ff0000;">見出し</td><td>1</td></tr></tbody></table>';
    const parsed = parseHTMLTable(html);
    expect(parsed).not.toBeNull();
    expect(parsed![0][0].value).toBe('見出し');
    expect(parsed![0][0].style?.bold).toBe(true);
    expect(parsed![0][0].style?.textColor).toBe('#ff0000');
  });

  it('expands a colspan=2 td into two cells', () => {
    const html = '<table><tr><td colspan="2">merged</td><td>x</td></tr></table>';
    const parsed = parseHTMLTable(html);
    expect(parsed).toEqual([[{ value: 'merged' }, { value: '' }, { value: 'x' }]]);
  });

  it('normalizes rgb() background-color to lowercase hex', () => {
    const html = '<table><tr><td style="background-color:rgb(255, 255, 0)">yellow</td></tr></table>';
    const parsed = parseHTMLTable(html);
    expect(parsed![0][0].style?.backgroundColor).toBe('#ffff00');
  });

  it('returns null when the HTML has no table', () => {
    expect(parseHTMLTable('<div>no table here</div>')).toBeNull();
  });
});
