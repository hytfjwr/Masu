import { describe, it, expect } from 'vitest';
import {
  getCategorizedFunctions,
  getCategoryForFunction,
  getAllFunctionNames,
} from './functionCategories';
import { getAllFunctionMetas } from '../engine/functions/index';

describe('getCategorizedFunctions', () => {
  it('returns all categories', () => {
    const categories = getCategorizedFunctions();
    const ids = categories.map((c) => c.id);
    expect(ids).toContain('math');
    expect(ids).toContain('stat');
    expect(ids).toContain('logic');
    expect(ids).toContain('text');
    expect(ids).toContain('lookup');
    expect(ids).toContain('date');
    expect(ids).toContain('array');
    expect(ids).toContain('link');
  });

  it('each category has at least one function', () => {
    const categories = getCategorizedFunctions();
    for (const cat of categories) {
      expect(cat.functions.length).toBeGreaterThan(0);
    }
  });

  it('categories have Japanese labels', () => {
    const categories = getCategorizedFunctions();
    for (const cat of categories) {
      expect(cat.label.length).toBeGreaterThan(0);
    }
  });
});

describe('getCategoryForFunction', () => {
  it('returns correct category for SUM', () => {
    expect(getCategoryForFunction('SUM')).toBe('数学');
  });

  it('returns correct category for IF', () => {
    expect(getCategoryForFunction('IF')).toBe('論理');
  });

  it('returns correct category for VLOOKUP', () => {
    expect(getCategoryForFunction('VLOOKUP')).toBe('検索');
  });

  it('returns correct category for AVERAGE (statistics)', () => {
    expect(getCategoryForFunction('AVERAGE')).toBe('統計');
  });

  it('returns undefined for unknown function', () => {
    expect(getCategoryForFunction('NONEXISTENT')).toBeUndefined();
  });

  it('is case insensitive', () => {
    expect(getCategoryForFunction('sum')).toBe('数学');
  });
});

describe('getAllFunctionNames', () => {
  it('covers all registered functions', () => {
    const allMetas = getAllFunctionMetas();
    const allNames = getAllFunctionNames();

    for (const meta of allMetas) {
      expect(allNames).toContain(meta.name);
    }
  });
});
