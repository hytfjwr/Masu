import { memo, useCallback, useEffect, useRef } from 'react';
import type { FunctionMeta } from '../../engine/types';

interface AutocompleteProps {
  suggestions: FunctionMeta[];
  selectedIndex: number;
  onSelect: (fn: FunctionMeta) => void;
}

export const Autocomplete = memo(function Autocomplete({
  suggestions,
  selectedIndex,
  onSelect,
}: AutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // useEffect required: scrolls selected autocomplete item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const items = listRef.current.children;
      if (items[selectedIndex]) {
        (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleClick = useCallback(
    (fn: FunctionMeta) => {
      onSelect(fn);
    },
    [onSelect],
  );

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      data-dropdown
      className="absolute top-full left-0 z-50 w-80 max-h-48 overflow-y-auto glass-surface rounded-xl mt-0.5 animate-slide-down"
      data-testid="autocomplete-dropdown"
    >
      {suggestions.map((fn, i) => (
        <div
          key={fn.name}
          className={`px-3 py-1.5 cursor-pointer text-[13px] transition-colors duration-75 ${
            i === selectedIndex
              ? 'bg-accent-selection/20 text-accent-selection'
              : 'text-text-primary hover:bg-ui-bg'
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur on the input
            handleClick(fn);
          }}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{fn.name}</span>
            <span className="text-xs text-text-primary/60">{fn.signature}</span>
          </div>
          <div className="text-xs text-text-primary/50 truncate">{fn.description}</div>
        </div>
      ))}
    </div>
  );
});
