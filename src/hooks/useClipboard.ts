import { useCallback, useRef, useState } from 'react';
import type { CellPosition, CellStyle } from '../types/grid';
import { shiftFormula } from '../utils/formulaShift';
import { toTSV, parseTSV, toHTMLTable, parseHTMLTable } from '../utils/clipboardFormat';
import type { ClipCell } from '../utils/clipboardFormat';

/** A single internally-copied cell: raw + formatted-for-display + computed-value text, plus style. */
interface InternalClipCell {
  rawValue: string;
  displayText: string;
  /** Computed value as text (displayValue for formulas, rawValue otherwise) — used by "paste values only". */
  valueText: string;
  style?: CellStyle;
}

export interface InternalClipboard {
  cells: InternalClipCell[][]; // [row][col]
  sourceRange: { start: CellPosition; end: CellPosition }; // normalized (start is top-left)
  isCut: boolean;
  sourceSheetId?: string;
  /** The text/plain payload written at copy time, used to detect whether the system clipboard changed since. */
  text: string;
}

export type PasteMode = 'normal' | 'values' | 'format' | 'transpose';

export interface PasteEntry {
  col: number;
  row: number;
  /** undefined = don't change the value */
  value?: string;
  /** undefined = don't change the style, null = clear the style */
  style?: CellStyle | null;
}

export interface PastePlan {
  entries: PasteEntry[];
  /** Cut source cells to clear (value + style), only present for an internal cut+normal paste. */
  clearEntries?: Array<{ col: number; row: number }>;
  /** Sheet the clearEntries belong to (only meaningful when a cut originated on a different sheet). */
  sourceSheetId?: string;
  pastedRange: { start: CellPosition; end: CellPosition };
}

export type GetCell = (
  col: number,
  row: number,
) =>
  | {
      rawValue: string;
      displayText: string;
      valueText: string;
      style?: CellStyle;
    }
  | undefined;

export interface UseClipboardReturn {
  /** Copy (or cut) the selected range. Writes to e.clipboardData if given, else navigator.clipboard. */
  copy: (
    sel: { start: CellPosition; end: CellPosition },
    getCell: GetCell,
    sourceSheetId: string,
    isCut: boolean,
    e?: ClipboardEvent,
  ) => void;
  /** Build a paste plan. Reads from e.clipboardData if given, else navigator.clipboard. */
  buildPastePlan: (
    target: { start: CellPosition; end: CellPosition },
    mode: PasteMode,
    e?: ClipboardEvent,
  ) => Promise<PastePlan | null>;
  cancelClipboard: () => void;
  isCellInClipboard: (col: number, row: number) => boolean;
  hasClipboard: boolean;
  /** Source range of the current internal clipboard, for the marching-ants overlay. */
  clipboardRange: { start: CellPosition; end: CellPosition } | null;
}

function writeTextFallback(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => execCommandCopyFallback(text));
  } else {
    execCommandCopyFallback(text);
  }
}

/**
 * Fallback clipboard write using a temporary textarea and document.execCommand('copy').
 */
function execCommandCopyFallback(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Move off-screen to avoid visual flash
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // Silently fail if execCommand is also unavailable
  }
  document.body.removeChild(textarea);
}

function writeClipboard(text: string, html: string, e?: ClipboardEvent): void {
  if (e) {
    e.clipboardData?.setData('text/plain', text);
    e.clipboardData?.setData('text/html', html);
    e.preventDefault();
    return;
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    navigator.clipboard
      .write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      .catch(() => writeTextFallback(text));
  } else {
    writeTextFallback(text);
  }
}

/** Read text/plain + text/html from the system clipboard. `ok` is false only when every read attempt failed. */
async function readClipboard(
  e?: ClipboardEvent,
): Promise<{ text: string; html: string; ok: boolean }> {
  if (e) {
    return {
      text: e.clipboardData?.getData('text/plain') ?? '',
      html: e.clipboardData?.getData('text/html') ?? '',
      ok: true,
    };
  }
  try {
    const items = await navigator.clipboard.read();
    let text = '';
    let html = '';
    for (const item of items) {
      if (item.types.includes('text/html')) {
        html = await (await item.getType('text/html')).text();
      }
      if (item.types.includes('text/plain')) {
        text = await (await item.getType('text/plain')).text();
      }
    }
    return { text, html, ok: true };
  } catch {
    try {
      const text = await navigator.clipboard.readText();
      return { text, html: '', ok: true };
    } catch {
      return { text: '', html: '', ok: false };
    }
  }
}

function getNormalizedRange(start: CellPosition, end: CellPosition) {
  return {
    minCol: Math.min(start.col, end.col),
    maxCol: Math.max(start.col, end.col),
    minRow: Math.min(start.row, end.row),
    maxRow: Math.max(start.row, end.row),
  };
}

/** Compute tile counts for a target range vs. a source size. Tiling only kicks in when the
 * target isn't a single cell and both dimensions are exact multiples of the source size. */
function computeTiles(
  targetRows: number,
  targetCols: number,
  srcRows: number,
  srcCols: number,
): { tileRows: number; tileCols: number } {
  const isSingle = targetRows === 1 && targetCols === 1;
  const exactMultiple =
    !isSingle &&
    srcRows > 0 &&
    srcCols > 0 &&
    targetRows % srcRows === 0 &&
    targetCols % srcCols === 0;
  return {
    tileRows: exactMultiple ? targetRows / srcRows : 1,
    tileCols: exactMultiple ? targetCols / srcCols : 1,
  };
}

export function useClipboard(): UseClipboardReturn {
  const clipboardRef = useRef<InternalClipboard | null>(null);
  // The copied range drives the marching-ants marquee. Kept as state (not derived from a boolean)
  // so that copying a second range while one is already copied moves the marquee.
  const [clipboardRange, setClipboardRange] = useState<{
    start: CellPosition;
    end: CellPosition;
  } | null>(null);
  const hasClipboard = clipboardRange !== null;

  const copy = useCallback(
    (
      sel: { start: CellPosition; end: CellPosition },
      getCell: GetCell,
      sourceSheetId: string,
      isCut: boolean,
      e?: ClipboardEvent,
    ) => {
      const { start, end } = sel;
      const cells: InternalClipCell[][] = [];
      for (let r = start.row; r <= end.row; r++) {
        const rowCells: InternalClipCell[] = [];
        for (let c = start.col; c <= end.col; c++) {
          const cell = getCell(c, r);
          rowCells.push({
            rawValue: cell?.rawValue ?? '',
            displayText: cell?.displayText ?? '',
            valueText: cell?.valueText ?? '',
            style: cell?.style,
          });
        }
        cells.push(rowCells);
      }

      const text = toTSV(cells.map((row) => row.map((c) => c.displayText)));
      const html = toHTMLTable(
        cells.map((row) => row.map((c) => ({ value: c.displayText, style: c.style }))),
      );

      clipboardRef.current = { cells, sourceRange: { start, end }, isCut, sourceSheetId, text };
      setClipboardRange({ start, end });

      writeClipboard(text, html, e);
    },
    [],
  );

  const buildPastePlan = useCallback(
    async (
      target: { start: CellPosition; end: CellPosition },
      mode: PasteMode,
      e?: ClipboardEvent,
    ): Promise<PastePlan | null> => {
      const { text, html, ok } = await readClipboard(e);
      const internal = clipboardRef.current;
      if (!ok && !internal) return null;

      const useInternal = !!internal && (text === internal.text || text === '');

      const targetRows = target.end.row - target.start.row + 1;
      const targetCols = target.end.col - target.start.col + 1;

      if (useInternal && internal) {
        const rawRows = internal.cells.length;
        const rawCols = internal.cells[0]?.length ?? 0;
        const transpose = mode === 'transpose';
        const srcRows = transpose ? rawCols : rawRows;
        const srcCols = transpose ? rawRows : rawCols;
        const { tileRows, tileCols } = computeTiles(targetRows, targetCols, srcRows, srcCols);

        const entries: PasteEntry[] = [];
        for (let tr = 0; tr < tileRows; tr++) {
          for (let tc = 0; tc < tileCols; tc++) {
            for (let sr = 0; sr < srcRows; sr++) {
              for (let sc = 0; sc < srcCols; sc++) {
                const rawR = transpose ? sc : sr;
                const rawC = transpose ? sr : sc;
                const cellData = internal.cells[rawR][rawC];
                const originalCol = internal.sourceRange.start.col + rawC;
                const originalRow = internal.sourceRange.start.row + rawR;
                const targetCol = target.start.col + tc * srcCols + sc;
                const targetRow = target.start.row + tr * srcRows + sr;

                if (mode === 'format') {
                  entries.push({ col: targetCol, row: targetRow, style: cellData.style ?? null });
                } else if (mode === 'values') {
                  entries.push({ col: targetCol, row: targetRow, value: cellData.valueText });
                } else if (mode === 'transpose') {
                  const shifted = cellData.rawValue.startsWith('=')
                    ? '=' +
                      shiftFormula(
                        cellData.rawValue.slice(1),
                        targetCol - originalCol,
                        targetRow - originalRow,
                      )
                    : cellData.rawValue;
                  entries.push({
                    col: targetCol,
                    row: targetRow,
                    value: shifted,
                    style: cellData.style ?? null,
                  });
                } else if (internal.isCut) {
                  // normal + cut: move as-is, no formula shift
                  entries.push({
                    col: targetCol,
                    row: targetRow,
                    value: cellData.rawValue,
                    style: cellData.style ?? null,
                  });
                } else {
                  const shifted = cellData.rawValue.startsWith('=')
                    ? '=' +
                      shiftFormula(
                        cellData.rawValue.slice(1),
                        targetCol - originalCol,
                        targetRow - originalRow,
                      )
                    : cellData.rawValue;
                  entries.push({
                    col: targetCol,
                    row: targetRow,
                    value: shifted,
                    style: cellData.style ?? null,
                  });
                }
              }
            }
          }
        }

        let clearEntries: Array<{ col: number; row: number }> | undefined;
        let sourceSheetId: string | undefined;
        if (mode === 'normal' && internal.isCut) {
          const { start, end } = internal.sourceRange;
          clearEntries = [];
          for (let r = start.row; r <= end.row; r++) {
            for (let c = start.col; c <= end.col; c++) {
              clearEntries.push({ col: c, row: r });
            }
          }
          sourceSheetId = internal.sourceSheetId;
          // A cut is "consumed" once it has been pasted as a normal move.
          clipboardRef.current = null;
          setClipboardRange(null);
        }

        return {
          entries,
          clearEntries,
          sourceSheetId,
          pastedRange: {
            start: target.start,
            end: {
              col: target.start.col + tileCols * srcCols - 1,
              row: target.start.row + tileRows * srcRows - 1,
            },
          },
        };
      }

      // External source (clipboard content that didn't match our internal copy)
      const fromHtml = html ? parseHTMLTable(html) : null;
      const extHasStyle = fromHtml !== null;
      const ext: ClipCell[][] =
        fromHtml ?? parseTSV(text).map((row) => row.map((value) => ({ value })));

      if (mode === 'format' && !extHasStyle) return null;

      const rawRows = ext.length;
      const rawCols = ext[0]?.length ?? 0;
      const transpose = mode === 'transpose';
      const srcRows = transpose ? rawCols : rawRows;
      const srcCols = transpose ? rawRows : rawCols;
      const { tileRows, tileCols } = computeTiles(targetRows, targetCols, srcRows, srcCols);

      const entries: PasteEntry[] = [];
      for (let tr = 0; tr < tileRows; tr++) {
        for (let tc = 0; tc < tileCols; tc++) {
          for (let sr = 0; sr < srcRows; sr++) {
            for (let sc = 0; sc < srcCols; sc++) {
              const rawR = transpose ? sc : sr;
              const rawC = transpose ? sr : sc;
              const cellData = ext[rawR][rawC];
              const targetCol = target.start.col + tc * srcCols + sc;
              const targetRow = target.start.row + tr * srcRows + sr;

              if (mode === 'format') {
                entries.push({ col: targetCol, row: targetRow, style: cellData.style ?? null });
              } else if (mode === 'values') {
                entries.push({ col: targetCol, row: targetRow, value: cellData.value });
              } else {
                // normal or transpose: external TSV never carries style, external HTML does
                entries.push({
                  col: targetCol,
                  row: targetRow,
                  value: cellData.value,
                  style: extHasStyle ? (cellData.style ?? null) : undefined,
                });
              }
            }
          }
        }
      }

      return {
        entries,
        pastedRange: {
          start: target.start,
          end: {
            col: target.start.col + tileCols * srcCols - 1,
            row: target.start.row + tileRows * srcRows - 1,
          },
        },
      };
    },
    [],
  );

  const cancelClipboard = useCallback(() => {
    clipboardRef.current = null;
    setClipboardRange(null);
  }, []);

  const isCellInClipboard = useCallback(
    (col: number, row: number): boolean => {
      if (!clipboardRange) return false;
      const { minCol, maxCol, minRow, maxRow } = getNormalizedRange(
        clipboardRange.start,
        clipboardRange.end,
      );
      return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
    },
    [clipboardRange],
  );

  return {
    copy,
    buildPastePlan,
    cancelClipboard,
    isCellInClipboard,
    hasClipboard,
    clipboardRange,
  };
}
