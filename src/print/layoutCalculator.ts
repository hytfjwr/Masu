import type {
  PrintSettings,
  PaperSize,
  Orientation,
  Margins,
  PageLayout,
  PageContent,
} from '../types/print';
import { PAPER_DIMENSIONS, MARGIN_PRESETS } from '../types/print';

/**
 * ピクセル幅をmm に変換（96dpi 基準）。
 */
export function pxToMm(px: number): number {
  return (px / 96) * 25.4;
}

/**
 * mm をピクセルに変換（96dpi 基準）。
 */
export function mmToPx(mm: number): number {
  return (mm / 25.4) * 96;
}

/**
 * 実際の余白値を解決する（プリセットまたはカスタム）。
 */
export function resolveMargins(settings: PrintSettings): Margins {
  if (settings.marginPreset === 'custom' && settings.customMargins) {
    return settings.customMargins;
  }
  return (
    MARGIN_PRESETS[settings.marginPreset as Exclude<typeof settings.marginPreset, 'custom'>] ??
    MARGIN_PRESETS.normal
  );
}

/**
 * 印刷可能領域のサイズを計算する（mm単位）。
 */
export function computePrintableArea(
  paperSize: PaperSize,
  orientation: Orientation,
  margins: Margins,
): { width: number; height: number } {
  const paper = PAPER_DIMENSIONS[paperSize];
  const w = orientation === 'landscape' ? paper.height : paper.width;
  const h = orientation === 'landscape' ? paper.width : paper.height;
  return {
    width: w - margins.left - margins.right,
    height: h - margins.top - margins.bottom,
  };
}

/**
 * ヘッダー/フッターのテンプレート変数を展開する。
 */
export function expandHeaderFooterTemplate(
  template: string,
  context: { pageNumber: number; totalPages: number; sheetName: string; date: string },
): string {
  return template
    .replace(/\{pageNumber\}/g, String(context.pageNumber))
    .replace(/\{totalPages\}/g, String(context.totalPages))
    .replace(/\{sheetName\}/g, context.sheetName)
    .replace(/\{date\}/g, context.date);
}

/**
 * データが存在する範囲を検出する。
 */
function detectDataRange(
  colWidths: (colIndex: number) => number,
  rowHeights: (rowIndex: number) => number,
  dataRange: { startCol: number; endCol: number; startRow: number; endRow: number },
): { startCol: number; endCol: number; startRow: number; endRow: number } {
  // Use the provided range as-is (caller can trim empty rows/cols before calling)
  // Ensure at least 1 col and 1 row
  // Suppress unused warnings via void
  void colWidths;
  void rowHeights;
  return {
    startCol: dataRange.startCol,
    endCol: Math.max(dataRange.startCol, dataRange.endCol),
    startRow: dataRange.startRow,
    endRow: Math.max(dataRange.startRow, dataRange.endRow),
  };
}

// Header/footer take about 10mm of vertical space
const HEADER_FOOTER_HEIGHT_MM = 10;

/**
 * 印刷設定とセルサイズに基づいてページレイアウトを計算する純粋関数。
 */
export function computePageLayout(
  settings: PrintSettings,
  colWidths: (colIndex: number) => number,
  rowHeights: (rowIndex: number) => number,
  dataRange: { startCol: number; endCol: number; startRow: number; endRow: number },
): PageLayout {
  const margins = resolveMargins(settings);
  const printable = computePrintableArea(settings.paperSize, settings.orientation, margins);

  // Reserve space for header/footer
  let verticalSpace = printable.height;
  const hasHeader = settings.header.left || settings.header.center || settings.header.right;
  const hasFooter = settings.footer.left || settings.footer.center || settings.footer.right;
  if (hasHeader) verticalSpace -= HEADER_FOOTER_HEIGHT_MM;
  if (hasFooter) verticalSpace -= HEADER_FOOTER_HEIGHT_MM;

  const range = detectDataRange(colWidths, rowHeights, dataRange);

  // Convert printable area from mm to px
  const printableWidthPx = mmToPx(printable.width);
  const printableHeightPx = mmToPx(verticalSpace);

  // Compute column breaks
  const colBreaks: number[] = [range.startCol]; // Each entry is the start column of a page column
  let accWidth = 0;
  for (let c = range.startCol; c <= range.endCol; c++) {
    const w = colWidths(c);
    if (accWidth + w > printableWidthPx && accWidth > 0) {
      colBreaks.push(c);
      accWidth = w;
    } else {
      accWidth += w;
    }
  }

  // Compute row breaks
  const rowBreaks: number[] = [range.startRow];
  let accHeight = 0;
  for (let r = range.startRow; r <= range.endRow; r++) {
    const h = rowHeights(r);
    if (accHeight + h > printableHeightPx && accHeight > 0) {
      rowBreaks.push(r);
      accHeight = h;
    } else {
      accHeight += h;
    }
  }

  // Generate pages
  const pages: PageContent[] = [];
  let pageNum = 1;

  for (let ri = 0; ri < rowBreaks.length; ri++) {
    const startRow = rowBreaks[ri];
    const endRow = ri + 1 < rowBreaks.length ? rowBreaks[ri + 1] : range.endRow + 1;

    for (let ci = 0; ci < colBreaks.length; ci++) {
      const startCol = colBreaks[ci];
      const endCol = ci + 1 < colBreaks.length ? colBreaks[ci + 1] : range.endCol + 1;

      pages.push({
        pageNumber: pageNum++,
        startCol,
        endCol,
        startRow,
        endRow,
      });
    }
  }

  return {
    totalPages: pages.length,
    pages,
  };
}
