import { jsPDF } from 'jspdf';
import type { PrintSettings } from '../types/print';
import type { CellData, CellStyle } from '../types/grid';
import { PAPER_DIMENSIONS } from '../types/print';
import {
  resolveMargins,
  computePageLayout,
  expandHeaderFooterTemplate,
  pxToMm,
} from './layoutCalculator';
import { formatDisplayValue } from '../utils/numberFormat';
import { resolveFilename } from '../utils/filename';

interface PDFGeneratorOptions {
  settings: PrintSettings;
  getCellData: (col: number, row: number) => CellData | undefined;
  colWidths: (colIndex: number) => number;
  rowHeights: (rowIndex: number) => number;
  dataRange: { startCol: number; endCol: number; startRow: number; endRow: number };
  sheetName: string;
  /** ドキュメントタイトル。指定されたファイル名（"{documentTitle}.pdf"）に使う。未指定なら sheetName にフォールバック。 */
  documentTitle?: string;
}

/**
 * クライアントサイドで PDF を生成してダウンロードする。
 */
export async function generatePDF(options: PDFGeneratorOptions): Promise<void> {
  const { settings, getCellData, colWidths, rowHeights, dataRange, sheetName, documentTitle } = options;
  const margins = resolveMargins(settings);
  const paper = PAPER_DIMENSIONS[settings.paperSize];
  const pageW = settings.orientation === 'landscape' ? paper.height : paper.width;
  const pageH = settings.orientation === 'landscape' ? paper.width : paper.height;

  const layout = computePageLayout(settings, colWidths, rowHeights, dataRange);

  const doc = new jsPDF({
    orientation: settings.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
  });

  const date = new Date().toLocaleDateString('ja-JP');
  const headerFooterContext = (pageNum: number) => ({
    pageNumber: pageNum,
    totalPages: layout.totalPages,
    sheetName,
    date,
  });

  const hasHeader = settings.header.left || settings.header.center || settings.header.right;
  const hasFooter = settings.footer.left || settings.footer.center || settings.footer.right;

  for (let pi = 0; pi < layout.pages.length; pi++) {
    if (pi > 0) {
      doc.addPage([pageW, pageH], settings.orientation === 'landscape' ? 'landscape' : 'portrait');
    }

    const page = layout.pages[pi];
    const ctx = headerFooterContext(page.pageNumber);

    // Draw header
    if (hasHeader) {
      const headerY = margins.top + 3;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      if (settings.header.left) {
        doc.text(expandHeaderFooterTemplate(settings.header.left, ctx), margins.left, headerY);
      }
      if (settings.header.center) {
        doc.text(expandHeaderFooterTemplate(settings.header.center, ctx), pageW / 2, headerY, { align: 'center' });
      }
      if (settings.header.right) {
        doc.text(expandHeaderFooterTemplate(settings.header.right, ctx), pageW - margins.right, headerY, { align: 'right' });
      }
    }

    // Draw footer
    if (hasFooter) {
      const footerY = pageH - margins.bottom + 3;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      if (settings.footer.left) {
        doc.text(expandHeaderFooterTemplate(settings.footer.left, ctx), margins.left, footerY);
      }
      if (settings.footer.center) {
        doc.text(expandHeaderFooterTemplate(settings.footer.center, ctx), pageW / 2, footerY, { align: 'center' });
      }
      if (settings.footer.right) {
        doc.text(expandHeaderFooterTemplate(settings.footer.right, ctx), pageW - margins.right, footerY, { align: 'right' });
      }
    }

    // Content area start
    let contentY = margins.top;
    if (hasHeader) contentY += 10;

    // Draw cells
    let curY = contentY;
    for (let r = page.startRow; r < page.endRow; r++) {
      let curX = margins.left;
      const rh = pxToMm(rowHeights(r));

      for (let c = page.startCol; c < page.endCol; c++) {
        const cw = pxToMm(colWidths(c));
        const cell = getCellData(c, r);

        // Draw grid lines
        if (settings.showGridLines) {
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.1);
          doc.rect(curX, curY, cw, rh);
        }

        // Draw cell background
        if (cell?.style?.backgroundColor) {
          const bgColor = parseColor(cell.style.backgroundColor);
          if (bgColor) {
            doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
            doc.rect(curX, curY, cw, rh, 'F');
            // Re-draw grid lines on top of fill
            if (settings.showGridLines) {
              doc.setDrawColor(200, 200, 200);
              doc.setLineWidth(0.1);
              doc.rect(curX, curY, cw, rh);
            }
          }
        }

        // Draw cell text
        if (cell) {
          const displayValue = formatDisplayValue(
            cell.displayValue ?? '',
            cell.style?.numberFormat ?? 'auto',
          );
          if (displayValue) {
            applyTextStyle(doc, cell.style);
            const textX = curX + 1;
            const textY = curY + rh / 2 + 1;
            doc.text(displayValue, textX, textY, {
              maxWidth: cw - 2,
              baseline: 'middle',
            });
          }
        }

        curX += cw;
      }
      curY += rh;
    }

    // Draw cell borders (explicit borders)
    curY = contentY;
    for (let r = page.startRow; r < page.endRow; r++) {
      let curX = margins.left;
      const rh = pxToMm(rowHeights(r));
      for (let c = page.startCol; c < page.endCol; c++) {
        const cw = pxToMm(colWidths(c));
        const cell = getCellData(c, r);
        if (cell?.style?.borders) {
          drawBorders(doc, curX, curY, cw, rh, cell.style.borders);
        }
        curX += cw;
      }
      curY += rh;
    }
  }

  doc.save(`${resolveFilename(documentTitle ?? sheetName)}.pdf`);
}

function applyTextStyle(doc: jsPDF, style?: CellStyle): void {
  doc.setTextColor(0, 0, 0);
  let fontSize = 10;
  if (style?.fontSize) {
    fontSize = style.fontSize * 0.75; // pt to pdf size approximation
  }
  doc.setFontSize(fontSize);

  let fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';
  if (style?.bold && style?.italic) fontStyle = 'bolditalic';
  else if (style?.bold) fontStyle = 'bold';
  else if (style?.italic) fontStyle = 'italic';
  doc.setFont('helvetica', fontStyle);

  if (style?.textColor) {
    const color = parseColor(style.textColor);
    if (color) {
      doc.setTextColor(color.r, color.g, color.b);
    }
  }
}

function drawBorders(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  borders: import('../types/grid').CellBorders,
): void {
  doc.setLineWidth(0.2);
  if (borders.top) {
    const color = parseColor(borders.top.color) ?? { r: 0, g: 0, b: 0 };
    doc.setDrawColor(color.r, color.g, color.b);
    doc.line(x, y, x + w, y);
  }
  if (borders.right) {
    const color = parseColor(borders.right.color) ?? { r: 0, g: 0, b: 0 };
    doc.setDrawColor(color.r, color.g, color.b);
    doc.line(x + w, y, x + w, y + h);
  }
  if (borders.bottom) {
    const color = parseColor(borders.bottom.color) ?? { r: 0, g: 0, b: 0 };
    doc.setDrawColor(color.r, color.g, color.b);
    doc.line(x, y + h, x + w, y + h);
  }
  if (borders.left) {
    const color = parseColor(borders.left.color) ?? { r: 0, g: 0, b: 0 };
    doc.setDrawColor(color.r, color.g, color.b);
    doc.line(x, y, x, y + h);
  }
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    }
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
  }
  return null;
}
