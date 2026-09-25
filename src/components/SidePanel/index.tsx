import { memo, useCallback } from 'react';

interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Common docked right-side panel shell (fixed 320px width, full grid-area height).
 * Placed as a flex sibling of the grid area (not an overlay), so the grid shrinks to fit.
 */
export const SidePanel = memo(function SidePanel({ title, onClose, children }: SidePanelProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  return (
    <div
      className="w-[320px] shrink-0 h-full flex flex-col border-l border-grid-line bg-grid-bg animate-panel-in shadow-[-12px_0_32px_-20px_var(--glass-shadow)]"
      data-testid="side-panel"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-grid-line shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-full text-text-primary/60 hover:text-error hover:bg-error/10 hover:rotate-90 active:scale-90 text-lg leading-none transition-all duration-200"
          aria-label="閉じる"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {children}
      </div>
    </div>
  );
});
