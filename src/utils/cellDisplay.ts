import type { CellData, CellStyle } from '../types/grid';
import { formatGeneral, formatWithPattern, patternForStyle } from './numberFormat';

/** Resolved display data for a single cell: text, color override, effective alignment and value kind. */
export interface CellDisplay {
  text: string;
  /** Color from the number format pattern's color section (e.g. `[Red]`), if any. */
  color?: string;
  /** Effective horizontal alignment (explicit `textAlign` wins over the per-kind default). */
  align: 'left' | 'center' | 'right';
  kind: 'empty' | 'number' | 'text' | 'boolean' | 'error';
}

/** Resolve the typed value backing a cell: prefer `computed`, otherwise infer from `displayValue`. */
function resolveValue(cell: CellData): number | string | boolean {
  if (cell.computed !== undefined) return cell.computed;
  const trimmed = cell.displayValue.trim();
  if (trimmed !== '' && !isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed === 'TRUE' || trimmed === 'FALSE') return trimmed === 'TRUE';
  return cell.displayValue;
}

/**
 * Compute the effective display text, color and alignment for a cell, matching Google Sheets'
 * number/boolean/text/error rendering rules and honoring `CellStyle.numberFormat(Pattern)`.
 */
export function getCellDisplay(
  cell: CellData | undefined,
  style: CellStyle | undefined,
): CellDisplay {
  const rawValue = cell?.rawValue ?? '';
  const displayValue = cell?.displayValue ?? '';

  if (!cell || (rawValue === '' && displayValue === '')) {
    return { text: '', align: style?.textAlign ?? 'left', kind: 'empty' };
  }

  if (cell.error) {
    return { text: cell.error, align: style?.textAlign ?? 'center', kind: 'error' };
  }

  const v = resolveValue(cell);
  const isPlainText = style?.numberFormat === 'plainText';
  const pattern = isPlainText ? undefined : patternForStyle(style);

  if (typeof v === 'number') {
    if (isPlainText) {
      return { text: rawValue, align: style?.textAlign ?? 'left', kind: 'text' };
    }
    const formatted = pattern ? formatWithPattern(v, pattern) : { text: formatGeneral(v) };
    return {
      text: formatted.text,
      color: formatted.color,
      align: style?.textAlign ?? 'right',
      kind: 'number',
    };
  }

  if (typeof v === 'boolean') {
    return { text: v ? 'TRUE' : 'FALSE', align: style?.textAlign ?? 'center', kind: 'boolean' };
  }

  if (pattern) {
    const formatted = formatWithPattern(v, pattern);
    return {
      text: formatted.text,
      color: formatted.color,
      align: style?.textAlign ?? 'left',
      kind: 'text',
    };
  }
  return { text: v, align: style?.textAlign ?? 'left', kind: 'text' };
}
