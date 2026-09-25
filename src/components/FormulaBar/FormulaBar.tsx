import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CellPosition } from '../../types/grid';
import type { NamedRange } from '../../types/grid';
import { cellKey } from '../../utils/coordinates';
import { Autocomplete } from './Autocomplete';
import { FunctionHint } from './FunctionHint';
import { useCaretPosition } from '../../hooks/useCaretPosition';
import { useFormulaBar } from '../../hooks/useFormulaBar';
import type { FunctionMeta } from '../../engine/types';
import { toggleAbsoluteRef } from '../../utils/referenceUpdater';
import type { FormulaRef } from '../../utils/formulaRefExtractor';

interface FormulaBarProps {
  activeCell: CellPosition;
  cellDisplayValue: string;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onStartEditing: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  namedRanges?: NamedRange[];
  onNameBoxSelect?: (name: string) => void;
  onNameBoxCreate?: (name: string) => void;
  onOpenFunctionWizard?: () => void;
  formulaRefs?: FormulaRef[];
  refColors?: string[];
  /** The active cell's formula syntax error (range in the formula text without '='), shown when not editing. */
  parseError?: { message: string; start: number; end: number };
}

export const FormulaBar = memo(function FormulaBar({
  activeCell,
  cellDisplayValue,
  isEditing,
  editValue,
  onEditChange,
  onStartEditing,
  onConfirmEdit,
  onCancelEdit,
  namedRanges,
  onNameBoxSelect,
  onNameBoxCreate,
  onOpenFunctionWizard,
  formulaRefs,
  refColors,
  parseError,
}: FormulaBarProps) {
  const cellName = cellKey(activeCell.col, activeCell.row);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameBoxInputRef = useRef<HTMLInputElement>(null);
  const [nameBoxEditing, setNameBoxEditing] = useState(false);
  const [nameBoxValue, setNameBoxValue] = useState('');
  const [nameBoxDropdownOpen, setNameBoxDropdownOpen] = useState(false);
  const focusInitiatedRef = useRef(false);
  const prevIsEditingRef = useRef(isEditing);
  // Tracks whether this input (rather than the cell editor) currently has DOM focus, so its
  // autocomplete dropdown only shows on this side (never simultaneously with the cell editor's).
  const [hasFocus, setHasFocus] = useState(false);
  const caret = useCaretPosition(inputRef, isEditing && hasFocus);
  const {
    suggestions,
    selectedIndex,
    updateSuggestions,
    clearSuggestions,
    moveSelection,
    getSelectedSuggestion,
    selectSuggestion,
  } = useFormulaBar();

  // When cell editing starts from the formula bar
  const handleFocus = useCallback(() => {
    setHasFocus(true);
    if (!isEditing) {
      focusInitiatedRef.current = true;
      onStartEditing();
    }
  }, [isEditing, onStartEditing]);

  // useEffect required: manages input focus and clears suggestions on editing state transitions
  useEffect(() => {
    const wasEditing = prevIsEditingRef.current;
    prevIsEditingRef.current = isEditing;

    if (!isEditing && wasEditing) {
      // Editing just ended
      focusInitiatedRef.current = false;
      clearSuggestions();
    } else if (isEditing && !wasEditing && focusInitiatedRef.current && inputRef.current) {
      // Editing just started from the formula bar
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [isEditing, clearSuggestions]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onEditChange(value);
      updateSuggestions(value);
    },
    [onEditChange, updateSuggestions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // IME composition in progress: Enter/Escape/arrows belong to the IME, not the formula bar
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelection(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelection(-1);
          return;
        }
        if (e.key === 'Tab') {
          const selected = getSelectedSuggestion();
          if (selected) {
            e.preventDefault();
            const newValue = selectSuggestion(selected, editValue);
            onEditChange(newValue);
            updateSuggestions(newValue);
            return;
          }
        }
      }

      if (e.key === 'F4') {
        e.preventDefault();
        const cursor = inputRef.current?.selectionStart ?? 0;
        const result = toggleAbsoluteRef(editValue, cursor);
        if (result) {
          onEditChange(result.text);
          requestAnimationFrame(() => {
            inputRef.current?.setSelectionRange(result.cursorPos, result.cursorPos);
          });
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions.length > 0) {
          const selected = getSelectedSuggestion();
          if (selected) {
            const newValue = selectSuggestion(selected, editValue);
            onEditChange(newValue);
            updateSuggestions(newValue);
            return;
          }
        }
        clearSuggestions();
        onConfirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearSuggestions();
        onCancelEdit();
      }
    },
    [
      suggestions,
      moveSelection,
      getSelectedSuggestion,
      selectSuggestion,
      editValue,
      onEditChange,
      updateSuggestions,
      clearSuggestions,
      onConfirmEdit,
      onCancelEdit,
    ],
  );

  const handleSuggestionSelect = useCallback(
    (fn: FunctionMeta) => {
      const newValue = selectSuggestion(fn, editValue);
      onEditChange(newValue);
      updateSuggestions(newValue);
      inputRef.current?.focus();
    },
    [selectSuggestion, editValue, onEditChange, updateSuggestions],
  );

  const handleBlur = useCallback(() => {
    setHasFocus(false);
    // Small delay to allow autocomplete clicks to register
    setTimeout(() => {
      clearSuggestions();
    }, 200);
  }, [clearSuggestions]);

  const displayText = isEditing ? editValue : cellDisplayValue;

  // Build colored segments for the formula text overlay
  const hasColoredRefs = !!(isEditing && formulaRefs && formulaRefs.length > 0 && refColors);
  const coloredSegments = useMemo(() => {
    if (!formulaRefs || !refColors || formulaRefs.length === 0) return null;
    const text = editValue;
    const segments: { text: string; color?: string }[] = [];
    let lastEnd = 0;

    // extractFormulaRefs already returns refs in left-to-right position order
    for (let i = 0; i < formulaRefs.length; i++) {
      const fRef = formulaRefs[i];
      if (fRef.start > lastEnd) {
        segments.push({ text: text.substring(lastEnd, fRef.start) });
      }
      segments.push({
        text: text.substring(fRef.start, fRef.end),
        color: refColors[i % refColors.length],
      });
      lastEnd = fRef.end;
    }
    if (lastEnd < text.length) {
      segments.push({ text: text.substring(lastEnd) });
    }
    return segments;
  }, [editValue, formulaRefs, refColors]);

  // Syntax error view: split the shown formula around the error range (+1 for the leading '=')
  const errorView = useMemo(() => {
    if (isEditing || !parseError || !displayText.startsWith('=')) return null;
    const start = Math.min(parseError.start + 1, displayText.length);
    const end = Math.min(Math.max(parseError.end + 1, start), displayText.length);
    return {
      before: displayText.slice(0, start),
      error: displayText.slice(start, end),
      after: displayText.slice(end),
      // 1-based column in the shown text; an empty range at the very end means "the formula stops short"
      where: start === end && end === displayText.length ? '末尾' : `${start + 1}文字目`,
    };
  }, [isEditing, parseError, displayText]);

  // Sync overlay scroll position with input scroll
  const overlayRef = useRef<HTMLDivElement>(null);
  const errorOverlayRef = useRef<HTMLDivElement>(null);
  const syncScroll = useCallback(() => {
    if (!inputRef.current) return;
    if (overlayRef.current) overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    if (errorOverlayRef.current) errorOverlayRef.current.scrollLeft = inputRef.current.scrollLeft;
  }, []);

  // useLayoutEffect required: sync overlay scroll whenever editValue changes or input scrolls
  useLayoutEffect(() => {
    syncScroll();
  }, [editValue, syncScroll]);

  return (
    <div className="flex items-center h-8 border-b border-grid-line bg-grid-bg px-2 gap-2 shrink-0 transition-colors duration-200">
      {/* Cell name box - interactive */}
      <div className="relative w-24" data-testid="cell-name-box">
        {nameBoxEditing ? (
          <input
            ref={nameBoxInputRef}
            type="text"
            value={nameBoxValue}
            onChange={(e) => setNameBoxValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = nameBoxValue.trim();
                if (val) {
                  // Check if it matches an existing named range
                  const existing = namedRanges?.find((nr) => nr.name === val);
                  if (existing && onNameBoxSelect) {
                    onNameBoxSelect(val);
                  } else if (onNameBoxCreate) {
                    onNameBoxCreate(val);
                  }
                }
                setNameBoxEditing(false);
                setNameBoxDropdownOpen(false);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setNameBoxEditing(false);
                setNameBoxDropdownOpen(false);
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                setNameBoxEditing(false);
                setNameBoxDropdownOpen(false);
              }, 200);
            }}
            className="w-full h-6 px-2 text-xs bg-ui-bg text-text-primary border border-accent-selection rounded outline-none"
          />
        ) : (
          <div
            className="flex items-center justify-center w-full h-6 border border-grid-line bg-ui-bg text-text-primary text-xs font-medium rounded select-none cursor-pointer hover:border-accent-selection transition-all duration-150"
            onClick={() => {
              setNameBoxEditing(true);
              setNameBoxValue(cellName);
              setNameBoxDropdownOpen(namedRanges != null && namedRanges.length > 0);
              setTimeout(() => {
                nameBoxInputRef.current?.focus();
                nameBoxInputRef.current?.select();
              }, 0);
            }}
          >
            {cellName}
          </div>
        )}
        {/* Named range dropdown */}
        {nameBoxDropdownOpen && namedRanges && namedRanges.length > 0 && (
          <div
            data-dropdown
            className="absolute top-7 left-0 w-48 glass-surface rounded-xl z-50 max-h-40 overflow-auto animate-slide-down"
          >
            {namedRanges.map((nr) => (
              <div
                key={nr.name}
                className="px-2 py-1 text-xs text-text-primary hover:bg-accent-selection/20 cursor-pointer truncate"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (onNameBoxSelect) {
                    onNameBoxSelect(nr.name);
                  }
                  setNameBoxEditing(false);
                  setNameBoxDropdownOpen(false);
                }}
              >
                <span className="font-medium">{nr.name}</span>
                <span className="text-text-primary/50 ml-1">({nr.range})</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Separator */}
      <div className="w-px h-5 bg-grid-line" />
      {/* fx button */}
      <button
        type="button"
        className="flex items-center justify-center w-7 h-6 text-accent-formula text-xs font-semibold italic select-none hover:bg-accent-selection/10 active:scale-90 rounded cursor-pointer transition-all duration-100"
        onClick={onOpenFunctionWizard}
        title="関数の挿入"
      >
        fx
      </button>
      {/* Separator */}
      <div className="w-px h-5 bg-grid-line" />
      {/* Formula/value input */}
      <div className="flex-1 relative">
        {/* Colored text overlay (behind transparent input) */}
        {/* Syntax error marker: wavy underline (or a caret for "missing here") over the input text */}
        {errorView && (
          <div
            ref={errorOverlayRef}
            aria-hidden
            className="absolute inset-0 h-6 px-[9px] border border-transparent rounded text-[13px] text-transparent whitespace-pre overflow-hidden pointer-events-none leading-6"
          >
            <span>{errorView.before}</span>
            {errorView.error ? (
              <span className="formula-error-span">{errorView.error}</span>
            ) : (
              <span className="formula-error-caret" />
            )}
            <span>{errorView.after}</span>
          </div>
        )}
        {hasColoredRefs && coloredSegments && (
          <div
            ref={overlayRef}
            aria-hidden
            className="absolute inset-0 h-6 px-[9px] border border-transparent rounded text-[13px] text-text-primary whitespace-pre overflow-hidden pointer-events-none leading-6"
          >
            {coloredSegments.map((seg, i) => (
              <span key={i} style={seg.color ? { color: seg.color, fontWeight: 600 } : undefined}>
                {seg.text}
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onScroll={hasColoredRefs || errorView ? syncScroll : undefined}
          readOnly={!isEditing}
          className={`w-full h-6 px-2 border border-grid-line bg-ui-bg rounded text-[13px] outline-none focus:border-accent-selection ${hasColoredRefs ? '' : 'text-text-primary'}`}
          style={
            hasColoredRefs
              ? { color: 'transparent', caretColor: 'var(--color-text-primary)' }
              : undefined
          }
          data-testid="formula-bar-input"
        />
        {isEditing && suggestions.length > 0 && hasFocus && (
          <Autocomplete
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={handleSuggestionSelect}
          />
        )}
        {isEditing && suggestions.length === 0 && hasFocus && caret !== null && (
          <FunctionHint value={editValue} caret={caret} />
        )}
      </div>
      {errorView && parseError && (
        <div
          key={`${parseError.message}:${parseError.start}`}
          className="formula-error-chip animate-fade-in-scale"
          role="status"
          data-testid="formula-error"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 1.2 11 10.2H1z"
              fill="currentColor"
              fillOpacity="0.18"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <path
              d="M6 4.6v2.6M6 8.6v.2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <span className="truncate">{parseError.message}</span>
          <span className="formula-error-where">{errorView.where}</span>
        </div>
      )}
    </div>
  );
});
