import { memo, useCallback, useEffect, useRef } from 'react';
import { useClampFixedToViewport } from '../../hooks/useClampToViewport';

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
        コピー
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onCut);
        }}
      >
        切り取り
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onPaste);
        }}
      >
        貼り付け
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
        上に行を挿入
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertRowBelow);
        }}
      >
        下に行を挿入
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertColLeft);
        }}
      >
        左に列を挿入
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onInsertColRight);
        }}
      >
        右に列を挿入
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
        行を削除
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onDeleteCol);
        }}
      >
        列を削除
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
        プルダウン
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onOpenConditionalFormat);
        }}
      >
        条件付き書式
      </button>
      <button
        type="button"
        className={itemClass}
        onMouseDown={(e) => {
          e.preventDefault();
          handleAction(onOpenDataValidation);
        }}
      >
        データの入力規則
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
          コメントを削除
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
          コメントを追加
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
              リンクを開く
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
              リンクを編集
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
              リンクを削除
            </button>
          )}
        </>
      )}
    </div>
  );
});
