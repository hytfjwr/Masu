import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClampFixedToViewport } from '../../hooks/useClampToViewport';
import { useI18n } from '../../i18n/useI18n';

interface ValidationDropdownProps {
  /** Dropdown option list (already deduplicated). */
  options: string[];
  /** The cell's current raw value, highlighted in the list. */
  currentValue: string;
  /** Anchor position (viewport coordinates), typically the cell's bottom-left. */
  x: number;
  y: number;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * List-type data validation dropdown, rendered via a portal so it escapes the grid's
 * `overflow: hidden` cell/viewport containers. Fixed-positioned and viewport-clamped.
 */
export const ValidationDropdown = memo(function ValidationDropdown({
  options,
  currentValue,
  x,
  y,
  onSelect,
  onClose,
}: ValidationDropdownProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useClampFixedToViewport(ref, x, y);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // useEffect required: global click-outside listener to close the dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHighlighted(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = filtered[highlighted];
        if (value !== undefined) onSelect(value);
      }
    },
    [filtered, highlighted, onClose, onSelect],
  );

  return createPortal(
    <div
      ref={ref}
      data-testid="validation-dropdown"
      className="fixed z-50 min-w-[160px] max-w-[280px] glass-surface rounded-xl py-1 animate-fade-in-scale"
      style={{ left: x, top: y }}
      onKeyDown={handleKeyDown}
    >
      <input
        type="text"
        autoFocus
        value={query}
        onChange={handleQueryChange}
        placeholder={t('grid.validationDropdown.searchPlaceholder')}
        className="w-full h-7 px-2 mb-1 text-xs bg-ui-bg text-text-primary border-b border-grid-line outline-none"
      />
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-1.5 text-xs text-text-primary/40">
            {t('grid.validationDropdown.noResults')}
          </div>
        ) : (
          filtered.map((opt, idx) => (
            <button
              key={opt}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs ${idx === highlighted ? 'bg-accent-selection/10' : ''} ${
                opt === currentValue ? 'text-accent-selection' : 'text-text-primary'
              }`}
              onMouseEnter={() => setHighlighted(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(opt);
              }}
            >
              {opt}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
});
