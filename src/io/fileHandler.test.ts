import { describe, it, expect } from 'vite-plus/test';
import { detectFormat, NATIVE_EXTENSION } from './fileHandler';

describe('detectFormat', () => {
  it('detects the native format by its compound extension, including the pre-rename ones', () => {
    expect(NATIVE_EXTENSION).toBe('.masu.json');
    expect(detectFormat('売上.masu.json')).toBe('native');
    expect(detectFormat('売上.tabula.json')).toBe('native');
    expect(detectFormat('OLD.SHEETCRAFT.JSON')).toBe('native');
  });

  it('falls back to plain extensions', () => {
    expect(detectFormat('data.json')).toBe('json');
    expect(detectFormat('a.csv')).toBe('csv');
    expect(detectFormat('b.xlsx')).toBe('xlsx');
    expect(detectFormat('c.txt')).toBeNull();
  });
});
