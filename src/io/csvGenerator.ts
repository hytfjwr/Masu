/**
 * CSV generator that produces RFC 4180 compliant output with UTF-8 BOM.
 */

const BOM = '\uFEFF';

/**
 * Escape a single CSV field value.
 * Wraps in double quotes if the value contains commas, double quotes, or newlines.
 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from a 2D array of strings.
 * Output is UTF-8 with BOM prefix for Excel compatibility.
 */
export function generateCSV(rows: string[][]): string {
  const lines = rows.map((row) => row.map(escapeField).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
