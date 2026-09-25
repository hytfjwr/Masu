import { memo, useCallback } from 'react';
import type { CellBorders, CellStyle, NumberFormat, TextAlign, VerticalAlign } from '../../types/grid';
import { FONT_SIZES, FONT_FAMILIES } from '../../types/grid';
import { ColorPicker } from './ColorPicker';
import { BorderPicker } from './BorderPicker';
import { NumberFormatDropdown } from './NumberFormatDropdown';
import { HoverGlider } from '../HoverGlider';

const ZOOM_OPTIONS = [50, 75, 90, 100, 125, 150, 200];

interface ToolbarProps {
  activeCellStyle?: CellStyle;
  onSetStyle?: (style: Partial<CellStyle>) => void;
  canMerge?: boolean;
  isMerged?: boolean;
  onMerge?: () => void;
  onUnmerge?: () => void;
  // Undo / redo
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Format painter (paint format)
  onFormatPainter?: () => void;
  formatPainterActive?: boolean;
  // Zoom
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  // Number format
  onIncreaseDecimals?: () => void;
  onDecreaseDecimals?: () => void;
  onSetNumberFormat?: (format: NumberFormat, pattern?: string) => void;
  /** Active cell's numeric value, used to preview a custom pattern in the format dropdown */
  activeCellValue?: number;
  // Clear formatting
  onClearFormatting?: () => void;
}

export const Toolbar = memo(function Toolbar({
  activeCellStyle,
  onSetStyle,
  canMerge,
  isMerged,
  onMerge,
  onUnmerge,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFormatPainter,
  formatPainterActive,
  zoom,
  onZoomChange,
  onIncreaseDecimals,
  onDecreaseDecimals,
  onSetNumberFormat,
  activeCellValue,
  onClearFormatting,
}: ToolbarProps) {
  const isBold = activeCellStyle?.bold ?? false;
  const isItalic = activeCellStyle?.italic ?? false;
  const isUnderline = activeCellStyle?.underline ?? false;
  const isStrikethrough = activeCellStyle?.strikethrough ?? false;
  const isWrapText = activeCellStyle?.wrapText ?? false;
  const currentAlign = activeCellStyle?.textAlign ?? 'left';
  const currentVerticalAlign = activeCellStyle?.verticalAlign ?? 'bottom';
  const currentBgColor = activeCellStyle?.backgroundColor;
  const currentTextColor = activeCellStyle?.textColor;
  const currentNumberFormat = activeCellStyle?.numberFormat ?? 'auto';
  const currentFontSize = activeCellStyle?.fontSize;
  const currentFontFamily = activeCellStyle?.fontFamily;

  const toggleBold = useCallback(() => {
    onSetStyle?.({ bold: !isBold });
  }, [onSetStyle, isBold]);

  const toggleItalic = useCallback(() => {
    onSetStyle?.({ italic: !isItalic });
  }, [onSetStyle, isItalic]);

  const toggleUnderline = useCallback(() => {
    onSetStyle?.({ underline: !isUnderline });
  }, [onSetStyle, isUnderline]);

  const toggleStrikethrough = useCallback(() => {
    onSetStyle?.({ strikethrough: !isStrikethrough });
  }, [onSetStyle, isStrikethrough]);

  const toggleWrapText = useCallback(() => {
    onSetStyle?.({ wrapText: !isWrapText });
  }, [onSetStyle, isWrapText]);

  const setAlign = useCallback(
    (align: TextAlign) => {
      onSetStyle?.({ textAlign: align });
    },
    [onSetStyle],
  );

  const setVerticalAlign = useCallback(
    (align: VerticalAlign) => {
      onSetStyle?.({ verticalAlign: align });
    },
    [onSetStyle],
  );

  const setBgColor = useCallback(
    (color: string | undefined) => {
      onSetStyle?.({ backgroundColor: color });
    },
    [onSetStyle],
  );

  const setTextColor = useCallback(
    (color: string | undefined) => {
      onSetStyle?.({ textColor: color });
    },
    [onSetStyle],
  );

  const setFontSize = useCallback(
    (size: number | undefined) => {
      onSetStyle?.({ fontSize: size });
    },
    [onSetStyle],
  );

  const setFontFamily = useCallback(
    (family: string | undefined) => {
      onSetStyle?.({ fontFamily: family });
    },
    [onSetStyle],
  );

  const setBorders = useCallback(
    (borders: CellBorders | undefined) => {
      onSetStyle?.({ borders });
    },
    [onSetStyle],
  );

  const btnBase = 'flex items-center justify-center w-7 h-7 rounded transition-all duration-100 text-text-primary text-xs active:scale-90 shrink-0';
  const btnActive = 'bg-accent-selection/20 text-accent-selection';
  const btnInactive = ''; // hover feedback comes from the shared HoverGlider
  const separator = <div className="w-px h-5 bg-grid-line mx-1 shrink-0" />;

  return (
    <div
      className="toolbar-capsule flex items-center h-10 px-1.5 gap-0.5 min-w-0 flex-1 overflow-x-auto"
      data-toolbar
      data-hover-glide
    >
      <HoverGlider />
      {/* Undo / Redo */}
      {onUndo && (
        <button
          type="button"
          title="元に戻す (Ctrl+Z)"
          className={`${btnBase} ${btnInactive} ${!canUndo ? 'opacity-40' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onUndo();
          }}
          disabled={!canUndo}
          data-testid="toolbar-undo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
          </svg>
        </button>
      )}
      {onRedo && (
        <button
          type="button"
          title="やり直し (Ctrl+Y)"
          className={`${btnBase} ${btnInactive} ${!canRedo ? 'opacity-40' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onRedo();
          }}
          disabled={!canRedo}
          data-testid="toolbar-redo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M21 13a9 9 0 1 1-3-7.7L21 7" />
          </svg>
        </button>
      )}

      {/* Format painter (paint format) */}
      {onFormatPainter && (
        <button
          type="button"
          title="書式のコピー / 貼り付け"
          className={`${btnBase} ${formatPainterActive ? btnActive : btnInactive}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatPainter();
          }}
          data-testid="toolbar-format-painter"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3H8a1 1 0 0 0-1 1v4h10V4a1 1 0 0 0-1-1z" />
            <path d="M7 8h10v4a1 1 0 0 1-1 1h-2v8H10v-8H8a1 1 0 0 1-1-1z" />
          </svg>
        </button>
      )}

      {/* Zoom */}
      {onZoomChange && (
        <select
          value={zoom ?? 100}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="h-7 px-1 text-xs border border-grid-line rounded bg-ui-bg text-text-primary outline-none focus:border-accent-selection cursor-pointer shrink-0"
          title="ズーム"
          data-testid="toolbar-zoom"
        >
          {ZOOM_OPTIONS.map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
      )}

      {(onUndo || onRedo || onFormatPainter || onZoomChange) && separator}

      {/* Currency / Percent / decimal places */}
      {onSetNumberFormat && (
        <>
          <button
            type="button"
            title="通貨"
            className={`${btnBase} ${btnInactive}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSetNumberFormat('currency');
            }}
            data-testid="toolbar-currency"
          >
            ¥
          </button>
          <button
            type="button"
            title="パーセント"
            className={`${btnBase} ${btnInactive}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSetNumberFormat('percent');
            }}
            data-testid="toolbar-percent"
          >
            %
          </button>
        </>
      )}
      {onDecreaseDecimals && (
        <button
          type="button"
          title="小数点以下の桁数を減らす"
          className={`${btnBase} ${btnInactive} text-[10px]`}
          onMouseDown={(e) => {
            e.preventDefault();
            onDecreaseDecimals();
          }}
          data-testid="toolbar-decrease-decimals"
        >
          .0←
        </button>
      )}
      {onIncreaseDecimals && (
        <button
          type="button"
          title="小数点以下の桁数を増やす"
          className={`${btnBase} ${btnInactive} text-[10px]`}
          onMouseDown={(e) => {
            e.preventDefault();
            onIncreaseDecimals();
          }}
          data-testid="toolbar-increase-decimals"
        >
          .00→
        </button>
      )}
      {onSetNumberFormat && (
        <NumberFormatDropdown
          currentFormat={currentNumberFormat}
          currentPattern={activeCellStyle?.numberFormatPattern}
          previewValue={activeCellValue}
          onSetFormat={onSetNumberFormat}
        />
      )}

      {(onSetNumberFormat || onDecreaseDecimals || onIncreaseDecimals) && separator}

      {/* Font Family */}
      <select
        value={currentFontFamily ?? ''}
        onChange={(e) => setFontFamily(e.target.value || undefined)}
        className="h-7 px-1 text-xs border border-grid-line rounded bg-ui-bg text-text-primary outline-none focus:border-accent-selection cursor-pointer w-28 transition-[border-color,box-shadow] duration-150 shrink-0"
        title="フォント"
      >
        <option value="">標準</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font Size */}
      <select
        value={currentFontSize ?? ''}
        onChange={(e) => setFontSize(e.target.value ? Number(e.target.value) : undefined)}
        className="h-7 px-1 text-xs border border-grid-line rounded bg-ui-bg text-text-primary outline-none focus:border-accent-selection cursor-pointer w-14 transition-[border-color,box-shadow] duration-150 shrink-0"
        title="フォントサイズ"
      >
        <option value="">-</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {separator}

      {/* Bold */}
      <button
        type="button"
        title="太字 (Ctrl+B)"
        className={`${btnBase} font-bold ${isBold ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleBold();
        }}
        data-testid="toolbar-bold"
      >
        B
      </button>

      {/* Italic */}
      <button
        type="button"
        title="斜体 (Ctrl+I)"
        className={`${btnBase} italic ${isItalic ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleItalic();
        }}
        data-testid="toolbar-italic"
      >
        I
      </button>

      {/* Underline */}
      <button
        type="button"
        title="下線 (Ctrl+U)"
        className={`${btnBase} underline ${isUnderline ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleUnderline();
        }}
        data-testid="toolbar-underline"
      >
        U
      </button>

      {/* Strikethrough */}
      <button
        type="button"
        title="取り消し線 (Ctrl+Shift+X)"
        className={`${btnBase} line-through ${isStrikethrough ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleStrikethrough();
        }}
        data-testid="toolbar-strikethrough"
      >
        S
      </button>

      {/* Text Color */}
      <ColorPicker
        currentColor={currentTextColor}
        onColorChange={setTextColor}
        label="文字色"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z"/>
          </svg>
        }
      />

      {separator}

      {/* Background Color */}
      <ColorPicker
        currentColor={currentBgColor}
        onColorChange={setBgColor}
        label="背景色"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 000 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/>
            <path d="M2 20h20v4H2z" fill="currentColor" opacity="0.3"/>
          </svg>
        }
      />

      {/* Border Picker */}
      <BorderPicker onBordersChange={setBorders} />

      {/* Merge / Unmerge */}
      {isMerged ? (
        <button
          type="button"
          title="セル結合解除"
          className={`${btnBase} ${btnInactive} text-[10px]`}
          onMouseDown={(e) => {
            e.preventDefault();
            onUnmerge?.();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          title="セルを結合"
          className={`${btnBase} ${canMerge ? btnInactive : 'opacity-30 cursor-default'}`}
          onMouseDown={(e) => {
            e.preventDefault();
            if (canMerge) onMerge?.();
          }}
          disabled={!canMerge}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="8" y1="8" x2="16" y2="16" />
            <line x1="16" y1="8" x2="8" y2="16" />
          </svg>
        </button>
      )}

      {separator}

      {/* Horizontal alignment */}
      <button
        type="button"
        title="左揃え"
        className={`${btnBase} ${currentAlign === 'left' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setAlign('left');
        }}
        data-testid="toolbar-align-left"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
        </svg>
      </button>
      <button
        type="button"
        title="中央揃え"
        className={`${btnBase} ${currentAlign === 'center' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setAlign('center');
        }}
        data-testid="toolbar-align-center"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <button
        type="button"
        title="右揃え"
        className={`${btnBase} ${currentAlign === 'right' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setAlign('right');
        }}
        data-testid="toolbar-align-right"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Vertical alignment */}
      <button
        type="button"
        title="上揃え"
        className={`${btnBase} ${currentVerticalAlign === 'top' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setVerticalAlign('top');
        }}
        data-testid="toolbar-valign-top"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="3" x2="21" y2="3" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="14" x2="17" y2="14" />
        </svg>
      </button>
      <button
        type="button"
        title="上下中央揃え"
        className={`${btnBase} ${currentVerticalAlign === 'middle' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setVerticalAlign('middle');
        }}
        data-testid="toolbar-valign-middle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" /><line x1="7" y1="7" x2="17" y2="7" /><line x1="7" y1="17" x2="17" y2="17" />
        </svg>
      </button>
      <button
        type="button"
        title="下揃え"
        className={`${btnBase} ${currentVerticalAlign === 'bottom' ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setVerticalAlign('bottom');
        }}
        data-testid="toolbar-valign-bottom"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="21" x2="21" y2="21" /><line x1="7" y1="10" x2="17" y2="10" /><line x1="7" y1="15" x2="17" y2="15" />
        </svg>
      </button>

      {/* Wrap Text */}
      <button
        type="button"
        title="折り返して全体を表示"
        className={`${btnBase} ${isWrapText ? btnActive : btnInactive}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleWrapText();
        }}
        data-testid="toolbar-wrap-text"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
          <polyline points="13 15 11 18 13 21" />
        </svg>
      </button>

      {onClearFormatting && (
        <>
          {separator}
          <button
            type="button"
            title="書式をクリア (Ctrl+\)"
            className={`${btnBase} ${btnInactive} text-[10px]`}
            onMouseDown={(e) => {
              e.preventDefault();
              onClearFormatting();
            }}
            data-testid="toolbar-clear-formatting"
          >
            Tx
          </button>
        </>
      )}
    </div>
  );
});
