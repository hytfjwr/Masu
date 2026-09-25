/** 用紙サイズ */
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal';

/** 用紙の向き */
export type Orientation = 'portrait' | 'landscape';

/** 余白プリセット */
export type MarginPreset = 'normal' | 'narrow' | 'wide' | 'custom';

/** 余白設定（mm単位） */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 印刷範囲の種類 */
export type PrintArea = 'selection' | 'activeSheet' | 'workbook';

/** ヘッダー/フッター設定 */
export interface HeaderFooterConfig {
  left: string;
  center: string;
  right: string;
}

/** 印刷設定 */
export interface PrintSettings {
  paperSize: PaperSize;
  orientation: Orientation;
  marginPreset: MarginPreset;
  customMargins?: Margins;
  printArea: PrintArea;
  showGridLines: boolean;
  header: HeaderFooterConfig;
  footer: HeaderFooterConfig;
}

/** 用紙サイズの寸法（mm） */
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

/** 余白プリセットの値（mm） */
export const MARGIN_PRESETS: Record<Exclude<MarginPreset, 'custom'>, Margins> = {
  normal: { top: 20, right: 20, bottom: 20, left: 20 },
  narrow: { top: 10, right: 10, bottom: 10, left: 10 },
  wide: { top: 25, right: 30, bottom: 25, left: 30 },
};

/** ページレイアウトの計算結果 */
export interface PageLayout {
  /** 総ページ数 */
  totalPages: number;
  /** 各ページに含まれるセル範囲 */
  pages: PageContent[];
}

/** 1ページ分のコンテンツ */
export interface PageContent {
  /** ページ番号（1-indexed） */
  pageNumber: number;
  /** 開始列インデックス */
  startCol: number;
  /** 終了列インデックス（exclusive） */
  endCol: number;
  /** 開始行インデックス */
  startRow: number;
  /** 終了行インデックス（exclusive） */
  endRow: number;
}
