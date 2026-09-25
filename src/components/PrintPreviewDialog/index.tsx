import { memo, useCallback, useMemo, useState } from 'react';
import type { PrintSettings, PaperSize, Orientation, MarginPreset } from '../../types/print';
import type { CellData } from '../../types/grid';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';
import {
  computePageLayout,
  resolveMargins,
  computePrintableArea,
  pxToMm,
  expandHeaderFooterTemplate,
} from '../../print/layoutCalculator';
import { PAPER_DIMENSIONS } from '../../types/print';
import { formatDisplayValue } from '../../utils/numberFormat';

interface PrintPreviewDialogProps {
  visible: boolean;
  onClose: () => void;
  getCellData: (col: number, row: number) => CellData | undefined;
  colWidths: (colIndex: number) => number;
  rowHeights: (rowIndex: number) => number;
  dataRange: { startCol: number; endCol: number; startRow: number; endRow: number };
  sheetName: string;
  /** ドキュメントタイトル。PDF のファイル名 ("{documentTitle}.pdf") に使う。 */
  documentTitle?: string;
}

const PAPER_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'Letter', label: 'Letter' },
  { value: 'Legal', label: 'Legal' },
];

const ORIENTATION_OPTIONS: { value: Orientation; labelKey: MessageKey }[] = [
  { value: 'portrait', labelKey: 'dialogs.printPreview.orientationPortrait' },
  { value: 'landscape', labelKey: 'dialogs.printPreview.orientationLandscape' },
];

const MARGIN_OPTIONS: { value: MarginPreset; labelKey: MessageKey }[] = [
  { value: 'normal', labelKey: 'dialogs.printPreview.marginNormal' },
  { value: 'narrow', labelKey: 'dialogs.printPreview.marginNarrow' },
  { value: 'wide', labelKey: 'dialogs.printPreview.marginWide' },
];

export const PrintPreviewDialog = memo(function PrintPreviewDialog({
  visible,
  onClose,
  getCellData,
  colWidths,
  rowHeights,
  dataRange,
  sheetName,
  documentTitle,
}: PrintPreviewDialogProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<PrintSettings>({
    paperSize: 'A4',
    orientation: 'portrait',
    marginPreset: 'normal',
    printArea: 'activeSheet',
    showGridLines: true,
    header: { left: '', center: '{sheetName}', right: '' },
    footer: { left: '', center: '{pageNumber} / {totalPages}', right: '' },
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const layout = useMemo(
    () => computePageLayout(settings, colWidths, rowHeights, dataRange),
    [settings, colWidths, rowHeights, dataRange],
  );

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const { generatePDF } = await import('../../print/pdfGenerator');
      await generatePDF({
        settings,
        getCellData,
        colWidths,
        rowHeights,
        dataRange,
        sheetName,
        documentTitle,
      });
    } finally {
      setIsExporting(false);
    }
  }, [settings, getCellData, colWidths, rowHeights, dataRange, sheetName, documentTitle]);

  if (!visible) return null;

  const margins = resolveMargins(settings);
  const printable = computePrintableArea(settings.paperSize, settings.orientation, margins);
  const paper = PAPER_DIMENSIONS[settings.paperSize];
  const pageW = settings.orientation === 'landscape' ? paper.height : paper.width;
  const pageH = settings.orientation === 'landscape' ? paper.width : paper.height;

  // Preview scale: fit page into a fixed preview area
  const previewMaxW = 500;
  const previewMaxH = 600;
  const scale = Math.min(previewMaxW / pageW, previewMaxH / pageH);
  const previewW = pageW * scale;
  const previewH = pageH * scale;

  const page = layout.pages[currentPage];
  const hasHeader = settings.header.left || settings.header.center || settings.header.right;
  const hasFooter = settings.footer.left || settings.footer.center || settings.footer.right;
  const date = new Date().toLocaleDateString('ja-JP');
  const templateCtx = page
    ? {
        pageNumber: page.pageNumber,
        totalPages: layout.totalPages,
        sheetName,
        date,
      }
    : { pageNumber: 1, totalPages: 1, sheetName, date };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="glass-panel rounded-2xl flex max-h-[95vh] max-w-[95vw] animate-dialog-spring"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Left: Settings panel */}
        <div className="w-[240px] p-4 border-r border-grid-line overflow-y-auto">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {t('dialogs.printPreview.title')}
          </h3>

          <div className="space-y-3">
            {/* Paper size */}
            <label className="flex flex-col gap-1 text-xs text-text-primary">
              <span>{t('dialogs.printPreview.paperSizeLabel')}</span>
              <select
                value={settings.paperSize}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, paperSize: e.target.value as PaperSize }));
                  setCurrentPage(0);
                }}
                className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              >
                {PAPER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Orientation */}
            <label className="flex flex-col gap-1 text-xs text-text-primary">
              <span>{t('dialogs.printPreview.orientationLabel')}</span>
              <div className="flex gap-2">
                {ORIENTATION_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name="orientation"
                      checked={settings.orientation === o.value}
                      onChange={() => {
                        setSettings((s) => ({ ...s, orientation: o.value }));
                        setCurrentPage(0);
                      }}
                    />
                    <span>{t(o.labelKey)}</span>
                  </label>
                ))}
              </div>
            </label>

            {/* Margins */}
            <label className="flex flex-col gap-1 text-xs text-text-primary">
              <span>{t('dialogs.printPreview.marginsLabel')}</span>
              <select
                value={settings.marginPreset}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, marginPreset: e.target.value as MarginPreset }));
                  setCurrentPage(0);
                }}
                className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              >
                {MARGIN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            {/* Grid lines */}
            <label className="flex items-center gap-2 text-xs text-text-primary">
              <input
                type="checkbox"
                checked={settings.showGridLines}
                onChange={(e) => setSettings((s) => ({ ...s, showGridLines: e.target.checked }))}
              />
              <span>{t('dialogs.printPreview.showGridLines')}</span>
            </label>

            {/* Header */}
            <div className="flex flex-col gap-1 text-xs text-text-primary">
              <span>{t('dialogs.printPreview.headerCenterLabel')}</span>
              <input
                type="text"
                value={settings.header.center}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, header: { ...s.header, center: e.target.value } }))
                }
                placeholder="{sheetName}"
                className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              />
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-1 text-xs text-text-primary">
              <span>{t('dialogs.printPreview.footerCenterLabel')}</span>
              <input
                type="text"
                value={settings.footer.center}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, footer: { ...s.footer, center: e.target.value } }))
                }
                placeholder="{pageNumber} / {totalPages}"
                className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              />
            </div>

            <div className="text-[10px] text-text-primary/50">
              {t('dialogs.printPreview.variablesHint')}
            </div>
          </div>
        </div>

        {/* Right: Preview panel */}
        <div className="flex flex-col p-4">
          {/* Page navigation */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-primary">
              {t('dialogs.printPreview.pageIndicator', {
                page: currentPage + 1,
                total: layout.totalPages,
              })}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                className="h-6 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                {t('dialogs.printPreview.prevPage')}
              </button>
              <button
                type="button"
                className="h-6 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40 disabled:opacity-30"
                disabled={currentPage >= layout.totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                {t('dialogs.printPreview.nextPage')}
              </button>
            </div>
          </div>

          {/* Page preview */}
          <div
            className="bg-white border border-grid-line shadow-md overflow-hidden"
            style={{ width: previewW, height: previewH, position: 'relative' }}
          >
            {page && (
              <>
                {/* Header */}
                {hasHeader && (
                  <div
                    className="absolute text-[8px] text-gray-400 flex justify-between"
                    style={{
                      top: margins.top * scale,
                      left: margins.left * scale,
                      right: (pageW - margins.left - printable.width) * scale,
                      width: printable.width * scale,
                    }}
                  >
                    <span>{expandHeaderFooterTemplate(settings.header.left, templateCtx)}</span>
                    <span>{expandHeaderFooterTemplate(settings.header.center, templateCtx)}</span>
                    <span>{expandHeaderFooterTemplate(settings.header.right, templateCtx)}</span>
                  </div>
                )}

                {/* Cells */}
                <div
                  style={{
                    position: 'absolute',
                    top: (margins.top + (hasHeader ? 10 : 0)) * scale,
                    left: margins.left * scale,
                  }}
                >
                  {(() => {
                    const cells: React.ReactNode[] = [];
                    let curY = 0;
                    for (let r = page.startRow; r < page.endRow; r++) {
                      let curX = 0;
                      const rh = pxToMm(rowHeights(r)) * scale;
                      for (let c = page.startCol; c < page.endCol; c++) {
                        const cw = pxToMm(colWidths(c)) * scale;
                        const cell = getCellData(c, r);
                        const display = cell
                          ? formatDisplayValue(
                              cell.displayValue ?? '',
                              cell.style?.numberFormat ?? 'auto',
                            )
                          : '';
                        cells.push(
                          <div
                            key={`${c}-${r}`}
                            className="absolute overflow-hidden"
                            style={{
                              left: curX,
                              top: curY,
                              width: cw,
                              height: rh,
                              fontSize: '5px',
                              lineHeight: `${rh}px`,
                              paddingLeft: 1,
                              color: cell?.style?.textColor ?? '#000',
                              fontWeight: cell?.style?.bold ? 'bold' : 'normal',
                              backgroundColor: cell?.style?.backgroundColor ?? 'transparent',
                              borderRight: settings.showGridLines ? '0.5px solid #e0e0e0' : 'none',
                              borderBottom: settings.showGridLines ? '0.5px solid #e0e0e0' : 'none',
                            }}
                          >
                            {display}
                          </div>,
                        );
                        curX += cw;
                      }
                      curY += rh;
                    }
                    return cells;
                  })()}
                </div>

                {/* Footer */}
                {hasFooter && (
                  <div
                    className="absolute text-[8px] text-gray-400 flex justify-between"
                    style={{
                      bottom: (pageH - margins.top - printable.height - margins.bottom + 3) * scale,
                      left: margins.left * scale,
                      width: printable.width * scale,
                    }}
                  >
                    <span>{expandHeaderFooterTemplate(settings.footer.left, templateCtx)}</span>
                    <span>{expandHeaderFooterTemplate(settings.footer.center, templateCtx)}</span>
                    <span>{expandHeaderFooterTemplate(settings.footer.right, templateCtx)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              className="h-7 px-3 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-btn-primary
              className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90 disabled:opacity-50"
              onClick={handleExportPDF}
              disabled={isExporting}
            >
              {isExporting
                ? t('dialogs.printPreview.exporting')
                : t('dialogs.printPreview.exportPdf')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
