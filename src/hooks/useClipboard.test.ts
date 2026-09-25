// @vitest-environment happy-dom
import { describe, it, expect } from 'vite-plus/test';
import { act, renderHook } from '@testing-library/react';
import { useClipboard } from './useClipboard';

const getCell = () => ({ rawValue: 'x', displayText: 'x', valueText: 'x' });
// A fake copy event, so copy() writes into it instead of the async system clipboard
const copyEvent = () =>
  ({ clipboardData: { setData: () => {} }, preventDefault: () => {} }) as unknown as ClipboardEvent;

describe('useClipboard marquee range', () => {
  it('moves the marquee when a second range is copied while one is already copied', () => {
    const { result } = renderHook(() => useClipboard());
    act(() =>
      result.current.copy(
        { start: { col: 0, row: 0 }, end: { col: 1, row: 1 } },
        getCell,
        's1',
        false,
        copyEvent(),
      ),
    );
    expect(result.current.clipboardRange).toEqual({
      start: { col: 0, row: 0 },
      end: { col: 1, row: 1 },
    });

    act(() =>
      result.current.copy(
        { start: { col: 3, row: 5 }, end: { col: 3, row: 5 } },
        getCell,
        's1',
        false,
        copyEvent(),
      ),
    );
    expect(result.current.clipboardRange).toEqual({
      start: { col: 3, row: 5 },
      end: { col: 3, row: 5 },
    });
    expect(result.current.isCellInClipboard(3, 5)).toBe(true);
    expect(result.current.isCellInClipboard(0, 0)).toBe(false);
  });

  it('clears the marquee on cancel', () => {
    const { result } = renderHook(() => useClipboard());
    act(() =>
      result.current.copy(
        { start: { col: 0, row: 0 }, end: { col: 0, row: 0 } },
        getCell,
        's1',
        false,
        copyEvent(),
      ),
    );
    expect(result.current.hasClipboard).toBe(true);
    act(() => result.current.cancelClipboard());
    expect(result.current.hasClipboard).toBe(false);
    expect(result.current.clipboardRange).toBeNull();
  });
});
