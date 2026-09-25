/**
 * Pivot table engine — pure functions for building pivot table data.
 * No React, no DOM. Fully testable under vitest environment: 'node'.
 */

import type { AggregationType, PivotValueField } from '../types/pivot';

/** Pivot computation config (subset of PivotTableConfig relevant to the engine) */
export interface PivotComputeConfig {
  rowFields: number[];
  colFields: number[];
  valueFields: PivotValueField[];
  filterFields: number[];
  filterValues?: Record<number, string[]>;
  collapsedRows?: Record<string, boolean>;
}

/** A single cell in the pivot output */
export interface PivotCell {
  value: string | number;
  isHeader?: boolean;
  isTotal?: boolean;
}

/**
 * Extract field names from the first row of source data.
 */
export function extractFieldNames(sourceData: string[][]): string[] {
  if (sourceData.length === 0) return [];
  return sourceData[0].map((v) => v.trim());
}

/**
 * Aggregate an array of numeric values using the specified method.
 */
export function aggregate(values: number[], type: AggregationType): number {
  if (values.length === 0) {
    return type === 'count' ? 0 : 0;
  }

  switch (type) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'count':
      return values.length;
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
  }
}

/**
 * Build a pivot table from source data and config.
 * Returns a 2D array of PivotCell objects ready to write to a sheet.
 *
 * sourceData: 2D array where the first row is headers.
 */
export function buildPivotTable(sourceData: string[][], config: PivotComputeConfig): PivotCell[][] {
  if (sourceData.length < 2) {
    return [[{ value: '(データなし)', isHeader: true }]];
  }

  const headers = sourceData[0];
  // Data rows (excluding header)
  let dataRows = sourceData.slice(1);

  // Apply filters
  if (config.filterFields.length > 0 && config.filterValues) {
    dataRows = dataRows.filter((row) => {
      for (const fi of config.filterFields) {
        const allowed = config.filterValues?.[fi];
        if (allowed && allowed.length > 0) {
          const cellVal = row[fi] ?? '';
          if (!allowed.includes(cellVal)) return false;
        }
      }
      return true;
    });
  }

  // If no value fields specified, return empty
  if (config.valueFields.length === 0) {
    return [[{ value: '(値フィールドなし)', isHeader: true }]];
  }

  // Collect unique values for row/col fields
  const rowLabels = getUniqueLabels(dataRows, config.rowFields);
  const colLabels = getUniqueLabels(dataRows, config.colFields);

  // Build the output grid
  const result: PivotCell[][] = [];

  // --- Header rows ---
  if (config.colFields.length > 0) {
    // Column header row(s)
    for (let ci = 0; ci < config.colFields.length; ci++) {
      const row: PivotCell[] = [];
      // Row field header placeholders
      for (const rf of config.rowFields) {
        row.push({ value: ci === 0 ? (headers[rf] ?? '') : '', isHeader: true });
      }
      // Column labels
      for (const colKey of colLabels) {
        const colParts = colKey.split('\0');
        const label = colParts[ci] ?? '';
        // Repeat for each value field
        for (let vi = 0; vi < config.valueFields.length; vi++) {
          if (config.valueFields.length > 1 && ci === config.colFields.length - 1) {
            row.push({ value: `${label} - ${config.valueFields[vi].fieldName}`, isHeader: true });
          } else {
            if (vi === 0) {
              row.push({ value: label, isHeader: true });
            } else {
              row.push({ value: '', isHeader: true });
            }
          }
        }
      }
      // Total column header
      for (const vf of config.valueFields) {
        row.push({ value: ci === 0 ? `合計 ${vf.fieldName}` : '', isHeader: true, isTotal: true });
      }
      result.push(row);
    }
  } else {
    // No column fields — just row field headers + value field headers
    const headerRow: PivotCell[] = [];
    for (const rf of config.rowFields) {
      headerRow.push({ value: headers[rf] ?? '', isHeader: true });
    }
    for (const vf of config.valueFields) {
      headerRow.push({ value: getAggLabel(vf), isHeader: true });
    }
    result.push(headerRow);
  }

  // --- Data rows ---
  if (config.rowFields.length > 0) {
    for (const rowKey of rowLabels) {
      const rowParts = rowKey.split('\0');

      // Check collapsed state
      if (config.collapsedRows) {
        let skip = false;
        // If a parent row is collapsed, skip children
        for (let depth = 0; depth < rowParts.length - 1; depth++) {
          const parentKey = rowParts.slice(0, depth + 1).join('\0');
          if (config.collapsedRows[parentKey]) {
            skip = true;
            break;
          }
        }
        if (skip) continue;
      }

      const row: PivotCell[] = [];

      // Row labels
      for (let ri = 0; ri < config.rowFields.length; ri++) {
        row.push({ value: rowParts[ri] ?? '' });
      }

      // Filter data rows matching this row key
      const matchingRows = dataRows.filter((dr) => {
        return config.rowFields.every((fi, idx) => (dr[fi] ?? '') === rowParts[idx]);
      });

      if (config.colFields.length > 0) {
        // Cross-tabulation cells
        for (const colKey of colLabels) {
          const colParts = colKey.split('\0');
          const cellRows = matchingRows.filter((dr) => {
            return config.colFields.every((fi, idx) => (dr[fi] ?? '') === colParts[idx]);
          });
          for (const vf of config.valueFields) {
            const values = cellRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
            row.push({ value: aggregate(values, vf.aggregation) });
          }
        }
        // Row total
        for (const vf of config.valueFields) {
          const values = matchingRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
          row.push({ value: aggregate(values, vf.aggregation), isTotal: true });
        }
      } else {
        // No column fields — just values
        for (const vf of config.valueFields) {
          const values = matchingRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
          row.push({ value: aggregate(values, vf.aggregation) });
        }
      }

      result.push(row);
    }
  } else {
    // No row fields — just one data row (grand total)
    const row: PivotCell[] = [];
    if (config.colFields.length > 0) {
      for (const colKey of colLabels) {
        const colParts = colKey.split('\0');
        const cellRows = dataRows.filter((dr) => {
          return config.colFields.every((fi, idx) => (dr[fi] ?? '') === colParts[idx]);
        });
        for (const vf of config.valueFields) {
          const values = cellRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
          row.push({ value: aggregate(values, vf.aggregation) });
        }
      }
    }
    for (const vf of config.valueFields) {
      const values = dataRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
      row.push({ value: aggregate(values, vf.aggregation), isTotal: true });
    }
    result.push(row);
  }

  // --- Grand total row ---
  if (config.rowFields.length > 0) {
    const totalRow: PivotCell[] = [];
    totalRow.push({ value: '総計', isHeader: true, isTotal: true });
    for (let i = 1; i < config.rowFields.length; i++) {
      totalRow.push({ value: '', isTotal: true });
    }

    if (config.colFields.length > 0) {
      for (const colKey of colLabels) {
        const colParts = colKey.split('\0');
        const cellRows = dataRows.filter((dr) => {
          return config.colFields.every((fi, idx) => (dr[fi] ?? '') === colParts[idx]);
        });
        for (const vf of config.valueFields) {
          const values = cellRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
          totalRow.push({ value: aggregate(values, vf.aggregation), isTotal: true });
        }
      }
    }

    // Grand total
    for (const vf of config.valueFields) {
      const values = dataRows.map((dr) => parseFloat(dr[vf.fieldIndex] ?? '') || 0);
      totalRow.push({ value: aggregate(values, vf.aggregation), isTotal: true });
    }
    result.push(totalRow);
  }

  return result;
}

/**
 * Get unique composite labels for a set of field indices.
 * Returns an array of '\0'-separated composite keys, sorted.
 */
function getUniqueLabels(dataRows: string[][], fieldIndices: number[]): string[] {
  if (fieldIndices.length === 0) return [];
  const labelSet = new Set<string>();
  for (const row of dataRows) {
    const key = fieldIndices.map((fi) => row[fi] ?? '').join('\0');
    labelSet.add(key);
  }
  return Array.from(labelSet).sort();
}

/**
 * Build an aggregation label for display.
 */
function getAggLabel(vf: PivotValueField): string {
  const aggNames: Record<AggregationType, string> = {
    sum: '合計',
    count: '個数',
    average: '平均',
    max: '最大',
    min: '最小',
  };
  return `${aggNames[vf.aggregation]} / ${vf.fieldName}`;
}
