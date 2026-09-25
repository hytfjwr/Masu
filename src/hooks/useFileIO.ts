/**
 * Hook that encapsulates file import/export logic.
 * Extracted from Grid.tsx to keep the component focused on rendering.
 */

import { useCallback } from 'react';
import type {
  CellDataMap,
  NamedRange,
  PivotTableConfig,
  SheetData,
  WorkbookData,
} from '../types/grid';
import {
  importFile,
  downloadFile,
  downloadBlob,
  getDataRange,
  detectFormat,
  NATIVE_EXTENSION,
} from '../io/fileHandler';
import { generateCSV } from '../io/csvGenerator';
import { generateJSON } from '../io/jsonGenerator';
import { serialize, deserialize } from '../io/tabulaSerializer';
import type { SheetSizes } from '../io/tabulaSerializer';
import { cellKey } from '../utils/coordinates';
import { GRID_CONSTANTS } from '../types/grid';
import { resolveFilename } from '../utils/filename';

/** Strip the extension from a file name ("Report.xlsx" -> "Report"). */
function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

interface UseFileIOParams {
  getDataMap: () => CellDataMap;
  replaceAllData: (data: CellDataMap) => void;
  // Grid size management for auto-expand on import
  getColCount?: () => number;
  getRowCount?: () => number;
  setColCount?: (count: number) => void;
  setRowCount?: (count: number) => void;
  // Native (.tabula.json) format
  sheets?: SheetData[];
  activeSheetId?: string;
  replaceWorkbook?: (workbook: WorkbookData) => void;
  getAllSizesBySheet?: () => Map<string, SheetSizes>;
  restoreAllSizes?: (sizes: Map<string, SheetSizes>) => void;
  namedRanges?: NamedRange[];
  pivotTables?: PivotTableConfig[];
  /** Current document title, used to name exported files. */
  title?: string;
}

export interface UseFileIOReturn {
  handleImportFile: (file: File) => Promise<void>;
  handleExportCSV: () => void;
  handleExportJSON: () => void;
  handleExportXLSX: () => void;
  handleSaveTabula: () => void;
  handleOpenTabula: () => void;
}

export function useFileIO({
  getDataMap,
  replaceAllData,
  getColCount,
  getRowCount,
  setColCount,
  setRowCount,
  sheets,
  activeSheetId,
  replaceWorkbook,
  getAllSizesBySheet,
  restoreAllSizes,
  namedRanges,
  pivotTables,
  title,
}: UseFileIOParams): UseFileIOReturn {
  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const format = detectFormat(file.name);

        // Native format
        if (format === 'tabula' && replaceWorkbook && restoreAllSizes) {
          const text = await file.text();
          const result = deserialize(text);
          replaceWorkbook(result.workbook);
          restoreAllSizes(result.sizesBySheet);
          return;
        }

        // Handle xlsx format
        if (format === 'xlsx' && replaceWorkbook && restoreAllSizes) {
          const { importXlsx } = await import('../io/xlsx');
          const result = await importXlsx(await file.arrayBuffer());
          // xlsx files don't carry our own title metadata back out reliably, so use the file name.
          replaceWorkbook({ ...result.workbook, title: stripExtension(file.name) });
          restoreAllSizes(result.sizesBySheet);
          return;
        }

        const data: CellDataMap = await importFile(file);
        replaceAllData(data);

        // Auto-expand grid to fit imported data
        if (data.size > 0 && getColCount && getRowCount && setColCount && setRowCount) {
          const { maxCol, maxRow } = getDataRange(data);
          const neededCols = maxCol + 1 + GRID_CONSTANTS.DEFAULT_COL_COUNT;
          const neededRows = maxRow + 1 + GRID_CONSTANTS.DEFAULT_ROW_COUNT;
          if (neededCols > getColCount()) {
            setColCount(Math.min(neededCols, GRID_CONSTANTS.MAX_COL_COUNT));
          }
          if (neededRows > getRowCount()) {
            setRowCount(Math.min(neededRows, GRID_CONSTANTS.MAX_ROW_COUNT));
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Import failed');
      }
    },
    [
      replaceAllData,
      replaceWorkbook,
      restoreAllSizes,
      getColCount,
      getRowCount,
      setColCount,
      setRowCount,
    ],
  );

  const handleExportCSV = useCallback(() => {
    const data = getDataMap();
    if (data.size === 0) {
      downloadFile(generateCSV([]), `${resolveFilename(title)}.csv`, 'text/csv;charset=utf-8');
      return;
    }

    const { maxCol, maxRow } = getDataRange(data);
    const rows: string[][] = [];

    for (let r = 0; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const key = cellKey(c, r);
        const cell = data.get(key);
        // Export displayValue (computed result for formulas)
        row.push(cell?.displayValue ?? '');
      }
      rows.push(row);
    }

    downloadFile(generateCSV(rows), `${resolveFilename(title)}.csv`, 'text/csv;charset=utf-8');
  }, [getDataMap, title]);

  const handleExportJSON = useCallback(() => {
    const data = getDataMap();
    if (data.size === 0) {
      downloadFile('[]', `${resolveFilename(title)}.json`, 'application/json');
      return;
    }

    const { maxCol, maxRow } = getDataRange(data);
    if (maxRow < 1) {
      // Only headers, no data rows
      downloadFile('[]', `${resolveFilename(title)}.json`, 'application/json');
      return;
    }

    // First row is headers
    const headers: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const key = cellKey(c, 0);
      const cell = data.get(key);
      headers.push(cell?.displayValue ?? `Column${c + 1}`);
    }

    // Data rows
    const dataRows: string[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const key = cellKey(c, r);
        const cell = data.get(key);
        row.push(cell?.displayValue ?? '');
      }
      dataRows.push(row);
    }

    const json = generateJSON(headers, dataRows);
    downloadFile(json, `${resolveFilename(title)}.json`, 'application/json');
  }, [getDataMap, title]);

  const handleExportXLSX = useCallback(() => {
    if (!sheets || !activeSheetId || !getAllSizesBySheet) return;

    (async () => {
      try {
        const { exportXlsx } = await import('../io/xlsx');
        const buffer = await exportXlsx({
          sheets,
          activeSheetId,
          colWidths: new Map(),
          rowHeights: new Map(),
          sizesBySheet: getAllSizesBySheet(),
          namedRanges,
          title,
        });
        downloadBlob(
          buffer,
          `${resolveFilename(title)}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Export failed');
      }
    })();
  }, [sheets, activeSheetId, getAllSizesBySheet, namedRanges, title]);

  const handleSaveTabula = useCallback(() => {
    if (!sheets || !activeSheetId || !getAllSizesBySheet) return;

    const json = serialize({
      sheets,
      activeSheetId,
      colWidths: new Map(),
      rowHeights: new Map(),
      sizesBySheet: getAllSizesBySheet(),
      namedRanges,
      pivotTables,
      title,
    });

    downloadFile(json, `${resolveFilename(title)}${NATIVE_EXTENSION}`, 'application/json');
  }, [sheets, activeSheetId, getAllSizesBySheet, namedRanges, pivotTables, title]);

  const handleOpenTabula = useCallback(() => {
    // Create a hidden file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const format = detectFormat(file.name);
        if (format === 'tabula' && replaceWorkbook && restoreAllSizes) {
          const text = await file.text();
          const result = deserialize(text);
          replaceWorkbook(result.workbook);
          restoreAllSizes(result.sizesBySheet);
        } else {
          alert(`Tabula 形式のファイルを選択してください (${NATIVE_EXTENSION})`);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました');
      }
    };
    input.click();
  }, [replaceWorkbook, restoreAllSizes]);

  return {
    handleImportFile,
    handleExportCSV,
    handleExportJSON,
    handleExportXLSX,
    handleSaveTabula,
    handleOpenTabula,
  };
}
