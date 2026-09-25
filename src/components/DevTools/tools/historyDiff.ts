import { t } from '../../../i18n';
import type { CellData, CellStyle, SheetData } from '../../../types/grid';

export interface WorkbookDiff {
  /** Cells whose value or style differ (added / removed / changed). */
  changedCells: number;
  /** Up to `sampleSize` changed cells as "Sheet!A1". */
  sample: string[];
  sheetsAdded: string[];
  sheetsRemoved: string[];
}

/** Shallow style comparison (nested objects like `borders` fall back to JSON, rarely reached). */
function sameStyle(a: CellStyle | undefined, b: CellStyle | undefined): boolean {
  if (a === b) return true;
  // One side missing: equal only if the other is an empty style object
  if (!a || !b) return Object.keys(a ?? b ?? {}).length === 0;
  const keys = Object.keys(a) as Array<keyof CellStyle>;
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (va === vb) continue;
    if (
      typeof va !== 'object' ||
      typeof vb !== 'object' ||
      JSON.stringify(va) !== JSON.stringify(vb)
    )
      return false;
  }
  return true;
}

const sameCell = (a: CellData | undefined, b: CellData | undefined) =>
  a === b || ((a?.rawValue ?? '') === (b?.rawValue ?? '') && sameStyle(a?.style, b?.style));

/** What changed from workbook `before` to workbook `after` (cell values/styles and sheet list). */
export function diffWorkbooks(
  before: SheetData[],
  after: SheetData[],
  sampleSize = 4,
): WorkbookDiff {
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterById = new Map(after.map((s) => [s.id, s]));
  const diff: WorkbookDiff = {
    changedCells: 0,
    sample: [],
    sheetsAdded: after.filter((s) => !beforeById.has(s.id)).map((s) => s.name),
    sheetsRemoved: before.filter((s) => !afterById.has(s.id)).map((s) => s.name),
  };
  const note = (sheet: SheetData, key: string) => {
    diff.changedCells++;
    if (diff.sample.length < sampleSize) diff.sample.push(`${sheet.name}!${key}`);
  };
  for (const sheet of after) {
    const prev = beforeById.get(sheet.id);
    if (!prev) continue;
    // Two passes over the maps instead of building a union key set
    for (const [key, cell] of sheet.cells) {
      if (!sameCell(prev.cells.get(key), cell)) note(sheet, key);
    }
    for (const key of prev.cells.keys()) {
      if (!sheet.cells.has(key)) note(sheet, key);
    }
  }
  return diff;
}

/** One-line summary of a diff, in the current UI language. */
export function describeDiff(diff: WorkbookDiff): string {
  const parts: string[] = [];
  if (diff.sheetsAdded.length)
    parts.push(t('devtools.historyTool.sheetsAdded', { sheets: diff.sheetsAdded.join(', ') }));
  if (diff.sheetsRemoved.length)
    parts.push(t('devtools.historyTool.sheetsRemoved', { sheets: diff.sheetsRemoved.join(', ') }));
  if (diff.changedCells) {
    const more =
      diff.changedCells > diff.sample.length
        ? t('devtools.historyTool.changedCellsMore', {
            count: diff.changedCells - diff.sample.length,
          })
        : '';
    parts.push(
      t('devtools.historyTool.changedCells', {
        count: diff.changedCells,
        sample: diff.sample.join(', '),
        more,
      }),
    );
  }
  return parts.length ? parts.join(' / ') : t('devtools.historyTool.noChange');
}
