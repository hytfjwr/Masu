import { useCallback, useMemo, useState } from 'react';
import type { FunctionMeta } from '../engine/types';
import { getAllFunctionMetas } from '../engine/functions';

export interface UseFormulaBarReturn {
  suggestions: FunctionMeta[];
  selectedIndex: number;
  updateSuggestions: (value: string) => void;
  clearSuggestions: () => void;
  moveSelection: (delta: number) => void;
  getSelectedSuggestion: () => FunctionMeta | null;
  selectSuggestion: (fn: FunctionMeta, currentValue: string) => string;
}

/**
 * Extract the function name being typed at the end of the formula.
 * Returns the partial function name if the user is typing one, or null.
 *
 * Examples:
 *   "=SU" -> "SU"
 *   "=SUM(A1, MA" -> "MA"
 *   "=SUM(" -> null (nothing after the paren)
 *   "hello" -> null (not a formula)
 */
export function extractPartialFunctionName(value: string): string | null {
  if (!value.startsWith('=')) return null;

  const content = value.slice(1); // Remove '='
  if (content.length === 0) return null;

  // Walk backwards to find the start of the current token
  let i = content.length - 1;

  // Function names start with a letter and may contain digits and dots (LOG10, STDEV.S, NORM.S.DIST)
  if (!/[a-zA-Z0-9.]/.test(content[i])) return null;

  while (i >= 0 && /[a-zA-Z0-9.]/.test(content[i])) {
    i--;
  }
  // Skip leading digits/dots so the token starts with a letter (e.g. "1+SU" → "SU")
  while (i + 1 < content.length && !/[a-zA-Z]/.test(content[i + 1])) {
    i++;
  }
  if (i + 1 >= content.length) return null;

  // The character before the identifier must be one of: start, '(', ',', ' ', or an operator
  if (i >= 0) {
    const prev = content[i];
    if (!/[(\s,+\-*/>=<!]/.test(prev)) return null;
  }

  const partial = content.slice(i + 1);

  // Don't show suggestions for single-letter cell refs like A, B, etc.
  // unless it's more than one letter or clearly a function name prefix
  if (partial.length < 1) return null;

  return partial.toUpperCase();
}

export function useFormulaBar(): UseFormulaBarReturn {
  const allFunctions = useMemo(() => getAllFunctionMetas(), []);
  const [suggestions, setSuggestions] = useState<FunctionMeta[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const updateSuggestions = useCallback(
    (value: string) => {
      const partial = extractPartialFunctionName(value);
      if (!partial || partial.length < 1) {
        setSuggestions([]);
        setSelectedIndex(0);
        return;
      }

      const matches = allFunctions.filter((fn) => fn.name.startsWith(partial));
      setSuggestions(matches);
      setSelectedIndex(0);
    },
    [allFunctions],
  );

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setSelectedIndex(0);
  }, []);

  const moveSelection = useCallback((delta: number) => {
    setSuggestions((current) => {
      if (current.length === 0) return current;
      setSelectedIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return current.length - 1;
        if (next >= current.length) return 0;
        return next;
      });
      return current;
    });
  }, []);

  const getSelectedSuggestion = useCallback((): FunctionMeta | null => {
    if (suggestions.length === 0) return null;
    return suggestions[selectedIndex] ?? null;
  }, [suggestions, selectedIndex]);

  const selectSuggestion = useCallback((fn: FunctionMeta, currentValue: string): string => {
    // Find where the partial function name starts in the value
    const partial = extractPartialFunctionName(currentValue);
    if (!partial) return currentValue;

    // Replace the partial with the full function name + opening paren
    const insertText = fn.name + '(';
    const prefix = currentValue.slice(0, currentValue.length - partial.length);
    return prefix + insertText;
  }, []);

  return {
    suggestions,
    selectedIndex,
    updateSuggestions,
    clearSuggestions,
    moveSelection,
    getSelectedSuggestion,
    selectSuggestion,
  };
}
