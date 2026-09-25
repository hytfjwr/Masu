import type { GlobalRangeDep } from '../../engine/dependency';
import type { SaveStatus } from '../../hooks/useAutosave';
import type { HistoryTimelineEntry, WorkbookSnapshot } from '../../hooks/useUndoRedo';
import type { CellData, CellPosition, SheetData } from '../../types/grid';

export interface CellRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

/** Everything the developer tools read from / do to the spreadsheet (provided by Grid). */
export interface DevToolsHost {
  /** Bumps on every workbook change. */
  version: number;
  sheets: SheetData[];
  activeSheetId: string;
  activeCell: CellPosition;
  isEditing: boolean;
  editValue: string;
  /** A cell of any sheet by its local key ("A1"). */
  getCell: (sheetId: string, key: string) => CellData | undefined;
  /** Select a range on the active sheet. */
  selectRange: (range: CellRange) => void;
  /** Switch to `sheetId` if needed and select the cell. */
  goToCell: (sheetId: string, col: number, row: number) => void;
  getDependencyInfo: (
    sheetId: string,
    key: string,
  ) => {
    precedents: string[];
    rangePrecedents: GlobalRangeDep[];
    dependents: string[];
  };
  historyTimeline: HistoryTimelineEntry[];
  jumpToHistory: (index: number) => void;
  getHistorySnapshot: (index: number) => WorkbookSnapshot | undefined;
  /** Recalculation-time heatmap over the grid (Profiler tab). */
  heatmap: boolean;
  setHeatmap: (on: boolean) => void;
  autosave: {
    status: SaveStatus;
    lastSavedAt: number | null;
    /** The workbook exactly as autosave would store it right now. */
    serialize: () => string;
  };
}
