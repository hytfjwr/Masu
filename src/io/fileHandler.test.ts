import { describe, it, expect } from 'vitest';
import { detectFormat, NATIVE_EXTENSION } from './fileHandler';

describe('detectFormat', () => {
  it('detects the native format by its compound extension, including the pre-rename one', () => {
    expect(NATIVE_EXTENSION).toBe('.tabula.json');
    expect(detectFormat('売上.tabula.json')).toBe('tabula');
    expect(detectFormat('OLD.SHEETCRAFT.JSON')).toBe('tabula');
  });

  it('falls back to plain extensions', () => {
    expect(detectFormat('data.json')).toBe('json');
    expect(detectFormat('a.csv')).toBe('csv');
    expect(detectFormat('b.xlsx')).toBe('xlsx');
    expect(detectFormat('c.txt')).toBeNull();
  });
});
