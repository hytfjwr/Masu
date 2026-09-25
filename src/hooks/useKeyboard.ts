import { useCallback } from 'react';

export type ConfirmDirection = 'down' | 'right' | 'up' | 'left';

export interface UseKeyboardParams {
  isEditing: boolean;
  /** How the current edit was started: 'enter' via direct character input, 'edit' via F2/dblclick/formula bar */
  editMode?: 'enter' | 'edit';
  /** Current in-progress edit value (used to decide whether arrow keys move the caret or confirm+move) */
  editValue?: string;
  onMove: (deltaCol: number, deltaRow: number, extend: boolean) => void;
  onStartEditing: () => void;
  onConfirmEdit: (direction: ConfirmDirection) => void;
  /** Ctrl/Cmd+Enter: apply the current edit value to every cell in the selection */
  onConfirmEditFillSelection?: () => void;
  /** Alt+Enter (editing mode): insert a newline at the caret instead of confirming */
  onInsertNewline?: () => void;
  onCancelEdit: () => void;
  /** Escape in navigation mode (cancels clipboard marquee, distinct from onCancelEdit) */
  onEscape?: () => void;
  onDeleteCells: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** mod+Shift+V (paste values only) is still handled here; plain mod+C/X/V are left to the native copy/cut/paste events. */
  onPasteValues?: () => void;
  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onToggleUnderline?: () => void;
  onToggleStrikethrough?: () => void;
  /** mod+Shift+K: toggle the developer tools window */
  onToggleDevTools?: () => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onClearFormatting?: () => void;
  onSearch?: () => void;
  /** Ctrl/Cmd+H: opens the search panel with the replace field focused. */
  onSearchReplace?: () => void;
  onShowShortcuts?: () => void;
  onToggleAbsoluteRef?: (e: React.KeyboardEvent) => void;
  /** Ctrl/Cmd+Arrow: jump to the next data edge */
  onJump?: (dCol: number, dRow: number, extend: boolean) => void;
  /** Home: move to column 0 of the current row */
  onHome?: (extend: boolean) => void;
  /** Ctrl/Cmd+Home: move to A1 */
  onCtrlHome?: () => void;
  /** Ctrl/Cmd+End: move to the last used cell */
  onCtrlEnd?: () => void;
  /** PageUp/PageDown: dir is 1 for PageDown, -1 for PageUp */
  onPage?: (dir: 1 | -1, extend: boolean) => void;
  onSelectAll?: () => void;
  onSelectRow?: () => void;
  onSelectColumn?: () => void;
  onFillDown?: () => void;
  onFillRight?: () => void;
  onInsertDate?: () => void;
  onInsertTime?: () => void;
  /** Plain Space (no modifiers) in navigation mode: toggle the active cell's checkbox. Return true if handled. */
  onSpace?: () => boolean;
  /** Alt+ArrowDown in navigation mode: open the active cell's dropdown, if it has one. Return true if handled. */
  onAltArrowDown?: () => boolean;
}

export function useKeyboard({
  isEditing,
  editMode = 'edit',
  editValue = '',
  onMove,
  onStartEditing,
  onConfirmEdit,
  onConfirmEditFillSelection,
  onInsertNewline,
  onCancelEdit,
  onEscape,
  onDeleteCells,
  onUndo,
  onRedo,
  onPasteValues,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleStrikethrough,
  onToggleDevTools,
  onAlign,
  onClearFormatting,
  onSearch,
  onSearchReplace,
  onShowShortcuts,
  onToggleAbsoluteRef,
  onJump,
  onHome,
  onCtrlHome,
  onCtrlEnd,
  onPage,
  onSelectAll,
  onSelectRow,
  onSelectColumn,
  onFillDown,
  onFillRight,
  onInsertDate,
  onInsertTime,
  onSpace,
  onAltArrowDown,
}: UseKeyboardParams) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // IME composition in progress: never treat a still-converting keystroke (e.g. the
      // Enter that confirms kana->kanji conversion) as a grid command.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      const mod = e.ctrlKey || e.metaKey;
      // Normalize single-character keys to lowercase so Shift-produced uppercase
      // letters (e.g. 'V' for Shift+v) compare the same as their unshifted form.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Ctrl+F for search works in both editing and navigation modes
      if (mod && key === 'f') {
        e.preventDefault();
        onSearch?.();
        return;
      }

      if (isEditing) {
        if (e.key === 'Enter' && e.altKey) {
          e.preventDefault();
          onInsertNewline?.();
          return;
        }
        if (e.key === 'Enter' && mod) {
          e.preventDefault();
          onConfirmEditFillSelection?.();
          return;
        }

        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            onConfirmEdit(e.shiftKey ? 'up' : 'down');
            break;
          case 'Tab':
            e.preventDefault();
            onConfirmEdit(e.shiftKey ? 'left' : 'right');
            break;
          case 'ArrowUp':
          case 'ArrowDown':
          case 'ArrowLeft':
          case 'ArrowRight':
            if (editMode === 'enter' && !editValue.startsWith('=')) {
              e.preventDefault();
              const directions: Record<string, ConfirmDirection> = {
                ArrowUp: 'up',
                ArrowDown: 'down',
                ArrowLeft: 'left',
                ArrowRight: 'right',
              };
              onConfirmEdit(directions[e.key]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            onCancelEdit();
            break;
          case 'F4':
            e.preventDefault();
            onToggleAbsoluteRef?.(e);
            break;
        }
        return;
      }

      // Navigation mode - Ctrl/Cmd modifier combinations
      if (mod) {
        if (e.key === 'ArrowUp') { e.preventDefault(); onJump?.(0, -1, e.shiftKey); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); onJump?.(0, 1, e.shiftKey); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onJump?.(-1, 0, e.shiftKey); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); onJump?.(1, 0, e.shiftKey); return; }
        if (e.key === 'Home') { e.preventDefault(); onCtrlHome?.(); return; }
        if (e.key === 'End') { e.preventDefault(); onCtrlEnd?.(); return; }

        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) onRedo?.(); else onUndo?.();
          return;
        }
        if (key === 'y') { e.preventDefault(); onRedo?.(); return; }
        // Plain mod+C / mod+X / mod+V are left unhandled here (no preventDefault) so the
        // browser's native copy/cut/paste events fire and Grid's document-level listeners
        // can read/write text/html via e.clipboardData.
        if (key === 'x' && e.shiftKey) { e.preventDefault(); onToggleStrikethrough?.(); return; }
        if (key === 'k' && e.shiftKey) { e.preventDefault(); onToggleDevTools?.(); return; }
        if (key === 'v' && e.shiftKey) { e.preventDefault(); onPasteValues?.(); return; }
        if (key === 'b') { e.preventDefault(); onToggleBold?.(); return; }
        if (key === 'i') { e.preventDefault(); onToggleItalic?.(); return; }
        if (key === 'u') { e.preventDefault(); onToggleUnderline?.(); return; }
        if (key === 'a') { e.preventDefault(); onSelectAll?.(); return; }
        if (key === ' ') { e.preventDefault(); onSelectColumn?.(); return; }
        if (key === 'd') { e.preventDefault(); onFillDown?.(); return; }
        if (key === 'r') {
          e.preventDefault();
          if (e.shiftKey) onAlign?.('right'); else onFillRight?.();
          return;
        }
        if (key === 'e' && e.shiftKey) { e.preventDefault(); onAlign?.('center'); return; }
        if (key === 'l' && e.shiftKey) { e.preventDefault(); onAlign?.('left'); return; }
        if (key === 'h') { e.preventDefault(); onSearchReplace?.(); return; }
        if (key === '/') { e.preventDefault(); onShowShortcuts?.(); return; }
        if (key === '\\') { e.preventDefault(); onClearFormatting?.(); return; }
        if (key === ';' && !e.shiftKey) { e.preventDefault(); onInsertDate?.(); return; }
        if ((key === ';' || key === ':') && e.shiftKey) { e.preventDefault(); onInsertTime?.(); return; }
      }

      // Alt+ArrowDown (no other modifiers): open the active cell's dropdown, if it has one.
      if (!mod && e.altKey && e.key === 'ArrowDown') {
        if (onAltArrowDown?.()) {
          e.preventDefault();
          return;
        }
      }

      // Plain Space (no modifiers): toggle a checkbox cell, if the active cell has one.
      // Checked before Shift+Space (select row) below.
      if (!mod && !e.shiftKey && key === ' ') {
        if (onSpace?.()) {
          e.preventDefault();
          return;
        }
      }

      // Shift+Space (no modifier): select the current row. Must be checked before
      // falling into the generic direct-input handling below.
      if (!mod && e.shiftKey && key === ' ') {
        e.preventDefault();
        onSelectRow?.();
        return;
      }

      const shift = e.shiftKey;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onMove(0, -1, shift);
          break;
        case 'ArrowDown':
          e.preventDefault();
          onMove(0, 1, shift);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onMove(-1, 0, shift);
          break;
        case 'ArrowRight':
          e.preventDefault();
          onMove(1, 0, shift);
          break;
        case 'Tab':
          e.preventDefault();
          onMove(shift ? -1 : 1, 0, false);
          break;
        case 'Enter':
          e.preventDefault();
          if (shift) onMove(0, -1, false); else onMove(0, 1, false);
          break;
        case 'Home':
          e.preventDefault();
          onHome?.(shift);
          break;
        case 'PageDown':
          e.preventDefault();
          onPage?.(1, shift);
          break;
        case 'PageUp':
          e.preventDefault();
          onPage?.(-1, shift);
          break;
        case 'F2':
          e.preventDefault();
          onStartEditing();
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onDeleteCells();
          break;
        case 'Escape':
          // Cancel copy/cut state
          e.preventDefault();
          onEscape?.();
          break;
        default:
          // Printable characters are left to the browser: they're typed directly into the
          // always-focused cell editor textarea, whose onChange starts the edit (see CellEditor).
          break;
      }
    },
    [
      isEditing,
      editMode,
      editValue,
      onMove,
      onStartEditing,
      onConfirmEdit,
      onConfirmEditFillSelection,
      onInsertNewline,
      onCancelEdit,
      onEscape,
      onDeleteCells,
      onUndo,
      onRedo,
      onPasteValues,
      onToggleBold,
      onToggleItalic,
      onToggleUnderline,
      onToggleStrikethrough,
      onToggleDevTools,
      onAlign,
      onClearFormatting,
      onSearch,
      onSearchReplace,
      onShowShortcuts,
      onToggleAbsoluteRef,
      onJump,
      onHome,
      onCtrlHome,
      onCtrlEnd,
      onPage,
      onSelectAll,
      onSelectRow,
      onSelectColumn,
      onFillDown,
      onFillRight,
      onInsertDate,
      onInsertTime,
      onSpace,
      onAltArrowDown,
    ],
  );

  return { handleKeyDown };
}
