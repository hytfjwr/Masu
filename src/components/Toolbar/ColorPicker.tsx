import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { PRESET_COLORS } from './colorPalette';

interface ColorPickerProps {
  currentColor: string | undefined;
  onColorChange: (color: string | undefined) => void;
  label: string;
  icon: React.ReactNode;
}

export const ColorPicker = memo(function ColorPicker({
  currentColor,
  onColorChange,
  label,
  icon,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // useEffect required: global click-outside listener for dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handlePresetClick = useCallback(
    (color: string) => {
      onColorChange(color);
      setIsOpen(false);
    },
    [onColorChange],
  );

  const handleCustomSubmit = useCallback(() => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
      onColorChange(customColor);
      setIsOpen(false);
      setCustomColor('');
    }
  }, [customColor, onColorChange]);

  const handleClear = useCallback(() => {
    onColorChange(undefined);
    setIsOpen(false);
  }, [onColorChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={label}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-grid-line/60 active:scale-90 transition-all duration-100 text-text-primary"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <span className="flex flex-col items-center">
          {icon}
          <span
            className="w-4 h-1 rounded-sm mt-px"
            style={{ backgroundColor: currentColor ?? 'var(--color-text-primary)' }}
          />
        </span>
      </button>
      {isOpen && (
        <FloatingPanel anchorRef={containerRef} panelRef={dropdownRef} className="glass-surface rounded-xl p-2 w-52 animate-slide-down">
          <div className="grid grid-cols-8 gap-1 mb-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="w-5 h-5 rounded-sm border border-grid-line hover:scale-125 hover:shadow-[0_0_8px_currentColor] active:scale-90 transition-all duration-100"
                style={{ backgroundColor: color }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handlePresetClick(color);
                }}
                title={color}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 mb-1">
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="#FF5733"
              className="flex-1 h-6 px-1.5 text-xs border border-grid-line rounded bg-ui-bg text-text-primary outline-none focus:border-accent-selection"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCustomSubmit();
                }
              }}
            />
            <button
              type="button"
              className="h-6 px-2 text-xs bg-accent-selection text-white rounded hover:opacity-80"
              onMouseDown={(e) => {
                e.preventDefault();
                handleCustomSubmit();
              }}
            >
              OK
            </button>
          </div>
          <button
            type="button"
            className="w-full text-left px-1 py-0.5 text-[11px] text-text-primary/60 hover:text-text-primary hover:underline"
            onMouseDown={(e) => {
              e.preventDefault();
              handleClear();
            }}
          >
            色をクリア
          </button>
        </FloatingPanel>
      )}
    </div>
  );
});
