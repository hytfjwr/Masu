// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { SearchPanel } from './SearchPanel';
import { createEmptySheet } from '../../utils/sheetUtils';

function makeSheet() {
  const sheet = createEmptySheet('Sheet1');
  for (const key of ['A1', 'A2', 'A3']) sheet.cells.set(key, { rawValue: 'apple', displayValue: 'apple', computed: 'apple' });
  return sheet;
}

describe('SearchPanel navigation', () => {
  it('moves to the next/previous match even when the parent re-renders with equal props', () => {
    const sheet = makeSheet();
    const onNavigate = vi.fn();
    const props = {
      visible: true,
      onClose: () => {},
      sheets: [sheet],
      activeSheetId: sheet.id,
      onNavigateToCell: onNavigate,
      onReplaceOne: () => {},
      onReplaceAll: () => {},
    };
    const { rerender, getByPlaceholderText, getByTitle } = render(<SearchPanel {...props} hiddenRows={new Set()} />);
    const input = getByPlaceholderText(/検索/);
    fireEvent.change(input, { target: { value: 'apple' } });
    expect(onNavigate).toHaveBeenLastCalledWith(sheet.id, { col: 0, row: 0 });

    fireEvent.click(getByTitle(/次を検索/));
    expect(onNavigate).toHaveBeenLastCalledWith(sheet.id, { col: 0, row: 1 });
    // Navigating re-renders the grid, which may pass a new (but equal) hiddenRows set
    rerender(<SearchPanel {...props} hiddenRows={new Set()} />);
    expect(onNavigate).toHaveBeenLastCalledWith(sheet.id, { col: 0, row: 1 });

    fireEvent.click(getByTitle(/次を検索/));
    expect(onNavigate).toHaveBeenLastCalledWith(sheet.id, { col: 0, row: 2 });
    fireEvent.click(getByTitle(/前を検索/));
    expect(onNavigate).toHaveBeenLastCalledWith(sheet.id, { col: 0, row: 1 });
  });
});
