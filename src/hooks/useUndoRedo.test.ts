// @vitest-environment happy-dom
import { describe, it, expect } from 'vite-plus/test';
import { act, renderHook } from '@testing-library/react';
import { useUndoRedo, type WorkbookSnapshot } from './useUndoRedo';
import { createEmptySheet } from '../utils/sheetUtils';

/** A workbook whose one sheet has A1 = `value`. */
function wb(value: string): WorkbookSnapshot {
  const sheet = createEmptySheet('S');
  sheet.id = 's1';
  sheet.cells.set('A1', { rawValue: value, displayValue: value });
  return { sheets: [sheet], activeSheetId: 's1' };
}
const a1 = (snap: unknown) => (snap as WorkbookSnapshot).sheets[0].cells.get('A1')?.rawValue;

describe('useUndoRedo timeline', () => {
  it('lists undo states, the current state and redo states in order, with times', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => result.current.pushSnapshot(wb('0')));
    act(() => result.current.pushSnapshot(wb('1')));
    expect(result.current.timeline.map((e) => e.current)).toEqual([false, false, true]);
    expect(result.current.timeline[0].time).toBeNull();
    expect(typeof result.current.timeline[2].time).toBe('number');
    expect(a1(result.current.getTimelineSnapshot(1))).toBe('1');
    expect(result.current.getTimelineSnapshot(2)).toBeUndefined();
  });

  it('jumps to any state in one step and can jump back, keeping every state', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => result.current.pushSnapshot(wb('0')));
    act(() => result.current.pushSnapshot(wb('1')));
    act(() => result.current.pushSnapshot(wb('2')));
    // current state is '3' (not stored yet); jump to the oldest
    let restored: unknown;
    act(() => {
      restored = result.current.jumpTo(0, wb('3'));
    });
    expect(a1(restored)).toBe('0');
    expect(result.current.timeline.map((e) => e.current)).toEqual([true, false, false, false]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    // and back to the newest
    act(() => {
      restored = result.current.jumpTo(3, wb('0'));
    });
    expect(a1(restored)).toBe('3');
    expect(result.current.timeline).toHaveLength(4);
    // jumping to the current state is a no-op
    act(() => {
      restored = result.current.jumpTo(3, wb('3'));
    });
    expect(restored).toBeUndefined();
  });
});
