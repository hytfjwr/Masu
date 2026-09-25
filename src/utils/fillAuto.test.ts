import { describe, it, expect } from 'vitest';
import { detectFillPattern, generateFillValues } from './fillAuto';

describe('fillAuto', () => {
  describe('detectFillPattern + generateFillValues', () => {
    it('single number copies the value', () => {
      const pattern = detectFillPattern(['5']);
      const values = generateFillValues(pattern, 3);
      expect(values).toEqual(['5', '5', '5']);
    });

    it('arithmetic sequence with 2 values', () => {
      const pattern = detectFillPattern(['1', '3']);
      expect(pattern.type).toBe('arithmetic');
      const values = generateFillValues(pattern, 3);
      expect(values).toEqual(['5', '7', '9']);
    });

    it('arithmetic sequence with 3 values', () => {
      const pattern = detectFillPattern(['10', '20', '30']);
      expect(pattern.type).toBe('arithmetic');
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['40', '50']);
    });

    it('single string copies the value', () => {
      const pattern = detectFillPattern(['Hello']);
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['Hello', 'Hello']);
    });

    it('string pattern cycles', () => {
      const pattern = detectFillPattern(['A', 'B', 'C']);
      expect(pattern.type).toBe('stringCycle');
      const values = generateFillValues(pattern, 4);
      expect(values).toEqual(['A', 'B', 'C', 'A']);
    });

    it('trailing number pattern', () => {
      const pattern = detectFillPattern(['Item1', 'Item2']);
      expect(pattern.type).toBe('trailingNumber');
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['Item3', 'Item4']);
    });

    it('date slash format', () => {
      const pattern = detectFillPattern(['2026/04/10', '2026/04/11']);
      expect(pattern.type).toBe('date');
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['2026/04/12', '2026/04/13']);
    });

    it('date dash format single value', () => {
      const pattern = detectFillPattern(['2026-04-10']);
      expect(pattern.type).toBe('date');
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['2026-04-11', '2026-04-12']);
    });

    it('empty array returns empty', () => {
      const pattern = detectFillPattern([]);
      const values = generateFillValues(pattern, 5);
      expect(values).toEqual([]);
    });

    it('count 0 returns empty', () => {
      const pattern = detectFillPattern(['1', '2']);
      const values = generateFillValues(pattern, 0);
      expect(values).toEqual([]);
    });

    it('negative diff in arithmetic', () => {
      const pattern = detectFillPattern(['10', '7']);
      expect(pattern.type).toBe('arithmetic');
      const values = generateFillValues(pattern, 2);
      expect(values).toEqual(['4', '1']);
    });

    it('date crossing month boundary', () => {
      const pattern = detectFillPattern(['2026/01/30', '2026/01/31']);
      expect(pattern.type).toBe('date');
      const values = generateFillValues(pattern, 1);
      expect(values).toEqual(['2026/02/01']);
    });
  });
});
