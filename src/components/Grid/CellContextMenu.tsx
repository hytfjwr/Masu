import { memo, useCallback, useEffect, useRef } from 'react';
import { useClampFixedToViewport } from '../../hooks/useClampToViewport';
import { useI18n } from '../../i18n/useI18n';

export interface CellContextMenuState {
  col: number;
  row: number;
  x: number;
  y: number;
}

interface CellContextMenuProps {
  menu: CellContextMenuState;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onInsertColLeft: () => void;
  onInsertColRight: () => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  /** 挿入 > プルダウン: opens the data validation panel straight into the プルダウン edit form. */
  onInsertDropdown: () => void;
  onOpenConditionalFormat: () => void;
  onOpenDataValidation: () => void;
  onAddComment: () => void;
  hasComment: boolean;
  onDeleteComment: () => void;
  /** Hyperlink support */
  hyperlink?: { url: string; label: string };
  onOpenLink?: () => void;
  onEditLink?: () => void;
  onRemoveLink?: () => void;
}

export const CellContextMenu = memo(function CellContextMenu({
  menu,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteRow,
  onDeleteCol,
  onInsertDropdown,
  onOpenConditionalFormat,
  onOpenDataValidation,
  onAddComment,
  hasComment,
  onDeleteComment,
  hyperlink,
  onOpenLink,
  onEditLink,
  onRemoveLink,
}: CellContextMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useClampFixedToViewport(ref, menu.x, menu.y);

  // useEffect required: global click-outside listener for context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  const itemClass =
    'w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75';

  return (
    <div
      ref={ref}
      data-context-menu
      className="fixed z-50 min-w-[180px] glass-surface rounded-xl py-1 animate-fade-in-scale"
      style={{ left: menu.x, top: menu.y }}
      data-testid="cell-context-menu"
    >
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onCopy);
        }}
      >
        {t('grid.cellContextMenu.copy')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onCut);
        }}
      >
        {t('grid.cellContextMenu.cut')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onPaste);
        }}
      >
        {t('grid.cellContextMenu.paste')}
      </button>
      <div className="border-t border-grid-line my-1" />
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertRowAbove);
        }}
      >
        {t('grid.cellContextMenu.insertRowAbove')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertRowBelow);
        }}
      >
        {t('grid.cellContextMenu.insertRowBelow')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertColLeft);
        }}
      >
        {t('grid.cellContextMenu.insertColLeft')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertColRight);
        }}
      >
        {t('grid.cellContextMenu.insertColRight')}
      </button>
      <div className="border-t border-grid-line my-1" />
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onDeleteRow);
        }}
      >
        {t('grid.cellContextMenu.deleteRow')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onDeleteCol);
        }}
      >
        {t('grid.cellContextMenu.deleteCol')}
      </button>
      <div className="border-t border-grid-line my-1" />
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertDropdown);
        }}
      >
        {t('grid.cellContextMenu.insertDropdown')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onOpenConditionalFormat);
        }}
      >
        {t('grid.cellContextMenu.conditionalFormat')}
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onOpenDataValidation);
        }}
      >
        {t('grid.cellContextMenu.dataValidation')}
      </button>
      <div className="border-t border-grid-line my-1" />
      {hasComment ? (
        <button
          type="button"
          className={itemClass}
          onMouseDown={(e) => {
            e.preventDefault();
            handleAction(onDeleteComment);
          }}
        >
          {t('grid.cellContextMenu.deleteComment')}
        </button>
      ) : (
        <button
          type="button"
          className={itemClass}
          onMouseDown={(e) => {
            e.preventDefault();
            handleAction(onAddComment);
          }}
        >
          {t('grid.cellContextMenu.addComment')}
        </button>
      )}
      {hyperlink && (
        <>
          <div className="border-t border-grid-line my-1" />
          {onOpenLink && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onOpenLink);
              }}
            >
              {t('grid.cellContextMenu.openLink')}
            </button>
          )}
          {onEditLink && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onEditLink);
              }}
            >
              {t('grid.cellContextMenu.editLink')}
            </button>
          )}
          {onRemoveLink && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onRemoveLink);
              }}
            >
              {t('grid.cellContextMenu.removeLink')}
            </button>
          )}
        </>
      )}
    </div>
  );
});
