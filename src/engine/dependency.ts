import { parseCellKey } from '../utils/coordinates';

/**
 * A range dependency: a formula depends on every cell within this rectangular
 * region of `sheetId`, without the range being expanded into individual cell keys.
 * `endCol`/`endRow` of `null` mean "to the end of the used range".
 */
export interface GlobalRangeDep {
  sheetId: string;
  startCol: number;
  startRow: number;
  endCol: number | null;
  endRow: number | null;
}

function inRange(sheetId: string, col: number, row: number, range: GlobalRangeDep): boolean {
  if (range.sheetId !== sheetId) return false;
  if (col < range.startCol) return false;
  if (range.endCol !== null && col > range.endCol) return false;
  if (row < range.startRow) return false;
  if (range.endRow !== null && row > range.endRow) return false;
  return true;
}

/** True if any of the (col -> sorted rows) coordinates lies inside `range`. */
function rangeHitsAny(range: GlobalRangeDep, cols: Map<number, number[]>): boolean {
  for (const [col, rows] of cols) {
    if (col < range.startCol || (range.endCol !== null && col > range.endCol)) continue;
    // first row >= startRow (binary search), then check it is <= endRow
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid] < range.startRow) lo = mid + 1; else hi = mid;
    }
    if (lo < rows.length && (range.endRow === null || rows[lo] <= range.endRow)) return true;
  }
  return false;
}

/** Parse a global key ('sheetId:A1') into its sheetId and 0-indexed coordinates. Returns null if not a global key. */
function parseGlobalCoords(key: string): { sheetId: string; col: number; row: number } | null {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) return null;
  const sheetId = key.slice(0, colonIdx);
  const { col, row } = parseCellKey(key.slice(colonIdx + 1));
  return { sheetId, col, row };
}

interface RangeEntry {
  formulaKey: string;
  range: GlobalRangeDep;
}

/** Ranges spanning at most this many columns are bucketed per column; wider ones are scanned linearly. */
const MAX_BUCKET_SPAN = 64;

/** Per-sheet index of range dependencies, bucketed by column so a lookup only checks candidate ranges. */
class SheetRangeIndex {
  private byCol = new Map<number, Set<RangeEntry>>();
  private wide = new Set<RangeEntry>();
  /** Every entry (for batch matching against many changed cells at once) */
  readonly all = new Set<RangeEntry>();

  add(entry: RangeEntry): void {
    this.all.add(entry);
    const { startCol, endCol } = entry.range;
    if (endCol === null || endCol - startCol + 1 > MAX_BUCKET_SPAN) {
      this.wide.add(entry);
      return;
    }
    for (let c = startCol; c <= endCol; c++) {
      let set = this.byCol.get(c);
      if (!set) this.byCol.set(c, (set = new Set()));
      set.add(entry);
    }
  }

  remove(entry: RangeEntry): void {
    this.all.delete(entry);
    const { startCol, endCol } = entry.range;
    if (endCol === null || endCol - startCol + 1 > MAX_BUCKET_SPAN) {
      this.wide.delete(entry);
      return;
    }
    for (let c = startCol; c <= endCol; c++) {
      const set = this.byCol.get(c);
      if (!set) continue;
      set.delete(entry);
      if (set.size === 0) this.byCol.delete(c);
    }
  }

  /** Add the formula keys of every range containing (col, row) to `out`. */
  collect(sheetId: string, col: number, row: number, out: Set<string>): void {
    const bucket = this.byCol.get(col);
    if (bucket) for (const e of bucket) if (inRange(sheetId, col, row, e.range)) out.add(e.formulaKey);
    for (const e of this.wide) if (inRange(sheetId, col, row, e.range)) out.add(e.formulaKey);
  }

  get isEmpty(): boolean {
    return this.all.size === 0;
  }
}

/**
 * Dependency graph for tracking cell-to-cell relationships.
 *
 * The graph tracks two kinds of dependencies:
 * - Cell dependencies: dependsOn/dependents maps, one edge per referenced cell.
 * - Range dependencies: a formula may depend on an entire (unexpanded) range. These are
 *   kept separately per sheet and matched against a cell's coordinates on demand, so that
 *   large or open-ended ranges (e.g. whole columns) don't need to be expanded into millions
 *   of individual edges.
 *
 * When a cell's value changes, we look up its dependents to know which cells need recalculation.
 */
export class DependencyGraph {
  /** cellKey -> Set of cell keys this cell depends on (the cells it references) */
  private dependsOn = new Map<string, Set<string>>();

  /** cellKey -> Set of cell keys that depend on this cell (the cells that reference it) */
  private dependents = new Map<string, Set<string>>();

  /** sheetId -> index of (formula, range) pairs: formulas that depend on a range within this sheet */
  private rangeDependents = new Map<string, SheetRangeIndex>();

  /** formulaKey -> the range dependencies currently registered for it */
  private rangeDepsByFormula = new Map<string, GlobalRangeDep[]>();

  /** formulaKey -> its index entries (for O(span) removal) */
  private rangeEntriesByFormula = new Map<string, RangeEntry[]>();

  /**
   * Set the dependencies for a cell (both individual cells and ranges).
   * Removes old dependencies and adds new ones.
   */
  setDependencies(cellKey: string, deps: string[], rangeDeps: GlobalRangeDep[] = []): void {
    // Remove old dependencies
    this.removeDependencies(cellKey);

    // Add new cell dependencies
    const depSet = new Set(deps);
    this.dependsOn.set(cellKey, depSet);

    for (const dep of depSet) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep)!.add(cellKey);
    }

    // Add new range dependencies
    if (rangeDeps.length > 0) {
      this.rangeDepsByFormula.set(cellKey, rangeDeps.slice());
      const entries: RangeEntry[] = [];
      for (const range of rangeDeps) {
        let index = this.rangeDependents.get(range.sheetId);
        if (!index) this.rangeDependents.set(range.sheetId, (index = new SheetRangeIndex()));
        const entry = { formulaKey: cellKey, range };
        index.add(entry);
        entries.push(entry);
      }
      this.rangeEntriesByFormula.set(cellKey, entries);
    }
  }

  /**
   * Remove all dependencies (cell and range) for a cell (e.g., when the formula is cleared).
   */
  removeDependencies(cellKey: string): void {
    const oldDeps = this.dependsOn.get(cellKey);
    if (oldDeps) {
      for (const dep of oldDeps) {
        const depSet = this.dependents.get(dep);
        if (depSet) {
          depSet.delete(cellKey);
          if (depSet.size === 0) {
            this.dependents.delete(dep);
          }
        }
      }
      this.dependsOn.delete(cellKey);
    }

    const oldEntries = this.rangeEntriesByFormula.get(cellKey);
    if (oldEntries) {
      for (const entry of oldEntries) {
        const index = this.rangeDependents.get(entry.range.sheetId);
        if (!index) continue;
        index.remove(entry);
        if (index.isEmpty) this.rangeDependents.delete(entry.range.sheetId);
      }
      this.rangeEntriesByFormula.delete(cellKey);
    }
    this.rangeDepsByFormula.delete(cellKey);
  }

  /**
   * Get all cells that directly depend on the given cell — via a direct cell reference,
   * or via a range dependency that contains the cell's coordinates.
   */
  getDependents(cellKey: string): Set<string> {
    const result = new Set(this.dependents.get(cellKey) ?? []);

    const coords = parseGlobalCoords(cellKey);
    if (!coords) return result;

    this.rangeDependents.get(coords.sheetId)?.collect(coords.sheetId, coords.col, coords.row, result);
    return result;
  }

  /** The range dependencies of a formula cell (unexpanded, as registered). */
  getRangeDependsOn(cellKey: string): GlobalRangeDep[] {
    return this.rangeDepsByFormula.get(cellKey) ?? [];
  }

  /**
   * Get all cells that the given cell depends on (individual cell dependencies only;
   * range dependencies are not expanded here).
   */
  getDependsOn(cellKey: string): Set<string> {
    return this.dependsOn.get(cellKey) ?? new Set();
  }

  /**
   * Detect if adding dependencies for `cellKey` pointing to `deps` (and `rangeDeps`) would
   * create a cycle. Walks forward from cellKey via getDependents (which includes range
   * dependents); if any reached node (including cellKey itself) is in `deps` or falls
   * within one of `rangeDeps`, the new dependency would close a cycle.
   */
  wouldCreateCycle(cellKey: string, deps: string[], rangeDeps: GlobalRangeDep[] = []): boolean {
    const depsSet = new Set(deps);
    const matchesRangeDeps = (key: string): boolean => {
      if (rangeDeps.length === 0) return false;
      const coords = parseGlobalCoords(key);
      if (!coords) return false;
      return rangeDeps.some(range => inRange(coords.sheetId, coords.col, coords.row, range));
    };

    const visited = new Set<string>();
    const queue: string[] = [cellKey];
    let qi = 0;
    while (qi < queue.length) {
      const current = queue[qi++];
      if (visited.has(current)) continue;
      visited.add(current);

      if (depsSet.has(current) || matchesRangeDeps(current)) return true;

      for (const next of this.getDependents(current)) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    return false;
  }

  /**
   * Get all cells that need recalculation when the given cells change, in topological
   * order (dependencies are recalculated before dependents). `alsoInclude` cells (e.g.
   * volatile functions) are seeded into the affected set directly, alongside their
   * transitive dependents.
   */
  getRecalculationOrder(changedCells: string[], alsoInclude: string[] = []): string[] {
    // changedCells are only BFS seeds: they were just written by the caller and must not be
    // re-evaluated (that would e.g. overwrite a circular-reference #REF! with a fresh result).
    const affected = new Set<string>();
    let frontier: string[] = [...new Set(changedCells)];
    for (const key of alsoInclude) {
      if (!affected.has(key)) {
        affected.add(key);
        frontier.push(key);
      }
    }

    // Level-synchronous BFS. Range dependents are matched once per level against all frontier cells
    // (bucketed by sheet and column) instead of once per frontier cell, which keeps "thousands of
    // formulas over the same big range" linear instead of quadratic.
    while (frontier.length > 0) {
      const next: string[] = [];
      const add = (key: string) => {
        if (!affected.has(key)) {
          affected.add(key);
          next.push(key);
        }
      };

      const coordsBySheet = new Map<string, Map<number, number[]>>();
      for (const cell of frontier) {
        const direct = this.dependents.get(cell);
        if (direct) for (const d of direct) add(d);
        const coords = parseGlobalCoords(cell);
        if (!coords || !this.rangeDependents.has(coords.sheetId)) continue;
        let cols = coordsBySheet.get(coords.sheetId);
        if (!cols) coordsBySheet.set(coords.sheetId, (cols = new Map()));
        let rows = cols.get(coords.col);
        if (!rows) cols.set(coords.col, (rows = []));
        rows.push(coords.row);
      }

      for (const [sheetId, cols] of coordsBySheet) {
        const index = this.rangeDependents.get(sheetId);
        if (!index) continue;
        for (const rows of cols.values()) rows.sort((x, y) => x - y);
        for (const entry of index.all) {
          if (affected.has(entry.formulaKey)) continue;
          if (rangeHitsAny(entry.range, cols)) add(entry.formulaKey);
        }
      }

      frontier = next;
    }

    return this.topologicalSort(affected);
  }

  /**
   * Rebuild the dependency graph from CellDataMap (legacy cell-dependency-only path).
   * Clears existing state (including range dependencies) and reconstructs dependsOn/dependents
   * from each cell's `dependencies` array. Range dependencies are not reconstructed here.
   */
  rebuildFromCellData(data: Map<string, { dependencies?: string[] }>): void {
    this.dependsOn.clear();
    this.dependents.clear();
    this.rangeDependents.clear();
    this.rangeDepsByFormula.clear();
    this.rangeEntriesByFormula.clear();

    for (const [key, cell] of data) {
      if (cell.dependencies && cell.dependencies.length > 0) {
        const depSet = new Set(cell.dependencies);
        this.dependsOn.set(key, depSet);

        for (const dep of depSet) {
          if (!this.dependents.has(dep)) {
            this.dependents.set(dep, new Set());
          }
          this.dependents.get(dep)!.add(key);
        }
      }
    }
  }

  /**
   * Topological sort of a set of cells based on their dependencies (cell and range).
   */
  private topologicalSort(cells: Set<string>): string[] {
    // Pre-parse the affected cells' coordinates once and index them by sheet + column, so range
    // dependencies only look at candidate cells instead of re-parsing every affected key.
    const bySheetCol = new Map<string, Map<number, Array<{ key: string; row: number }>>>();
    for (const key of cells) {
      const coords = parseGlobalCoords(key);
      if (!coords) continue;
      let cols = bySheetCol.get(coords.sheetId);
      if (!cols) bySheetCol.set(coords.sheetId, (cols = new Map()));
      let list = cols.get(coords.col);
      if (!list) cols.set(coords.col, (list = []));
      list.push({ key, row: coords.row });
    }

    // Each distinct range becomes one virtual node (prefixed with NUL, never a real cell key) that
    // depends on the affected cells inside it; formulas depend on the virtual node. Many formulas
    // sharing a range (e.g. 3000 × SUM(A:A)) then cost O(formulas + cells) edges instead of their product.
    const RANGE_NODE = '\u0000range:';
    const rangeNodeKey = (r: GlobalRangeDep) => `${RANGE_NODE}${r.sheetId}|${r.startCol}|${r.startRow}|${r.endCol}|${r.endRow}`;
    const rangeByNode = new Map<string, GlobalRangeDep>();

    const prerequisites = (node: string): string[] => {
      const out: string[] = [];
      if (node.startsWith(RANGE_NODE)) {
        const range = rangeByNode.get(node)!;
        const cols = bySheetCol.get(range.sheetId);
        if (!cols) return out;
        for (const [col, list] of cols) {
          if (col < range.startCol || (range.endCol !== null && col > range.endCol)) continue;
          for (const { key, row } of list) {
            if (row < range.startRow || (range.endRow !== null && row > range.endRow)) continue;
            out.push(key);
          }
        }
        return out;
      }
      const deps = this.dependsOn.get(node);
      if (deps) for (const dep of deps) if (dep !== node && cells.has(dep)) out.push(dep);
      const rangeDeps = this.rangeDepsByFormula.get(node);
      if (rangeDeps) {
        for (const range of rangeDeps) {
          if (!bySheetCol.has(range.sheetId)) continue;
          const rk = rangeNodeKey(range);
          if (!rangeByNode.has(rk)) rangeByNode.set(rk, range);
          out.push(rk);
        }
      }
      return out;
    };

    // Iterative post-order DFS (no recursion: long dependency chains must not overflow the stack)
    const result: string[] = [];
    const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
    for (const root of cells) {
      if (state.has(root)) continue;
      const stack: Array<{ key: string; prereqs: string[]; i: number }> = [{ key: root, prereqs: prerequisites(root), i: 0 }];
      state.set(root, 1);
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.i < top.prereqs.length) {
          const next = top.prereqs[top.i++];
          if (!state.has(next)) {
            state.set(next, 1);
            stack.push({ key: next, prereqs: prerequisites(next), i: 0 });
          }
          // state 1 (visiting) = cycle: skip, like the recursive version did
          continue;
        }
        stack.pop();
        state.set(top.key, 2);
        if (!top.key.startsWith(RANGE_NODE)) result.push(top.key);
      }
    }

    return result;
  }

}
