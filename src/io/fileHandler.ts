/**
 * File handling utilities: reading files, downloading files, extension detection.
 */

import { decodeBuffer } from './encoding';
import { parseCSV } from './csvParser';
import { parseJSON } from './jsonParser';
import type { CellDataMap } from '../types/grid';
import { cellKey, parseCellKey } from '../utils/coordinates';

export type FileFormat = 'csv' | 'json' | 'native' | 'xlsx';

/** Native file extension (the same format was saved as .tabula.json and, before that, .sheetcraft.json). */
export const NATIVE_EXTENSION = '.masu.json';
const LEGACY_NATIVE_EXTENSIONS = ['.tabula.json', '.sheetcraft.json'];

/**
 * Detect file format from filename extension.
 * The native compound extensions are checked first to avoid being caught by .json.
 */
export function detectFormat(filename: string): FileFormat | null {
  const lower = filename.toLowerCase();
  if ([NATIVE_EXTENSION, ...LEGACY_NATIVE_EXTENSIONS].some((e) => lower.endsWith(e)))
    return 'native';
  const ext = lower.split('.').pop();
  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'xlsx') return 'xlsx';
  return null;
}

/**
 * Read a File object and return raw ArrayBuffer.
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Import a file (CSV or JSON) and return a CellDataMap.
 */
export async function importFile(file: File): Promise<CellDataMap> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error(`Unsupported file format: ${file.name}`);
  }

  const buffer = await readFileAsArrayBuffer(file);
  const text = decodeBuffer(buffer);

  let rows: string[][];

  if (format === 'csv') {
    rows = parseCSV(text);
  } else {
    const { headers, rows: dataRows } = parseJSON(text);
    if (headers.length === 0) {
      return new Map();
    }
    rows = [headers, ...dataRows];
  }

  // Convert 2D array to CellDataMap
  const data: CellDataMap = new Map();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const value = rows[r][c];
      if (value !== '') {
        const key = cellKey(c, r);
        data.set(key, {
          rawValue: value,
          displayValue: value,
        });
      }
    }
  }

  return data;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a binary file download in the browser.
 */
export function downloadBlob(data: ArrayBuffer | Blob, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get the data range (min/max row/col with data) from a CellDataMap.
 */
export function getDataRange(data: CellDataMap): {
  maxCol: number;
  maxRow: number;
} {
  let maxCol = 0;
  let maxRow = 0;

  for (const key of data.keys()) {
    const { col, row } = parseCellKey(key);
    if (col > maxCol) maxCol = col;
    if (row > maxRow) maxRow = row;
  }

  return { maxCol, maxRow };
}
