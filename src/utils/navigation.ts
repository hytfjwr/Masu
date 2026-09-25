export type HasValue = (col: number, row: number) => boolean;

/**
 * Compute the destination of a Ctrl+Arrow "jump to data edge" move (Excel/Sheets compatible).
 * Exactly one of dCol/dRow must be non-zero (the other must be 0).
 *
 * Rules (looking at the next cell in the direction of travel):
 * - If `from` has a value and the next cell also has a value, keep moving while cells have
 *   values, stopping on the last cell that has a value.
 * - Otherwise, keep moving until a cell with a value is found; if none is found, stop at the
 *   edge of the grid (0 or max).
 * - If `from` is already at the edge, return `from` unchanged.
 */
export function findDataEdge(
  from: { col: number; row: number },
  dCol: number,
  dRow: number,
  hasValue: HasValue,
  maxCol: number,
  maxRow: number,
  /** Optional visibility check (hidden rows/cols). When given, a final landing position that
   * isn't visible is walked back (opposite of the travel direction) to the nearest visible one. */
  isVisible?: (col: number, row: number) => boolean,
): { col: number; row: number } {
  const clampCol = (c: number) => Math.max(0, Math.min(maxCol, c));
  const clampRow = (r: number) => Math.max(0, Math.min(maxRow, r));

  const snapToVisible = (col: number, row: number): { col: number; row: number } => {
    if (!isVisible || isVisible(col, row)) return { col, row };
    let c = col;
    let r = row;
    while ((c !== from.col || r !== from.row) && !isVisible(c, r)) {
      c -= dCol;
      r -= dRow;
    }
    return { col: c, row: r };
  };

  const nextCol = clampCol(from.col + dCol);
  const nextRow = clampRow(from.row + dRow);

  // Already at the edge in the direction of travel
  if (nextCol === from.col && nextRow === from.row) {
    return { ...from };
  }

  const fromHasValue = hasValue(from.col, from.row);
  const nextHasValue = hasValue(nextCol, nextRow);

  let col = from.col;
  let row = from.row;

  if (fromHasValue && nextHasValue) {
    // Move while cells have values, stop at the last one that does
    let curCol = nextCol;
    let curRow = nextRow;
    while (hasValue(curCol, curRow)) {
      col = curCol;
      row = curRow;
      const c = clampCol(curCol + dCol);
      const r = clampRow(curRow + dRow);
      if (c === curCol && r === curRow) break; // hit the edge
      curCol = c;
      curRow = r;
    }
  } else {
    // Move until a cell with a value is found, or stop at the edge
    let curCol = nextCol;
    let curRow = nextRow;
    while (!hasValue(curCol, curRow)) {
      const c = clampCol(curCol + dCol);
      const r = clampRow(curRow + dRow);
      if (c === curCol && r === curRow) {
        // Reached the edge without finding a value
        col = curCol;
        row = curRow;
        return snapToVisible(col, row);
      }
      curCol = c;
      curRow = r;
    }
    col = curCol;
    row = curRow;
  }

  return snapToVisible(col, row);
}
