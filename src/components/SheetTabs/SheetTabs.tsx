import { memo, useCallback, useRef, useState, useEffect, useLayoutEffect, Fragment } from 'react';
import {
  useClampFixedToViewport,
  useClampDropdownToViewport,
} from '../../hooks/useClampToViewport';
import { PRESET_COLORS } from '../Toolbar/colorPalette';
import type { SheetData } from '../../types/grid';

interface SheetTabsProps {
  sheets: SheetData[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onDeleteSheet: (sheetId: string) => void;
  onRenameSheet: (sheetId: string, newName: string) => void;
  onDuplicateSheet?: (sheetId: string) => void;
  onMoveSheet?: (sheetId: string, toIndex: number) => void;
  onSetTabColor?: (sheetId: string, color: string | undefined) => void;
  onSetSheetHidden?: (sheetId: string, hidden: boolean) => void;
}

// A 12-swatch subset of the shared color picker palette (skips the grayscale row,
// which reads poorly as a tab underline).
const TAB_COLOR_PALETTE = PRESET_COLORS.slice(8, 20);

type DragOverInfo = { targetId: string; side: 'before' | 'after' };

/**
 * Compute the `toIndex` argument for `onMoveSheet`: the position of `draggedId`
 * within `sheets` *after* it has been removed from its original slot, so that it
 * ends up immediately before/after `targetId`.
 */
function computeMoveToIndex(
  sheets: SheetData[],
  draggedId: string,
  targetId: string,
  dropAfter: boolean,
): number {
  const draggedIdx = sheets.findIndex((s) => s.id === draggedId);
  const targetIdx = sheets.findIndex((s) => s.id === targetId);
  if (draggedIdx === -1 || targetIdx === -1) return draggedIdx;
  let insertAt = dropAfter ? targetIdx + 1 : targetIdx;
  if (insertAt > draggedIdx) insertAt -= 1;
  return insertAt;
}

export const SheetTabs = memo(function SheetTabs({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onDeleteSheet,
  onRenameSheet,
  onDuplicateSheet,
  onMoveSheet,
  onSetTabColor,
  onSetSheetHidden,
}: SheetTabsProps) {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [contextMenuSheetId, setContextMenuSheetId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const colorSubmenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  useClampFixedToViewport(contextMenuRef, contextMenuPos?.x ?? 0, contextMenuPos?.y ?? 0);
  useClampDropdownToViewport(colorSubmenuRef, colorSubmenuOpen);

  // Drag & drop tab reordering
  const [dragSheetId, setDragSheetId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);

  // "All sheets" popover (leftmost hamburger button)
  const [showAllSheetsMenu, setShowAllSheetsMenu] = useState(false);
  const [allSheetsMenuPos, setAllSheetsMenuPos] = useState<{ x: number; y: number } | null>(null);
  const allSheetsButtonRef = useRef<HTMLButtonElement>(null);
  const allSheetsMenuRef = useRef<HTMLDivElement>(null);
  useClampFixedToViewport(allSheetsMenuRef, allSheetsMenuPos?.x ?? 0, allSheetsMenuPos?.y ?? 0);

  const visibleSheets = sheets.filter((s) => !s.hidden);

  // Sliding underline under the active tab (measured from the DOM so it can glide between tabs)
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // useLayoutEffect required: measures the active tab element (and re-measures on resize/rename) before paint
  useLayoutEffect(() => {
    const container = tabsContainerRef.current;
    const tab = container?.querySelector<HTMLElement>('[data-sheet-tab-active]');
    if (!container || !tab) return;
    const measure = () => setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeSheetId, sheets]);

  // useEffect required: focuses input when entering rename mode
  useEffect(() => {
    if (editingSheetId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSheetId]);

  // useEffect required: global click-outside listener for context menu
  useEffect(() => {
    if (!contextMenuSheetId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sheet-context-menu]')) {
        setContextMenuSheetId(null);
        setContextMenuPos(null);
        setColorSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenuSheetId]);

  // useEffect required: global click-outside listener for the "all sheets" popover
  useEffect(() => {
    if (!showAllSheetsMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-all-sheets-menu]')) {
        setShowAllSheetsMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAllSheetsMenu]);

  const handleTabClick = useCallback(
    (sheetId: string) => {
      if (editingSheetId) return;
      onSelectSheet(sheetId);
    },
    [editingSheetId, onSelectSheet],
  );

  const handleTabDoubleClick = useCallback((sheetId: string, currentName: string) => {
    setEditingSheetId(sheetId);
    setEditName(currentName);
  }, []);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, sheetId: string) => {
    e.preventDefault();
    setContextMenuSheetId(sheetId);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setColorSubmenuOpen(false);
  }, []);

  const commitRename = useCallback(() => {
    if (editingSheetId) {
      onRenameSheet(editingSheetId, editName);
      setEditingSheetId(null);
      setEditName('');
    }
  }, [editingSheetId, editName, onRenameSheet]);

  const cancelRename = useCallback(() => {
    setEditingSheetId(null);
    setEditName('');
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuSheetId(null);
    setContextMenuPos(null);
    setColorSubmenuOpen(false);
  }, []);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenuSheetId) {
      if (sheets.length <= 1) {
        closeContextMenu();
        return;
      }
      const confirmed = window.confirm('このシートを削除しますか？');
      if (confirmed) {
        onDeleteSheet(contextMenuSheetId);
      }
    }
    closeContextMenu();
  }, [contextMenuSheetId, sheets.length, onDeleteSheet, closeContextMenu]);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenuSheetId) {
      const sheet = sheets.find((s) => s.id === contextMenuSheetId);
      if (sheet) {
        setEditingSheetId(contextMenuSheetId);
        setEditName(sheet.name);
      }
    }
    closeContextMenu();
  }, [contextMenuSheetId, sheets, closeContextMenu]);

  const handleDuplicateFromMenu = useCallback(() => {
    if (contextMenuSheetId) {
      onDuplicateSheet?.(contextMenuSheetId);
    }
    closeContextMenu();
  }, [contextMenuSheetId, onDuplicateSheet, closeContextMenu]);

  const handleHideFromMenu = useCallback(() => {
    if (contextMenuSheetId && visibleSheets.length > 1) {
      onSetSheetHidden?.(contextMenuSheetId, true);
    }
    closeContextMenu();
  }, [contextMenuSheetId, visibleSheets.length, onSetSheetHidden, closeContextMenu]);

  const handleMoveLeftFromMenu = useCallback(() => {
    if (contextMenuSheetId) {
      const idx = sheets.findIndex((s) => s.id === contextMenuSheetId);
      if (idx > 0) onMoveSheet?.(contextMenuSheetId, idx - 1);
    }
    closeContextMenu();
  }, [contextMenuSheetId, sheets, onMoveSheet, closeContextMenu]);

  const handleMoveRightFromMenu = useCallback(() => {
    if (contextMenuSheetId) {
      const idx = sheets.findIndex((s) => s.id === contextMenuSheetId);
      if (idx !== -1 && idx < sheets.length - 1) onMoveSheet?.(contextMenuSheetId, idx + 1);
    }
    closeContextMenu();
  }, [contextMenuSheetId, sheets, onMoveSheet, closeContextMenu]);

  const handleColorPick = useCallback(
    (color: string | undefined) => {
      if (contextMenuSheetId) {
        onSetTabColor?.(contextMenuSheetId, color);
      }
      closeContextMenu();
    },
    [contextMenuSheetId, onSetTabColor, closeContextMenu],
  );

  const handleAllSheetsButtonClick = useCallback(() => {
    const rect = allSheetsButtonRef.current?.getBoundingClientRect();
    setAllSheetsMenuPos({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 });
    setShowAllSheetsMenu(true);
  }, []);

  const handleSelectFromAllSheets = useCallback(
    (sheet: SheetData) => {
      if (sheet.hidden) {
        onSetSheetHidden?.(sheet.id, false);
      }
      onSelectSheet(sheet.id);
      setShowAllSheetsMenu(false);
    },
    [onSetSheetHidden, onSelectSheet],
  );

  // --- Drag & drop reordering ---

  const handleDragStart = useCallback((e: React.DragEvent, sheetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sheetId);
    setDragSheetId(sheetId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSheetId(null);
    setDragOverInfo(null);
  }, []);

  const handleTabDragOver = useCallback(
    (e: React.DragEvent, sheetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragSheetId || dragSheetId === sheetId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const side: 'before' | 'after' = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
      setDragOverInfo({ targetId: sheetId, side });
    },
    [dragSheetId],
  );

  const commitDrop = useCallback(
    (e: React.DragEvent) => {
      const draggedId = dragSheetId ?? e.dataTransfer.getData('text/plain');
      if (draggedId && dragOverInfo) {
        const toIndex = computeMoveToIndex(
          sheets,
          draggedId,
          dragOverInfo.targetId,
          dragOverInfo.side === 'after',
        );
        onMoveSheet?.(draggedId, toIndex);
      }
      setDragSheetId(null);
      setDragOverInfo(null);
    },
    [dragSheetId, dragOverInfo, sheets, onMoveSheet],
  );

  const handleTabDrop = useCallback(
    (e: React.DragEvent, sheetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      // dragOverInfo is normally already set to this tab from the preceding dragover events;
      // fall back to "drop after this tab" if it somehow wasn't (e.g. a drop with no prior dragover).
      if (!dragOverInfo || dragOverInfo.targetId !== sheetId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const side: 'before' | 'after' =
          e.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
        const draggedId = dragSheetId ?? e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== sheetId) {
          const toIndex = computeMoveToIndex(sheets, draggedId, sheetId, side === 'after');
          onMoveSheet?.(draggedId, toIndex);
        }
        setDragSheetId(null);
        setDragOverInfo(null);
        return;
      }
      commitDrop(e);
    },
    [dragOverInfo, dragSheetId, sheets, onMoveSheet, commitDrop],
  );

  // Fallback for drops past the last tab (container background, not a specific tab)
  const handleContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!dragSheetId) return;
      e.preventDefault();
      const lastVisible = visibleSheets[visibleSheets.length - 1];
      if (lastVisible && lastVisible.id !== dragSheetId) {
        setDragOverInfo({ targetId: lastVisible.id, side: 'after' });
      }
    },
    [dragSheetId, visibleSheets],
  );

  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      commitDrop(e);
    },
    [commitDrop],
  );

  return (
    <div
      ref={tabsContainerRef}
      className="relative flex items-center h-7 border-t border-grid-line bg-header-bg px-1 shrink-0 gap-0.5"
      data-testid="sheet-tabs"
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
    >
      {/* All sheets button */}
      <button
        ref={allSheetsButtonRef}
        type="button"
        className="flex items-center justify-center w-6 h-6 text-text-primary/50 hover:text-text-primary hover:bg-grid-line/40 active:scale-90 rounded text-sm transition-all duration-100"
        onClick={handleAllSheetsButtonClick}
        title="すべてのシート"
        data-testid="all-sheets-button"
      >
        ☰
      </button>

      {visibleSheets.map((sheet) => {
        const isActive = sheet.id === activeSheetId;
        const isEditing = editingSheetId === sheet.id;

        return (
          <Fragment key={sheet.id}>
            {dragOverInfo?.targetId === sheet.id && dragOverInfo.side === 'before' && (
              <div
                className="w-0.5 self-stretch bg-accent-selection rounded-full"
                data-testid="sheet-drop-indicator"
              />
            )}
            <div
              className={`relative flex items-center h-6 px-3 text-xs rounded-t cursor-pointer select-none border border-b-0 transition-all duration-150 animate-tab-in ${
                isActive
                  ? 'bg-grid-bg text-text-primary border-grid-line font-medium'
                  : 'bg-header-bg text-text-primary/60 border-transparent hover:bg-grid-line/40 hover:text-text-primary/80'
              }`}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, sheet.id)}
              onDragOver={(e) => handleTabDragOver(e, sheet.id)}
              onDrop={(e) => handleTabDrop(e, sheet.id)}
              onDragEnd={handleDragEnd}
              onClick={() => handleTabClick(sheet.id)}
              onDoubleClick={() => handleTabDoubleClick(sheet.id, sheet.name)}
              onContextMenu={(e) => handleTabContextMenu(e, sheet.id)}
              data-testid={`sheet-tab-${sheet.id}`}
              data-sheet-name={sheet.name}
              {...(isActive ? { 'data-sheet-tab-active': true } : {})}
            >
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={commitRename}
                  className="w-20 h-5 px-1 text-xs bg-grid-bg text-text-primary border border-accent-selection rounded outline-none"
                  data-testid="sheet-rename-input"
                />
              ) : (
                <span>{sheet.name}</span>
              )}
              {sheet.tabColor && (
                <div
                  className="absolute left-0 right-0 bottom-0 h-[3px] rounded-b pointer-events-none"
                  style={{ backgroundColor: sheet.tabColor }}
                  data-testid={`sheet-tab-color-${sheet.id}`}
                />
              )}
            </div>
            {dragOverInfo?.targetId === sheet.id && dragOverInfo.side === 'after' && (
              <div
                className="w-0.5 self-stretch bg-accent-selection rounded-full"
                data-testid="sheet-drop-indicator"
              />
            )}
          </Fragment>
        );
      })}

      {indicator && (
        <div
          aria-hidden
          className="sheet-tab-glider"
          style={{
            transform: `translateX(${indicator.left + 4}px)`,
            width: Math.max(0, indicator.width - 8),
          }}
        />
      )}

      {/* Add sheet button */}
      <button
        type="button"
        className="flex items-center justify-center w-6 h-6 text-text-primary/50 hover:text-text-primary hover:bg-grid-line/40 active:scale-90 rounded text-sm transition-all duration-100"
        onClick={onAddSheet}
        title="新しいシートを追加"
        data-testid="add-sheet-button"
      >
        +
      </button>

      {/* Context menu */}
      {contextMenuSheetId && contextMenuPos && (
        <div
          ref={contextMenuRef}
          data-sheet-context-menu
          data-context-menu
          className="fixed glass-surface rounded-xl z-50 py-1 min-w-[140px] animate-fade-in-scale"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
            onMouseDown={(e) => {
              e.preventDefault();
              handleDuplicateFromMenu();
            }}
          >
            複製
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
            onMouseDown={(e) => {
              e.preventDefault();
              handleRenameFromMenu();
            }}
          >
            名前を変更
          </button>
          <div className="relative">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
              onMouseDown={(e) => {
                e.preventDefault();
                setColorSubmenuOpen((v) => !v);
              }}
            >
              <span>色を変更</span>
              <span className="text-text-primary/40">▸</span>
            </button>
            {colorSubmenuOpen && (
              <div
                ref={colorSubmenuRef}
                data-dropdown
                className="absolute left-full top-0 ml-1 z-50 glass-surface rounded-xl p-2 w-40 animate-fade-in-scale"
              >
                <div className="grid grid-cols-6 gap-1 mb-2">
                  {TAB_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-5 h-5 rounded-sm border border-grid-line hover:scale-125 active:scale-90 transition-all duration-100"
                      style={{ backgroundColor: color }}
                      title={color}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleColorPick(color);
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="w-full text-left px-1 py-0.5 text-[11px] text-text-primary/60 hover:text-text-primary hover:underline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleColorPick(undefined);
                  }}
                >
                  リセット
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-xs ${
              visibleSheets.length <= 1
                ? 'text-text-primary/30 cursor-default'
                : 'text-text-primary hover:bg-accent-selection/10'
            }`}
            disabled={visibleSheets.length <= 1}
            onMouseDown={(e) => {
              e.preventDefault();
              handleHideFromMenu();
            }}
          >
            シートを非表示
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
            onMouseDown={(e) => {
              e.preventDefault();
              handleMoveLeftFromMenu();
            }}
          >
            左へ移動
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
            onMouseDown={(e) => {
              e.preventDefault();
              handleMoveRightFromMenu();
            }}
          >
            右へ移動
          </button>
          <div className="border-t border-grid-line my-1" />
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-xs ${
              sheets.length <= 1
                ? 'text-text-primary/30 cursor-default'
                : 'text-error hover:bg-accent-selection/10'
            }`}
            disabled={sheets.length <= 1}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDeleteFromMenu();
            }}
          >
            シートを削除
          </button>
        </div>
      )}

      {/* All sheets popover */}
      {showAllSheetsMenu && allSheetsMenuPos && (
        <div
          ref={allSheetsMenuRef}
          data-all-sheets-menu
          className="fixed glass-surface rounded-xl z-50 py-1 min-w-[180px] max-h-80 overflow-y-auto animate-fade-in-scale"
          style={{ left: allSheetsMenuPos.x, top: allSheetsMenuPos.y }}
        >
          {sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              className={`w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-xs transition-colors duration-75 hover:bg-accent-selection/10 ${
                sheet.hidden ? 'text-text-primary/40' : 'text-text-primary'
              } ${sheet.id === activeSheetId ? 'font-medium' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectFromAllSheets(sheet);
              }}
            >
              <span className="truncate">{sheet.name}</span>
              {sheet.hidden && (
                <span className="text-[10px] text-text-primary/40 shrink-0">非表示</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
