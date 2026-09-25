/**
 * Helpers for turning the document title into a safe download file name.
 */

/** Placeholder shown/used when the workbook has no title set (Google Sheets style). */
export const UNTITLED_SPREADSHEET_NAME = '無題のスプレッドシート';

/** Characters that are invalid in file names on common platforms. */
const INVALID_FILENAME_CHARS_RE = /[\\/:*?"<>|]/g;

/** Replace characters that are invalid in file names with '_'. */
export function sanitizeFilename(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS_RE, '_');
}

/** Resolve the base file name (without extension) from the document title, falling back to the untitled placeholder. */
export function resolveFilename(title: string | undefined): string {
  const trimmed = title?.trim() ?? '';
  return sanitizeFilename(trimmed || UNTITLED_SPREADSHEET_NAME);
}
