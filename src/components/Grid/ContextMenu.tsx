import { memo, useCallback, useEffect, useRef } from 'react';
import { useClampFixedToViewport } from '../../hooks/useClampToViewport';
import { colIndexToLetter } from '../../utils/coordinates';

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
function rowRangeLabel(rangeStart: number, rangeEnd: number): string {
  return rangeStart === rangeEnd ? `行 ${rangeStart + 1}` : `行 ${rangeStart + 1}–${rangeEnd + 1}`;
}

/** Column letter label, e.g. rangeStart=0, rangeEnd=2 -> "列 A–C". */
function colRangeLabel(rangeStart: number, rangeEnd: number): string {
  const a = colIndexToLetter(rangeStart);
  const b = colIndexToLetter(rangeEnd);
  return rangeStart === rangeEnd ? `列 ${a}` : `列 ${a}–${b}`;
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
  const itemClass = 'w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75';
  const disabledClass = 'w-full text-left px-3 py-1.5 text-xs text-text-primary/30 cursor-default';

  const count = menu.rangeEnd - menu.rangeStart + 1;
  const insertBeforeLabel = isColumn
    ? (count > 1 ? `左に ${count} 列挿入` : '左に列を挿入')
    : (count > 1 ? `上に ${count} 行挿入` : '上に行を挿入');
  const insertAfterLabel = isColumn
    ? (count > 1 ? `右に ${count} 列挿入` : '右に列を挿入')
    : (count > 1 ? `下に ${count} 行挿入` : '下に行を挿入');
  const deleteLabel = isColumn
    ? (count > 1 ? `${colRangeLabel(menu.rangeStart, menu.rangeEnd)}を削除` : '列を削除')
    : (count > 1 ? `${rowRangeLabel(menu.rangeStart, menu.rangeEnd)}を削除` : '行を削除');
  const hideLabel = isColumn
    ? `${colRangeLabel(menu.rangeStart, menu.rangeEnd)}を非表示`
    : `${rowRangeLabel(menu.rangeStart, menu.rangeEnd)}を非表示`;
  const unhideLabel = isColumn ? '列を再表示' : '行を再表示';

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
              シートを並べ替え (A→Z)
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
              シートを並べ替え (Z→A)
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
              {isColumn ? '列のグループ化' : '行のグループ化'}
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
              {isColumn ? '列のグループ解除' : '行のグループ解除'}
            </button>
          )}
        </>
      )}
    </div>
  );
});
