import { describe, it, expect } from 'vitest';
import {
  pxToMm,
  mmToPx,
  resolveMargins,
  computePrintableArea,
  expandHeaderFooterTemplate,
  computePageLayout,
} from './layoutCalculator';
import type { PrintSettings } from '../types/print';

function defaultSettings(overrides: Partial<PrintSettings> = {}): PrintSettings {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    marginPreset: 'normal',
    printArea: 'activeSheet',
    showGridLines: true,
    header: { left: '', center: '', right: '' },
    footer: { left: '', center: '', right: '' },
    ...overrides,
  };
}

describe('pxToMm / mmToPx', () => {
  it('round-trips with reasonable precision', () => {
    const original = 100;
    const mm = pxToMm(original);
    const px = mmToPx(mm);
    expect(Math.abs(px - original)).toBeLessThan(0.01);
  });

  it('96px = 25.4mm', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 1);
  });

  it('25.4mm = 96px', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 1);
  });
});

describe('resolveMargins', () => {
  it('returns normal preset values', () => {
    const margins = resolveMargins(defaultSettings({ marginPreset: 'normal' }));
    expect(margins).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it('returns narrow preset values', () => {
    const margins = resolveMargins(defaultSettings({ marginPreset: 'narrow' }));
    expect(margins).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
  });

  it('returns wide preset values', () => {
    const margins = resolveMargins(defaultSettings({ marginPreset: 'wide' }));
    expect(margins).toEqual({ top: 25, right: 30, bottom: 25, left: 30 });
  });

  it('returns custom margins when specified', () => {
    const custom = { top: 15, right: 25, bottom: 15, left: 25 };
    const margins = resolveMargins(
      defaultSettings({
        marginPreset: 'custom',
        customMargins: custom,
      }),
    );
    expect(margins).toEqual(custom);
  });
});

describe('computePrintableArea', () => {
  it('A4 portrait with normal margins', () => {
    const area = computePrintableArea('A4', 'portrait', {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(area.width).toBeCloseTo(170, 0); // 210 - 20 - 20
    expect(area.height).toBeCloseTo(257, 0); // 297 - 20 - 20
  });

  it('A4 landscape with normal margins', () => {
    const area = computePrintableArea('A4', 'landscape', {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(area.width).toBeCloseTo(257, 0); // 297 - 20 - 20
    expect(area.height).toBeCloseTo(170, 0); // 210 - 20 - 20
  });

  it('A3 portrait', () => {
    const area = computePrintableArea('A3', 'portrait', {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(area.width).toBeCloseTo(257, 0); // 297 - 40
    expect(area.height).toBeCloseTo(380, 0); // 420 - 40
  });

  it('Letter portrait', () => {
    const area = computePrintableArea('Letter', 'portrait', {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(area.width).toBeCloseTo(175.9, 0); // 215.9 - 40
    expect(area.height).toBeCloseTo(239.4, 0); // 279.4 - 40
  });
});

describe('expandHeaderFooterTemplate', () => {
  it('expands {pageNumber}', () => {
    const result = expandHeaderFooterTemplate('{pageNumber}', {
      pageNumber: 3,
      totalPages: 10,
      sheetName: 'Sheet1',
      date: '2024-01-01',
    });
    expect(result).toBe('3');
  });

  it('expands {totalPages}', () => {
    const result = expandHeaderFooterTemplate('{totalPages}', {
      pageNumber: 1,
      totalPages: 5,
      sheetName: 'Sheet1',
      date: '2024-01-01',
    });
    expect(result).toBe('5');
  });

  it('expands {sheetName}', () => {
    const result = expandHeaderFooterTemplate('{sheetName}', {
      pageNumber: 1,
      totalPages: 1,
      sheetName: 'MySheet',
      date: '2024-01-01',
    });
    expect(result).toBe('MySheet');
  });

  it('expands {date}', () => {
    const result = expandHeaderFooterTemplate('{date}', {
      pageNumber: 1,
      totalPages: 1,
      sheetName: 'Sheet1',
      date: '2024-06-15',
    });
    expect(result).toBe('2024-06-15');
  });

  it('returns template without variables as-is', () => {
    const result = expandHeaderFooterTemplate('No variables here', {
      pageNumber: 1,
      totalPages: 1,
      sheetName: 'Sheet1',
      date: '2024-01-01',
    });
    expect(result).toBe('No variables here');
  });

  it('expands multiple variables simultaneously', () => {
    const result = expandHeaderFooterTemplate('ページ {pageNumber}/{totalPages} - {sheetName}', {
      pageNumber: 2,
      totalPages: 5,
      sheetName: '売上',
      date: '2024-01-01',
    });
    expect(result).toBe('ページ 2/5 - 売上');
  });
});

describe('computePageLayout', () => {
  const constantWidth = () => 100; // 100px per column
  const constantHeight = () => 24; // 24px per row

  it('small data fits in 1 page on A4 portrait', () => {
    const layout = computePageLayout(
      defaultSettings(),
      constantWidth,
      constantHeight,
      { startCol: 0, endCol: 4, startRow: 0, endRow: 9 }, // 5 cols x 10 rows
    );
    expect(layout.totalPages).toBe(1);
    expect(layout.pages[0].startCol).toBe(0);
    expect(layout.pages[0].endCol).toBe(5);
    expect(layout.pages[0].startRow).toBe(0);
    expect(layout.pages[0].endRow).toBe(10);
  });

  it('many rows split into multiple pages', () => {
    const layout = computePageLayout(
      defaultSettings(),
      constantWidth,
      constantHeight,
      { startCol: 0, endCol: 4, startRow: 0, endRow: 99 }, // 5 cols x 100 rows
    );
    expect(layout.totalPages).toBeGreaterThan(1);
    // Each page should have correct row ranges
    for (const page of layout.pages) {
      expect(page.startRow).toBeLessThan(page.endRow);
    }
  });

  it('landscape orientation gives different page break', () => {
    const portraitLayout = computePageLayout(
      defaultSettings({ orientation: 'portrait' }),
      constantWidth,
      constantHeight,
      { startCol: 0, endCol: 4, startRow: 0, endRow: 99 },
    );
    const landscapeLayout = computePageLayout(
      defaultSettings({ orientation: 'landscape' }),
      constantWidth,
      constantHeight,
      { startCol: 0, endCol: 4, startRow: 0, endRow: 99 },
    );
    // Landscape should have fewer row pages but same col pages
    expect(landscapeLayout.totalPages).not.toBe(portraitLayout.totalPages);
  });

  it('page breaks occur at cell boundaries', () => {
    const layout = computePageLayout(defaultSettings(), constantWidth, constantHeight, {
      startCol: 0,
      endCol: 9,
      startRow: 0,
      endRow: 99,
    });
    for (const page of layout.pages) {
      // Start/end should be integer indices
      expect(Number.isInteger(page.startCol)).toBe(true);
      expect(Number.isInteger(page.endCol)).toBe(true);
      expect(Number.isInteger(page.startRow)).toBe(true);
      expect(Number.isInteger(page.endRow)).toBe(true);
    }
  });

  it('selection range limits the print area', () => {
    const layout = computePageLayout(
      defaultSettings({ printArea: 'selection' }),
      constantWidth,
      constantHeight,
      { startCol: 2, endCol: 4, startRow: 5, endRow: 10 },
    );
    expect(layout.pages[0].startCol).toBe(2);
    expect(layout.pages[0].startRow).toBe(5);
  });

  it('page numbers are sequential', () => {
    const layout = computePageLayout(defaultSettings(), constantWidth, constantHeight, {
      startCol: 0,
      endCol: 9,
      startRow: 0,
      endRow: 99,
    });
    for (let i = 0; i < layout.pages.length; i++) {
      expect(layout.pages[i].pageNumber).toBe(i + 1);
    }
  });
});
