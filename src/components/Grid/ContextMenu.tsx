import { memo, useCallback, useEffect, useRef } from 'react';
import { useClampFixedToViewport } from '../../hooks/useClampToViewport';
import { colIndexToLetter } from '../../utils/coordinates';
import type { TFunction } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

export interface ContextMenuState {
  type: 'column' | 'row';
  index: number;
  x: number;
  y: number;
  /** Inclusive [rangeStart, rangeEnd] of rows/cols this menu's insert/delete/hide actions apply
   * to: the current whole-row/whole-column selection if it covers the right-clicked header,
   * otherwise just the single right-clicked row/col (rangeStart === rangeEnd === index). */
  rangeStart: number;
  rangeEnd: number;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  canInsert: boolean;
  onGroup?: () => void;
  onUngroup?: () => void;
  canUngroup?: boolean;
  /** Column-only: sort the sheet by this column ascending/descending */
  onSortAsc?: () => void;
  onSortDesc?: () => void;
  /** Hide the rows/cols in [rangeStart, rangeEnd] */
  onHide?: () => void;
  /** Unhide any hidden rows/cols within [rangeStart, rangeEnd] */
  onUnhide?: () => void;
  /** Whether [rangeStart, rangeEnd] contains at least one hidden row/col (shows "再表示") */
  canUnhide?: boolean;
}

/** 1-indexed row label, e.g. rangeStart=1, rangeEnd=3 -> "行 2–4" (rows are 0-indexed internally). */
function rowRangeLabel(t: TFunction, rangeStart: number, rangeEnd: number): string {
  return rangeStart === rangeEnd
    ? t('grid.contextMenu.rowSingle', { row: rangeStart + 1 })
    : t('grid.contextMenu.rowRange', { start: rangeStart + 1, end: rangeEnd + 1 });
}

/** Column letter label, e.g. rangeStart=0, rangeEnd=2 -> "列 A–C". */
function colRangeLabel(t: TFunction, rangeStart: number, rangeEnd: number): string {
  const a = colIndexToLetter(rangeStart);
  const b = colIndexToLetter(rangeEnd);
  return rangeStart === rangeEnd
    ? t('grid.contextMenu.colSingle', { col: a })
    : t('grid.contextMenu.colRange', { start: a, end: b });
}

export const ContextMenu = memo(function ContextMenu({
  menu,
  onClose,
  onInsertBefore,
  onInsertAfter,
  onDelete,
  canInsert,
  onGroup,
  onUngroup,
  canUngroup,
  onSortAsc,
  onSortDesc,
  onHide,
  onUnhide,
  canUnhide,
}: ContextMenuProps) {
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

  const isColumn = menu.type === 'column';
  const itemClass =
    'w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75';
  const disabledClass = 'w-full text-left px-3 py-1.5 text-xs text-text-primary/30 cursor-default';

  const count = menu.rangeEnd - menu.rangeStart + 1;
  const insertBeforeLabel = isColumn
    ? count > 1
      ? t('grid.contextMenu.insertColsLeftCount', { count })
      : t('grid.contextMenu.insertColLeft')
    : count > 1
      ? t('grid.contextMenu.insertRowsAboveCount', { count })
      : t('grid.contextMenu.insertRowAbove');
  const insertAfterLabel = isColumn
    ? count > 1
      ? t('grid.contextMenu.insertColsRightCount', { count })
      : t('grid.contextMenu.insertColRight')
    : count > 1
      ? t('grid.contextMenu.insertRowsBelowCount', { count })
      : t('grid.contextMenu.insertRowBelow');
  const deleteLabel = isColumn
    ? count > 1
      ? t('grid.contextMenu.deleteRange', {
          range: colRangeLabel(t, menu.rangeStart, menu.rangeEnd),
        })
      : t('grid.contextMenu.deleteColumn')
    : count > 1
      ? t('grid.contextMenu.deleteRange', {
          range: rowRangeLabel(t, menu.rangeStart, menu.rangeEnd),
        })
      : t('grid.contextMenu.deleteRow');
  const hideLabel = t('grid.contextMenu.hideRange', {
    range: isColumn
      ? colRangeLabel(t, menu.rangeStart, menu.rangeEnd)
      : rowRangeLabel(t, menu.rangeStart, menu.rangeEnd),
  });
  const unhideLabel = isColumn
    ? t('grid.contextMenu.unhideColumns')
    : t('grid.contextMenu.unhideRows');

  return (
    <div
      ref={ref}
      data-context-menu
      className="fixed z-50 min-w-[180px] glass-surface rounded-xl py-1 animate-fade-in-scale"
      style={{ left: menu.x, top: menu.y }}
      data-testid="context-menu"
    >
      <button
        type="button"
        className={canInsert ? itemClass : disabledClass}
        disabled={!canInsert}
        onMouseDown={(e) => {
          e.preventDefault();
          if (canInsert) handleAction(onInsertBefore);
        }}
      >
        {insertBeforeLabel}
      </button>
      <button
        type="button"
        className={canInsert ? itemClass : disabledClass}
        disabled={!canInsert}
        onMouseDown={(e) => {
          e.preventDefault();
          if (canInsert) handleAction(onInsertAfter);
        }}
      >
        {insertAfterLabel}
      </button>
      <div className="border-t border-grid-line my-1" />
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onDelete);
        }}
      >
        {deleteLabel}
      </button>
      {(onHide || onUnhide) && (
        <>
          <div className="border-t border-grid-line my-1" />
          {onHide && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onHide);
              }}
            >
              {hideLabel}
            </button>
          )}
          {onUnhide && canUnhide && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onUnhide);
              }}
            >
              {unhideLabel}
            </button>
          )}
        </>
      )}
      {isColumn && (onSortAsc || onSortDesc) && (
        <>
          <div className="border-t border-grid-line my-1" />
          {onSortAsc && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onSortAsc);
              }}
            >
              {t('grid.contextMenu.sortSheetAsc')}
            </button>
          )}
          {onSortDesc && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onSortDesc);
              }}
            >
              {t('grid.contextMenu.sortSheetDesc')}
            </button>
          )}
        </>
      )}
      {(onGroup || onUngroup) && (
        <>
          <div className="border-t border-grid-line my-1" />
          {onGroup && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onGroup);
              }}
            >
              {isColumn ? t('grid.contextMenu.groupColumns') : t('grid.contextMenu.groupRows')}
            </button>
          )}
          {onUngroup && canUngroup && (
            <button
              type="button"
              className={itemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction(onUngroup);
              }}
            >
              {isColumn ? t('grid.contextMenu.ungroupColumns') : t('grid.contextMenu.ungroupRows')}
            </button>
          )}
        </>
      )}
    </div>
  );
});
