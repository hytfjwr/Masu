import { describe, it, expect } from 'vite-plus/test';
import { findDataEdge } from './navigation';

// Simulate a row of cells with values at the given column indices (0-indexed), on row 0.
function rowHasValue(filled: Set<number>): (col: number, row: number) => boolean {
  return (col, row) => row === 0 && filled.has(col);
}

describe('findDataEdge', () => {
  const maxCol = 9; // 10 columns
  const maxRow = 9;

  it('stops at the end of a contiguous block moving right', () => {
    // Filled: 0,1,2,3 (block), then gap, then 6
    const hasValue = rowHasValue(new Set([0, 1, 2, 3, 6]));
    const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 3, row: 0 });
  });

  it('jumps over blank cells to the next value moving right', () => {
    const hasValue = rowHasValue(new Set([0, 6]));
    const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 6, row: 0 });
  });

  it('moves to the edge when no further value exists', () => {
    const hasValue = rowHasValue(new Set([0]));
    const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: maxCol, row: 0 });
  });

  it('works in the reverse (leftward) direction, jumping to the nearest value', () => {
    // from (8) has a value but its immediate neighbor (7) is blank, so this stops
    // at the first non-blank cell found (4), not the far end of the 2-3-4 block.
    const hasValue = rowHasValue(new Set([2, 3, 4, 8]));
    const result = findDataEdge({ col: 8, row: 0 }, -1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 4, row: 0 });
  });

  it('traverses a contiguous block leftward when adjacent to the start', () => {
    const hasValue = rowHasValue(new Set([2, 3, 4, 5]));
    const result = findDataEdge({ col: 5, row: 0 }, -1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 2, row: 0 });
  });

  it('returns the same position when already at the edge', () => {
    const hasValue = rowHasValue(new Set([0]));
    const result = findDataEdge({ col: 0, row: 0 }, -1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it('stops at the edge cell when the block extends all the way to it', () => {
    const hasValue = rowHasValue(new Set([7, 8, 9]));
    const result = findDataEdge({ col: 7, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 9, row: 0 });
  });

  it('jumps to the next value when starting on a blank cell', () => {
    const hasValue = rowHasValue(new Set([5]));
    const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 5, row: 0 });
  });

  it('works vertically as well', () => {
    const filled = new Set([0, 1, 2]);
    const hasValue = (col: number, row: number) => col === 0 && filled.has(row);
    const result = findDataEdge({ col: 0, row: 0 }, 0, 1, hasValue, maxCol, maxRow);
    expect(result).toEqual({ col: 0, row: 2 });
  });

  describe('isVisible (hidden rows/cols)', () => {
    it('snaps back to the last visible cell when the edge landing spot is hidden', () => {
      // No values anywhere: moving right from col 0 would normally land on the grid edge (col 9),
      // but cols 8-9 are hidden, so it should snap back to the last visible col (7).
      const hasValue = () => false;
      const isVisible = (col: number) => col < 8;
      const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow, isVisible);
      expect(result).toEqual({ col: 7, row: 0 });
    });

    it('does not change behavior when the landing spot is already visible', () => {
      const hasValue = rowHasValue(new Set([0, 1, 2, 3]));
      const isVisible = () => true;
      const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow, isVisible);
      expect(result).toEqual({ col: 3, row: 0 });
    });

    it('is a no-op when isVisible is omitted, even with hidden-like gaps in hasValue', () => {
      const hasValue = () => false;
      const result = findDataEdge({ col: 0, row: 0 }, 1, 0, hasValue, maxCol, maxRow);
      expect(result).toEqual({ col: maxCol, row: 0 });
    });
  });
});
