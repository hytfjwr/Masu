/**
 * JSON generator for array-of-objects format.
 * Converts header row + data rows into a JSON string.
 */

/**
 * Generate JSON (array-of-objects) from headers and data rows.
 * Numbers are output as number type, not string.
 * The first row of `rows` is used as headers.
 */
export function generateJSON(headers: string[], dataRows: string[][]): string {
  const result: Record<string, unknown>[] = dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      const value = i < row.length ? row[i] : '';

      if (value === '') {
        obj[key] = '';
      } else {
        // Try to parse as number
        const num = Number(value);
        if (value !== '' && !isNaN(num) && isFinite(num)) {
          obj[key] = num;
        } else if (value === 'true') {
          obj[key] = true;
        } else if (value === 'false') {
          obj[key] = false;
        } else if (value === 'null') {
          obj[key] = null;
        } else {
          obj[key] = value;
        }
      }
    }
    return obj;
  });

  return JSON.stringify(result, null, 2);
}
