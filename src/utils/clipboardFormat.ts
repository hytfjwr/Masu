import type { CellStyle, TextAlign, VerticalAlign } from '../types/grid';

/** A single cell's value + optional style, used for HTML clipboard interop. */
export interface ClipCell {
  value: string;
  style?: CellStyle;
}

/**
 * Serialize a 2D array to TSV (tab-separated values) for clipboard interop.
 * Values containing a tab, newline, or double quote are wrapped in "..." with
 * embedded double quotes doubled (Google Sheets / Excel compatible).
 */
export function toTSV(values: string[][]): string {
  return values
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes('\t') || cell.includes('\n') || cell.includes('"')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join('\t'),
    )
    .join('\n');
}

/**
 * Parse TSV (tab-separated values) text into a 2D array.
 * Handles "..." quoted fields (which may contain tabs/newlines/escaped "" quotes).
 * Normalizes CRLF, ignores a single trailing newline, and returns [['']] for empty text.
 */
export function parseTSV(text: string): string[][] {
  if (!text) return [['']];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const len = trimmed.length;
  let i = 0;

  while (i < len) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build the `style="..."` inline CSS for a single cell's style, in a fixed property order. */
function styleToInlineCSS(style: CellStyle): string {
  const parts: string[] = [];
  if (style.bold) parts.push('font-weight:bold');
  if (style.italic) parts.push('font-style:italic');
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikethrough) decorations.push('line-through');
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(' ')}`);
  if (style.textColor) parts.push(`color:${style.textColor}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.textAlign) parts.push(`text-align:${style.textAlign}`);
  if (style.fontSize) parts.push(`font-size:${style.fontSize}pt`);
  if (style.fontFamily) parts.push(`font-family:${style.fontFamily}`);
  if (style.verticalAlign) parts.push(`vertical-align:${style.verticalAlign}`);
  return parts.join('; ');
}

/**
 * Build an HTML table (with a UTF-8 meta charset tag) from a 2D array of cells,
 * for writing to the system clipboard's text/html slot.
 */
export function toHTMLTable(cells: ClipCell[][]): string {
  const rows = cells
    .map((row) => {
      const tds = row
        .map((cell) => {
          const css = cell.style ? styleToInlineCSS(cell.style) : '';
          const styleAttr = css ? ` style="${css}"` : '';
          const value = escapeHtml(cell.value).replace(/\n/g, '<br>');
          return `<td${styleAttr}>${value}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<meta charset="utf-8"><table><tbody>${rows}</tbody></table>`;
}

/** Extract a td/th's text content, converting <br> descendants to '\n'. */
function extractText(node: Node): string {
  let result = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      result += child.textContent ?? '';
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      if (el.tagName === 'BR') {
        result += '\n';
      } else {
        result += extractText(el);
      }
    }
  });
  return result;
}

/** Parse a single inline `style="..."` attribute value into a lowercase-keyed property map. */
function parseStyleAttr(attr: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!attr) return map;
  for (const decl of attr.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (key && value) map[key] = value;
  }
  return map;
}

/** Merge inline styles from a td and its descendants (td's own style wins on conflicts). */
function collectStyleMap(td: Element): Record<string, string> {
  const map = parseStyleAttr(td.getAttribute('style'));
  const descendants = td.querySelectorAll('*');
  descendants.forEach((el) => {
    const dmap = parseStyleAttr(el.getAttribute('style'));
    for (const [key, value] of Object.entries(dmap)) {
      if (!(key in map)) map[key] = value;
    }
  });
  return map;
}

/** Normalize a CSS color (rgb(...)/rgba(...)/#RGB/#RRGGBB) to lowercase '#RRGGBB' where possible. */
function normalizeColor(value: string): string {
  const v = value.trim();
  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(v);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const chars = v.slice(1).split('');
    return `#${chars.map((c) => c + c).join('')}`.toLowerCase();
  }
  return v.toLowerCase();
}

/** Convert a CSS font-size (pt or px) into a rounded pt integer. Returns undefined for unsupported units. */
function parseFontSize(raw: string): number | undefined {
  const m = /^([\d.]+)\s*(pt|px)$/i.exec(raw.trim());
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return undefined;
  const pt = m[2].toLowerCase() === 'px' ? num * 0.75 : num;
  return Math.round(pt);
}

const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const VERTICAL_ALIGNS: VerticalAlign[] = ['top', 'middle', 'bottom'];

/** Build a CellStyle from a td's own + descendant inline styles and formatting tags. */
function extractCellStyle(td: Element): CellStyle | undefined {
  const styleMap = collectStyleMap(td);
  const style: CellStyle = {};

  const fontWeight = styleMap['font-weight'];
  const boldFromWeight = fontWeight === 'bold' || fontWeight === 'bolder' ||
    (/^\d+$/.test(fontWeight ?? '') && parseInt(fontWeight, 10) >= 700);
  if (boldFromWeight || td.querySelector('b, strong') !== null) style.bold = true;

  const fontStyle = styleMap['font-style'];
  if (fontStyle === 'italic' || fontStyle === 'oblique' || td.querySelector('i, em') !== null) style.italic = true;

  const textDecoration = styleMap['text-decoration'] ?? '';
  if (/underline/.test(textDecoration) || td.querySelector('u') !== null) style.underline = true;
  if (/line-through/.test(textDecoration) || td.querySelector('s, strike, del') !== null) style.strikethrough = true;

  const color = styleMap['color'];
  if (color) style.textColor = normalizeColor(color);

  const bg = styleMap['background-color'];
  if (bg && bg.trim().toLowerCase() !== 'transparent') {
    const normalizedBg = normalizeColor(bg);
    if (normalizedBg !== '#ffffff') style.backgroundColor = normalizedBg;
  }

  const textAlign = styleMap['text-align'];
  if (textAlign && (TEXT_ALIGNS as string[]).includes(textAlign)) style.textAlign = textAlign as TextAlign;

  const verticalAlign = styleMap['vertical-align'];
  if (verticalAlign && (VERTICAL_ALIGNS as string[]).includes(verticalAlign)) style.verticalAlign = verticalAlign as VerticalAlign;

  const fontSizeRaw = styleMap['font-size'];
  if (fontSizeRaw) {
    const size = parseFontSize(fontSizeRaw);
    if (size !== undefined) style.fontSize = size;
  }

  const fontFamily = styleMap['font-family'];
  if (fontFamily) style.fontFamily = fontFamily.replace(/^['"]|['"]$/g, '');

  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * Parse an HTML string's first <table> into a ClipCell[][] grid.
 * Returns null if the HTML contains no table. colspan/rowspan cells are expanded:
 * the merged value goes in the top-left cell, the rest of the span is filled with ''.
 * The result is padded to a rectangle (all rows have the same number of columns).
 */
export function parseHTMLTable(html: string): ClipCell[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;

  const trs = Array.from(table.querySelectorAll('tr'));
  if (trs.length === 0) return null;

  const grid: (ClipCell | undefined)[][] = [];

  trs.forEach((tr, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = [];
    const row = grid[rowIndex];
    let colIndex = 0;
    const cells = Array.from(tr.querySelectorAll('td, th'));

    for (const td of cells) {
      while (row[colIndex] !== undefined) colIndex++;

      const colSpan = Math.max(1, parseInt(td.getAttribute('colspan') ?? '1', 10) || 1);
      const rowSpan = Math.max(1, parseInt(td.getAttribute('rowspan') ?? '1', 10) || 1);
      const value = extractText(td);
      const style = extractCellStyle(td);

      for (let dr = 0; dr < rowSpan; dr++) {
        const r = rowIndex + dr;
        if (!grid[r]) grid[r] = [];
        for (let dc = 0; dc < colSpan; dc++) {
          const c = colIndex + dc;
          grid[r][c] = dr === 0 && dc === 0 ? { value, ...(style ? { style } : {}) } : { value: '' };
        }
      }
      colIndex += colSpan;
    }
  });

  const maxCols = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) => {
    const filled: ClipCell[] = [];
    for (let c = 0; c < maxCols; c++) {
      filled.push(row[c] ?? { value: '' });
    }
    return filled;
  });
}
