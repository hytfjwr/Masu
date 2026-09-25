/**
 * JSON parser for array-of-objects format.
 * Converts JSON to header row + data rows (2D string array).
 */

export interface ParsedJSON {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a JSON string (array-of-objects format) into headers + rows.
 * Throws an error for invalid format.
 */
export function parseJSON(input: string): ParsedJSON {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Invalid JSON: parsing failed');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid JSON: expected an array of objects');
  }

  if (parsed.length === 0) {
    return { headers: [], rows: [] };
  }

  // Validate that elements are objects
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Invalid JSON: expected an array of objects');
    }
  }

  // Collect all unique keys (union of all objects)
  const headerSet = new Set<string>();
  for (const item of parsed) {
    for (const key of Object.keys(item as Record<string, unknown>)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  // Build rows
  const rows: string[][] = parsed.map((item) => {
    const obj = item as Record<string, unknown>;
    return headers.map((key) => {
      const value = obj[key];
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      // Nested objects/arrays -> JSON.stringify
      return JSON.stringify(value);
    });
  });

  return { headers, rows };
}
