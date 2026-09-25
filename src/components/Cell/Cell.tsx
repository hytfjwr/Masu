import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CellData, MergeInfo } from '../../types/grid';
import type { SparklineConfig } from '../../types/sparkline';
import { getCellDisplay } from '../../utils/cellDisplay';
import { computeSparklineCommands } from '../../sparkline/renderer';
import { applyCommands } from '../../sparkline/canvasApplier';
import { noteCellCommit } from '../../devtools/renderStats';
import { useI18n } from '../../i18n/useI18n';

const VERTICAL_ALIGN_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
const HORIZONTAL_ALIGN_JUSTIFY = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;

/** Data-validation-driven display mode for a cell (checkbox toggle / dropdown chip or arrow). */
export type CellValidationUi =
  | { kind: 'checkbox'; checked: boolean }
  | { kind: 'dropdown'; style: 'chip' | 'arrow' };

interface CellProps {
  col: number;
  row: number;
  data: CellData | undefined;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  conditionalStyle?: Partial<import('../../types/grid').CellStyle>;
  left: number;
  top: number;
  width: number;
  height: number;
  onMouseDown: (col: number, row: number, shiftKey: boolean) => void;
  onDoubleClick: () => void;
  onContextMenu?: (col: number, row: number, x: number, y: number) => void;
  mergeInfo?: MergeInfo;
  hasComment?: boolean;
  onMouseEnter?: (col: number, row: number) => void;
  onMouseLeave?: () => void;
  sparklineConfig?: SparklineConfig;
  sparklineValues?: number[];
  sparklineGroupScale?: { min: number; max: number };
  /** Combined width (own width + empty cells to the right) available for overflow display. undefined = no overflow. */
  overflowWidth?: number;
  /** Data validation display mode (checkbox / dropdown), computed by Grid from the cell's ValidationRule. */
  validationUi?: CellValidationUi;
  /** Set when the cell's rawValue fails its ValidationRule; shown as a red corner triangle + native tooltip. */
  invalidMessage?: string;
  onCheckboxToggle?: (col: number, row: number) => void;
  /** Opens the ValidationDropdown positioned against this cell's bounding rect. */
  onDropdownOpen?: (col: number, row: number, rect: DOMRect) => void;
  /** Draw the static active-cell outline. false where Grid's gliding SelectionCursor draws it instead. */
  activeOutline?: boolean;
  /** Identity of the content shown (the sheet id): a display change only flashes within the same scope + position. */
  flashScope?: string;
  /** Set right after a sort moved this row: slide in from `dy` px away (`phase` restarts it per sort). */
  sortMotion?: { dy: number; delay: number; phase: number };
}

export const Cell = memo(function Cell({
  col,
  row,
  data,
  isActive,
  isSelected,
  isEditing,
  conditionalStyle,
  left,
  top,
  width,
  height,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  mergeInfo,
  hasComment,
  onMouseEnter,
  onMouseLeave,
  sparklineConfig,
  sparklineValues,
  sparklineGroupScale,
  overflowWidth,
  validationUi,
  invalidMessage,
  onCheckboxToggle,
  onDropdownOpen,
  activeOutline = true,
  flashScope,
  sortMotion,
}: CellProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect required: developer-tool render instrumentation (counts every commit of this cell,
  // and flashes it when the Rendering tab asks) — runs after each render by design (no deps)
  useLayoutEffect(() => {
    noteCellCommit(rootRef.current);
  });

  // useEffect required: draws sparkline on canvas when sparkline config is present
  useEffect(() => {
    if (!sparklineConfig || !sparklineValues || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const commands = computeSparklineCommands(
      sparklineConfig.type,
      sparklineValues,
      width,
      height,
      sparklineConfig.colors,
      sparklineGroupScale,
    );
    applyCommands(ctx, commands);
  }, [sparklineConfig, sparklineValues, sparklineGroupScale, width, height]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ctrl/Cmd+click opens hyperlink
      if (data?.hyperlink && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(data.hyperlink.url, '_blank', 'noopener,noreferrer');
        return;
      }
      // Prevent the browser's default mousedown focus-shift, so clicking a cell never blurs
      // the persistently-focused cell editor (or the formula bar) while it's mid-edit.
      e.preventDefault();
      onMouseDown(col, row, e.shiftKey);
    },
    [col, row, onMouseDown, data?.hyperlink],
  );

  const handleDoubleClick = useCallback(() => {
    onDoubleClick();
  }, [onDoubleClick]);

  const hasError = data?.error !== undefined;

  // Merge base style with conditional format style (conditional wins)
  const baseStyle = data?.style;
  const mergedStyle = conditionalStyle
    ? baseStyle
      ? { ...baseStyle, ...conditionalStyle }
      : conditionalStyle
    : baseStyle;

  const display = useMemo(
    () => getCellDisplay(data, mergedStyle),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      data?.rawValue,
      data?.displayValue,
      data?.computed,
      data?.error,
      mergedStyle?.numberFormat,
      mergedStyle?.numberFormatPattern,
      mergedStyle?.textAlign,
    ],
  );

  // Value-change ripple: bump a counter when the displayed text changes while this component still shows
  // the same cell of the same sheet (virtualized components get reused for other cells / sheets — no flash).
  const [flash, setFlash] = useState({ col, row, scope: flashScope, text: display.text, count: 0 });
  if (
    flash.text !== display.text ||
    flash.col !== col ||
    flash.row !== row ||
    flash.scope !== flashScope
  ) {
    // A row that just slid into place after a sort doesn't also flash
    const sameCell =
      flash.col === col && flash.row === row && flash.scope === flashScope && !sortMotion;
    setFlash({
      col,
      row,
      scope: flashScope,
      text: display.text,
      count: sameCell ? flash.count + 1 : flash.count,
    });
  }

  const verticalAlign = mergedStyle?.verticalAlign ?? 'bottom';

  const textDecoration =
    mergedStyle?.underline && mergedStyle?.strikethrough
      ? 'underline line-through'
      : mergedStyle?.underline
        ? 'underline'
        : mergedStyle?.strikethrough
          ? 'line-through'
          : undefined;

  // Compute cell content styles from CellStyle
  const cellContentStyle: React.CSSProperties = useMemo(
    () => ({
      fontWeight: mergedStyle?.bold ? 'bold' : undefined,
      fontStyle: mergedStyle?.italic ? 'italic' : undefined,
      textDecoration,
      textAlign: display.align,
      color: display.color ?? mergedStyle?.textColor ?? undefined,
      fontSize: mergedStyle?.fontSize ? `${mergedStyle.fontSize}pt` : undefined,
      fontFamily: mergedStyle?.fontFamily ?? undefined,
    }),
    [
      mergedStyle?.bold,
      mergedStyle?.italic,
      textDecoration,
      display.align,
      display.color,
      mergedStyle?.textColor,
      mergedStyle?.fontSize,
      mergedStyle?.fontFamily,
    ],
  );

  // Determine background: user-set bg color, active cell, or selected range
  const bgColor = mergedStyle?.backgroundColor;
  const bgClass = bgColor ? '' : isSelected && !isActive ? 'bg-accent-selection/10' : 'bg-grid-bg';

  // Border styles from CellStyle.borders
  const borders = mergedStyle?.borders;
  const borderStyleMap = {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted',
    double: 'double',
    thick: 'solid',
  };
  const borderWidthMap = {
    solid: '1px',
    dashed: '1px',
    dotted: '1px',
    double: '3px',
    thick: '2px',
  };

  // Non-anchor merge cells are hidden
  const isNonAnchorMerge = mergeInfo && mergeInfo.colSpan === 0 && mergeInfo.rowSpan === 0;

  // Overflow: long text spills into the empty cell(s) to the right (Grid computes overflowWidth)
  const isOverflowing = overflowWidth !== undefined && overflowWidth > width;

  const positionStyle: React.CSSProperties = useMemo(() => {
    const s: React.CSSProperties = {
      left,
      top,
      width,
      height,
    };
    if (isNonAnchorMerge) {
      s.display = 'none';
      return s;
    }
    if (bgColor) s.backgroundColor = bgColor;
    if (isActive && activeOutline) {
      s.outline = '2px solid var(--color-accent-selection)';
      s.outlineOffset = '-1px';
      s.zIndex = 2;
      s.boxShadow = '0 0 8px color-mix(in srgb, var(--color-accent-selection) 25%, transparent)';
    } else if (isActive || isSelected || isOverflowing) {
      s.zIndex = 1;
    }
    if (isOverflowing) {
      s.overflow = 'visible';
    }
    // Spill cell indicator
    if (data?.spillSource) {
      s.borderStyle = 'dotted';
      s.borderColor = 'var(--color-accent-spill)';
      s.borderWidth = '1px';
    }
    // Explicit borders override default grid lines
    if (borders?.top) {
      s.borderTopWidth = borderWidthMap[borders.top.style];
      s.borderTopStyle = borderStyleMap[borders.top.style] as React.CSSProperties['borderTopStyle'];
      s.borderTopColor = borders.top.color;
    }
    if (borders?.right) {
      s.borderRightWidth = borderWidthMap[borders.right.style];
      s.borderRightStyle = borderStyleMap[
        borders.right.style
      ] as React.CSSProperties['borderRightStyle'];
      s.borderRightColor = borders.right.color;
    }
    if (borders?.bottom) {
      s.borderBottomWidth = borderWidthMap[borders.bottom.style];
      s.borderBottomStyle = borderStyleMap[
        borders.bottom.style
      ] as React.CSSProperties['borderBottomStyle'];
      s.borderBottomColor = borders.bottom.color;
    }
    if (borders?.left) {
      s.borderLeftWidth = borderWidthMap[borders.left.style];
      s.borderLeftStyle = borderStyleMap[
        borders.left.style
      ] as React.CSSProperties['borderLeftStyle'];
      s.borderLeftColor = borders.left.color;
    }
    return s;
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    left,
    top,
    width,
    height,
    bgColor,
    isActive,
    activeOutline,
    isSelected,
    isNonAnchorMerge,
    isOverflowing,
    borders?.top?.style,
    borders?.top?.color,
    borders?.right?.style,
    borders?.right?.color,
    borders?.bottom?.style,
    borders?.bottom?.color,
    borders?.left?.style,
    borders?.left?.color,
    data?.spillSource,
  ]);

  const wrapText = mergedStyle?.wrapText ?? false;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(col, row, e.clientX, e.clientY);
    },
    [col, row, onContextMenu],
  );

  const handleMouseEnter = useCallback(() => {
    onMouseEnter?.(col, row);
  }, [col, row, onMouseEnter]);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCheckboxToggle?.(col, row);
    },
    [onCheckboxToggle, col, row],
  );

  const openDropdown = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) onDropdownOpen?.(col, row, rect);
  }, [onDropdownOpen, col, row]);

  // Clicking the ▾ trigger always opens the dropdown; clicking the chip itself only opens it
  // once the cell is already active (the first click on an inactive cell just selects it).
  const handleDropdownArrowClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openDropdown();
    },
    [openDropdown],
  );
  const handleDropdownChipClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) return;
      e.stopPropagation();
      openDropdown();
    },
    [isActive, openDropdown],
  );

  // Conditionally suppress default border classes when explicit borders are set
  const borderClasses = [
    borders?.right ? '' : 'border-r',
    borders?.bottom ? '' : 'border-b',
    'border-grid-line',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      role="gridcell"
      aria-colindex={col + 1}
      aria-rowindex={row + 2}
      data-col={col}
      data-row={row}
      className={`absolute ${borderClasses} overflow-hidden ${bgClass}`}
      style={
        sortMotion
          ? {
              ...positionStyle,
              zIndex: 3,
              ['--sort-dy' as string]: `${sortMotion.dy}px`,
              // Alternate between two identical keyframes so a second sort restarts the animation
              animation: `${sortMotion.phase % 2 ? 'cell-sort-a' : 'cell-sort-b'} 640ms cubic-bezier(0.32, 0.72, 0, 1) ${sortMotion.delay}ms both`,
            }
          : positionStyle
      }
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
      title={
        invalidMessage ??
        (data?.parseError
          ? t('grid.cell.formulaError', { message: data.parseError.message })
          : undefined)
      }
      {...(isActive && activeOutline ? { 'data-active-cell-indicator': true } : {})}
    >
      {flash.count > 0 && !isEditing && (
        <span
          key={flash.count}
          aria-hidden
          className="cell-flash"
          style={{ ['--c' as string]: col, ['--r' as string]: row }}
        />
      )}
      {/* Invalid-input indicator takes priority over the comment triangle when both apply */}
      {invalidMessage && !isEditing ? (
        <div
          className="absolute top-0 right-0 w-0 h-0 z-10"
          style={{
            borderLeft: '5px solid transparent',
            borderTop: '5px solid #d93025',
          }}
        />
      ) : (
        hasComment &&
        !isEditing && (
          <div
            className="absolute top-0 right-0 w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderTop: '5px solid #EF4444',
            }}
          />
        )
      )}
      {isEditing ? null : validationUi?.kind === 'checkbox' ? (
        <div
          className="w-full h-full flex items-center justify-center cursor-pointer"
          onClick={handleCheckboxClick}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            {validationUi.checked ? (
              <>
                <rect
                  x="1"
                  y="1"
                  width="14"
                  height="14"
                  rx="2"
                  fill="var(--color-accent-selection)"
                />
                <path
                  d="M4 8.3l2.7 2.7 5-6"
                  stroke="white"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              <rect
                x="1.5"
                y="1.5"
                width="13"
                height="13"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="1.5"
              />
            )}
          </svg>
        </div>
      ) : sparklineConfig && sparklineValues ? (
        <canvas ref={canvasRef} className="w-full h-full" style={{ width, height }} />
      ) : (
        <div
          className={`w-full px-1 select-none text-[13px] ${wrapText ? 'overflow-hidden' : 'h-full'} ${hasError ? 'text-error' : ''} ${data?.hyperlink ? 'text-accent-link underline cursor-pointer' : ''}`}
          style={{
            display: 'flex',
            ...(wrapText
              ? {
                  flexDirection: 'column',
                  justifyContent: VERTICAL_ALIGN_ITEMS[verticalAlign],
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                  height,
                  paddingTop: '2px',
                }
              : {
                  alignItems: VERTICAL_ALIGN_ITEMS[verticalAlign],
                  justifyContent: HORIZONTAL_ALIGN_JUSTIFY[display.align],
                  lineHeight: '1.4',
                  paddingTop: '2px',
                  paddingBottom: '2px',
                }),
            ...cellContentStyle,
            ...(data?.hyperlink
              ? { color: 'var(--color-accent-link)', textDecoration: 'underline' }
              : {}),
          }}
        >
          {wrapText ? (
            display.text
          ) : validationUi?.kind === 'dropdown' ? (
            validationUi.style === 'chip' ? (
              display.text ? (
                <span
                  className="inline-flex items-center gap-1 max-w-full rounded-full px-2 bg-grid-line/60 text-[12px] cursor-pointer"
                  onClick={handleDropdownChipClick}
                >
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {display.text}
                  </span>
                  <span
                    className="shrink-0 text-[9px] text-text-primary/60"
                    onClick={handleDropdownArrowClick}
                  >
                    ▾
                  </span>
                </span>
              ) : (
                <span
                  className="text-[9px] text-text-primary/60 cursor-pointer px-1"
                  onClick={handleDropdownArrowClick}
                >
                  ▾
                </span>
              )
            ) : (
              <>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                  {display.text}
                </span>
                <span
                  className="shrink-0 text-[9px] text-text-primary/60 cursor-pointer pr-0.5"
                  onClick={handleDropdownArrowClick}
                >
                  ▾
                </span>
              </>
            )
          ) : (
            <span
              className={
                isOverflowing
                  ? 'whitespace-nowrap'
                  : 'overflow-hidden text-ellipsis whitespace-nowrap'
              }
              style={
                isOverflowing
                  ? { maxWidth: overflowWidth, overflow: 'hidden', flexShrink: 0 }
                  : undefined
              }
            >
              {display.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
