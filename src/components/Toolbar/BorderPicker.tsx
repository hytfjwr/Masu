import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import type { CellBorders, BorderEdge } from '../../types/grid';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

const solidBlack: BorderEdge = { style: 'solid', color: '#000000' };
const thickBlack: BorderEdge = { style: 'thick', color: '#000000' };

interface BorderPreset {
  labelKey: MessageKey;
  borders: CellBorders | undefined;
  icon: React.ReactNode;
}

const BORDER_PRESETS: BorderPreset[] = [
  {
    labelKey: 'chrome.borderPicker.all',
    borders: { top: solidBlack, right: solidBlack, bottom: solidBlack, left: solidBlack },
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="14" height="14" />
        <line x1="8" y1="1" x2="8" y2="15" />
        <line x1="1" y1="8" x2="15" y2="8" />
      </svg>
    ),
  },
  {
    labelKey: 'chrome.borderPicker.outer',
    borders: { top: solidBlack, right: solidBlack, bottom: solidBlack, left: solidBlack },
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="14" height="14" />
      </svg>
    ),
  },
  {
    labelKey: 'chrome.borderPicker.thickOuter',
    borders: { top: thickBlack, right: thickBlack, bottom: thickBlack, left: thickBlack },
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <rect x="1" y="1" width="14" height="14" />
      </svg>
    ),
  },
  {
    labelKey: 'chrome.borderPicker.bottom',
    borders: { bottom: solidBlack },
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <rect
          x="1"
          y="1"
          width="14"
          height="14"
          strokeWidth="0.5"
          strokeDasharray="2 2"
          opacity="0.3"
        />
        <line x1="1" y1="15" x2="15" y2="15" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    labelKey: 'chrome.borderPicker.none',
    borders: undefined,
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        opacity="0.4"
      >
        <rect x="1" y="1" width="14" height="14" />
      </svg>
    ),
  },
  {
    labelKey: 'chrome.borderPicker.topBottom',
    borders: { top: solidBlack, bottom: solidBlack },
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <rect
          x="1"
          y="1"
          width="14"
          height="14"
          strokeWidth="0.5"
          strokeDasharray="2 2"
          opacity="0.3"
        />
        <line x1="1" y1="1" x2="15" y2="1" strokeWidth="1.5" />
        <line x1="1" y1="15" x2="15" y2="15" strokeWidth="1.5" />
      </svg>
    ),
  },
];

interface BorderPickerProps {
  onBordersChange: (borders: CellBorders | undefined) => void;
}

export const BorderPicker = memo(function BorderPicker({ onBordersChange }: BorderPickerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
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

  const handlePresetClick = useCallback(
    (borders: CellBorders | undefined) => {
      onBordersChange(borders);
      setIsOpen(false);
    },
    [onBordersChange],
  );

  const handleClear = useCallback(() => {
    onBordersChange(undefined);
    setIsOpen(false);
  }, [onBordersChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={t('chrome.borderPicker.button')}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-grid-line/60 active:scale-90 transition-all duration-100 text-text-primary"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="1" y="1" width="14" height="14" />
          <line x1="8" y1="1" x2="8" y2="15" />
          <line x1="1" y1="8" x2="15" y2="8" />
        </svg>
      </button>
      {isOpen && (
        <FloatingPanel
          anchorRef={containerRef}
          panelRef={dropdownRef}
          className="glass-surface rounded-xl p-2 w-[124px] animate-slide-down"
        >
          <div className="grid grid-cols-3 gap-1 mb-2">
            {BORDER_PRESETS.map((preset) => (
              <button
                key={preset.labelKey}
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded border border-grid-line hover:bg-grid-line/40 active:scale-90 transition-all duration-100 text-text-primary"
                title={t(preset.labelKey)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handlePresetClick(preset.borders);
                }}
              >
                {preset.icon}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="w-full text-left px-1 py-0.5 text-[11px] text-text-primary/60 hover:text-text-primary hover:underline whitespace-nowrap"
            onMouseDown={(e) => {
              e.preventDefault();
              handleClear();
            }}
          >
            {t('chrome.borderPicker.clear')}
          </button>
        </FloatingPanel>
      )}
    </div>
  );
});
