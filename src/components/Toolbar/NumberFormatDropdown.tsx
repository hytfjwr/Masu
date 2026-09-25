import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import type { NumberFormat } from '../../types/grid';
import { formatWithPattern } from '../../utils/numberFormat';

/** Sample value used to preview a custom pattern when the active cell has no numeric value. */
const FALLBACK_PREVIEW_VALUE = 1234.56;

const FORMAT_ITEMS: { format: NumberFormat; label: string; example?: string }[] = [
  { format: 'auto', label: '自動' },
  { format: 'plainText', label: '書式なしテキスト' },
  { format: 'number', label: '数値', example: '1,000.12' },
  { format: 'percent', label: 'パーセント', example: '10.12%' },
  { format: 'scientific', label: '指数', example: '1.01E+03' },
  { format: 'currency', label: '通貨', example: '¥1,000.12' },
  { format: 'date', label: '日付', example: '2026/09/26' },
  { format: 'time', label: '時刻', example: '15:59:00' },
  { format: 'datetime', label: '日時', example: '2026/09/26 15:59:00' },
];

const COMMON_CUSTOM_PATTERNS = [
  '#,##0',
  '#,##0.00',
  '0%',
  '0.00%',
  '"¥"#,##0',
  'yyyy/mm/dd',
  'yyyy"年"m"月"d"日"',
  'm/d',
  'h:mm',
  'yyyy/mm/dd h:mm',
  '#,##0;[Red]-#,##0',
];

interface NumberFormatDropdownProps {
  currentFormat: NumberFormat;
  currentPattern: string | undefined;
  previewValue: number | undefined;
  onSetFormat: (format: NumberFormat, pattern?: string) => void;
}

export const NumberFormatDropdown = memo(function NumberFormatDropdown({
  currentFormat,
  currentPattern,
  previewValue,
  onSetFormat,
}: NumberFormatDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // useEffect required: global click-outside listener for dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setShowCustom(false);
      return next;
    });
  }, []);

  const handlePresetClick = useCallback(
    (format: NumberFormat) => {
      onSetFormat(format);
      setIsOpen(false);
    },
    [onSetFormat],
  );

  const handleOpenCustom = useCallback(() => {
    setCustomInput(currentPattern ?? '');
    setShowCustom(true);
  }, [currentPattern]);

  const handleApplyCustom = useCallback(() => {
    if (!customInput.trim()) return;
    onSetFormat('custom', customInput.trim());
    setIsOpen(false);
    setShowCustom(false);
  }, [customInput, onSetFormat]);

  const preview = (() => {
    const value = previewValue ?? FALLBACK_PREVIEW_VALUE;
    if (!customInput.trim()) return '';
    try {
      return formatWithPattern(value, customInput).text;
    } catch {
      return '';
    }
  })();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="表示形式"
        className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-grid-line/60 active:scale-95 transition-all duration-100 text-text-primary text-xs"
        onMouseDown={(e) => {
          e.preventDefault();
          handleToggle();
        }}
        data-testid="toolbar-number-format-dropdown"
      >
        123 <span className="text-[9px]">▾</span>
      </button>
      {isOpen && (
        <FloatingPanel
          anchorRef={containerRef}
          panelRef={dropdownRef}
          className="glass-surface rounded-xl py-1 w-60 animate-slide-down"
        >
          {!showCustom ? (
            <>
              {FORMAT_ITEMS.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handlePresetClick(item.format);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 inline-block">
                      {currentFormat === item.format ? '✓' : ''}
                    </span>
                    {item.label}
                  </span>
                  {item.example && <span className="text-text-primary/40">{item.example}</span>}
                </button>
              ))}
              <div className="border-t border-grid-line my-1" />
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleOpenCustom();
                }}
              >
                <span className="w-3 inline-block">{currentFormat === 'custom' ? '✓' : ''}</span>
                カスタム...
              </button>
            </>
          ) : (
            <div className="px-3 py-2">
              <button
                type="button"
                className="text-[11px] text-text-primary/60 hover:text-text-primary mb-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowCustom(false);
                }}
              >
                ← 戻る
              </button>
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="#,##0.00"
                className="w-full h-7 px-2 text-xs border border-grid-line rounded bg-ui-bg text-text-primary outline-none focus:border-accent-selection mb-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyCustom();
                  }
                }}
              />
              <div className="text-[11px] text-text-primary/50 mb-2 h-4 truncate">{preview}</div>
              <div className="flex flex-col gap-0.5 mb-2 max-h-40 overflow-y-auto">
                {COMMON_CUSTOM_PATTERNS.map((pattern) => (
                  <button
                    key={pattern}
                    type="button"
                    className="w-full text-left px-1.5 py-1 text-[11px] font-mono text-text-primary hover:bg-accent-selection/10 rounded"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCustomInput(pattern);
                    }}
                  >
                    {pattern}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="w-full h-7 text-xs bg-accent-selection text-white rounded hover:opacity-90"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleApplyCustom();
                }}
              >
                適用
              </button>
            </div>
          )}
        </FloatingPanel>
      )}
    </div>
  );
});
