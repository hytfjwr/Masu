import { describe, it, expect } from 'vitest';
import { computeSparklineCommands } from './renderer';
import type { DrawCommand, LineCommand, RectCommand, CircleCommand } from './renderer';
import type { SparklineColors } from '../types/sparkline';

const defaultColors: SparklineColors = {
  primary: '#3B82F6',
};

function filterLines(cmds: DrawCommand[]): LineCommand[] {
  return cmds.filter((c): c is LineCommand => c.type === 'line');
}

function filterRects(cmds: DrawCommand[]): RectCommand[] {
  return cmds.filter((c): c is RectCommand => c.type === 'rect');
}

function filterCircles(cmds: DrawCommand[]): CircleCommand[] {
  return cmds.filter((c): c is CircleCommand => c.type === 'circle');
}

describe('computeSparklineCommands', () => {
  describe('empty data', () => {
    it('returns empty commands for empty values', () => {
      const cmds = computeSparklineCommands('line', [], 100, 24, defaultColors);
      expect(cmds).toEqual([]);
    });

    it('returns empty commands for bar type with empty values', () => {
      const cmds = computeSparklineCommands('bar', [], 100, 24, defaultColors);
      expect(cmds).toEqual([]);
    });

    it('returns empty commands for winloss type with empty values', () => {
      const cmds = computeSparklineCommands('winloss', [], 100, 24, defaultColors);
      expect(cmds).toEqual([]);
    });
  });

  describe('line type', () => {
    it('generates LineCommand with correct number of points', () => {
      const values = [1, 3, 2, 5, 4];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      expect(lines).toHaveLength(1);
      expect(lines[0].points).toHaveLength(5);
    });

    it('coordinates stay within width/height bounds', () => {
      const values = [10, 20, 5, 30, 15];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      for (const pt of lines[0].points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(100);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(24);
      }
    });

    it('maps min value to near bottom and max value to near top', () => {
      const values = [0, 100];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      const pts = lines[0].points;
      // min (0) should be near bottom (larger y)
      expect(pts[0].y).toBeGreaterThan(pts[1].y);
      // max (100) should be near top (smaller y)
      expect(pts[1].y).toBeLessThan(pts[0].y);
    });

    it('generates high/low markers when colors specified', () => {
      const colors: SparklineColors = {
        primary: '#3B82F6',
        highPoint: '#FF0000',
        lowPoint: '#00FF00',
      };
      const values = [5, 10, 3, 8];
      const cmds = computeSparklineCommands('line', values, 100, 24, colors);
      const circles = filterCircles(cmds);
      expect(circles).toHaveLength(2);
      // High point marker (value 10, index 1)
      const highMarker = circles.find((c) => c.color === '#FF0000');
      expect(highMarker).toBeDefined();
      // Low point marker (value 3, index 2)
      const lowMarker = circles.find((c) => c.color === '#00FF00');
      expect(lowMarker).toBeDefined();
    });

    it('does not generate markers when colors not specified', () => {
      const values = [5, 10, 3, 8];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const circles = filterCircles(cmds);
      expect(circles).toHaveLength(0);
    });

    it('single value produces a circle command (point)', () => {
      const cmds = computeSparklineCommands('line', [42], 100, 24, defaultColors);
      const circles = filterCircles(cmds);
      expect(circles).toHaveLength(1);
      expect(circles[0].color).toBe(defaultColors.primary);
    });

    it('all same values produce a horizontal line', () => {
      const values = [5, 5, 5, 5];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      expect(lines).toHaveLength(1);
      // All y-coordinates should be the same (middle of chart)
      const ys = lines[0].points.map((p) => p.y);
      const uniqueYs = [...new Set(ys)];
      expect(uniqueYs).toHaveLength(1);
    });
  });

  describe('bar type', () => {
    it('generates one RectCommand per data point', () => {
      const values = [1, 2, 3, 4, 5];
      const cmds = computeSparklineCommands('bar', values, 100, 24, defaultColors);
      const rects = filterRects(cmds);
      expect(rects).toHaveLength(5);
    });

    it('applies negative color for negative values', () => {
      const colors: SparklineColors = {
        primary: '#3B82F6',
        negative: '#EF4444',
      };
      const values = [5, -3, 8, -1];
      const cmds = computeSparklineCommands('bar', values, 100, 24, colors);
      const rects = filterRects(cmds);
      expect(rects[0].color).toBe('#3B82F6');
      expect(rects[1].color).toBe('#EF4444');
      expect(rects[2].color).toBe('#3B82F6');
      expect(rects[3].color).toBe('#EF4444');
    });

    it('bar widths are equal', () => {
      const values = [1, 2, 3];
      const cmds = computeSparklineCommands('bar', values, 100, 24, defaultColors);
      const rects = filterRects(cmds);
      const widths = rects.map((r) => r.width);
      expect(new Set(widths).size).toBe(1);
    });

    it('single value produces one bar', () => {
      const cmds = computeSparklineCommands('bar', [42], 100, 24, defaultColors);
      const rects = filterRects(cmds);
      expect(rects).toHaveLength(1);
    });
  });

  describe('winloss type', () => {
    it('positive values are in upper half, negative in lower half', () => {
      const values = [1, -1];
      const cmds = computeSparklineCommands('winloss', values, 100, 24, defaultColors);
      const rects = filterRects(cmds);
      expect(rects).toHaveLength(2);
      // First rect (positive) should be in upper half
      const midY = 2 + (24 - 2 * 2) / 2; // PADDING + halfHeight
      expect(rects[0].y).toBeLessThan(midY);
      // Second rect (negative) should be in lower half
      expect(rects[1].y).toBeGreaterThan(midY);
    });

    it('zero value produces thin line at midpoint', () => {
      const values = [0];
      const cmds = computeSparklineCommands('winloss', values, 100, 24, defaultColors);
      const rects = filterRects(cmds);
      expect(rects).toHaveLength(1);
      expect(rects[0].height).toBe(2);
    });

    it('uses negative color for negative values', () => {
      const colors: SparklineColors = {
        primary: '#3B82F6',
        negative: '#EF4444',
      };
      const values = [1, -1, 0];
      const cmds = computeSparklineCommands('winloss', values, 100, 24, colors);
      const rects = filterRects(cmds);
      expect(rects[0].color).toBe('#3B82F6'); // positive
      expect(rects[1].color).toBe('#EF4444'); // negative
      expect(rects[2].color).toBe('#3B82F6'); // zero
    });
  });

  describe('groupScale', () => {
    it('uses groupScale min/max for line type instead of data min/max', () => {
      const values = [5, 10];
      const groupScale = { min: 0, max: 20 };
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors, groupScale);
      const lines = filterLines(cmds);
      const pts = lines[0].points;
      // With groupScale 0-20, value 10 should be at midpoint, not at top
      // Without groupScale, value 10 would be at top
      // With groupScale, the Y for 10 should be roughly in the middle
      const midY = (pts[0].y + pts[1].y) / 2;
      expect(midY).toBeGreaterThan(2); // Not at very top
      expect(midY).toBeLessThan(22); // Not at very bottom
    });

    it('uses groupScale for bar type', () => {
      const values = [5];
      const groupScale = { min: 0, max: 100 };
      const cmdsWithGroup = computeSparklineCommands(
        'bar',
        values,
        100,
        24,
        defaultColors,
        groupScale,
      );
      const cmdsWithout = computeSparklineCommands('bar', values, 100, 24, defaultColors);
      const rectWith = filterRects(cmdsWithGroup)[0];
      const rectWithout = filterRects(cmdsWithout)[0];
      // With groupScale 0-100, bar for value 5 should be much shorter than without (0-5)
      expect(rectWith.height).toBeLessThan(rectWithout.height);
    });
  });

  describe('edge cases', () => {
    it('handles very large values without overflow', () => {
      const values = [1e10, -1e10, 5e9];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      for (const pt of lines[0].points) {
        expect(isFinite(pt.x)).toBe(true);
        expect(isFinite(pt.y)).toBe(true);
      }
    });

    it('handles very small differences in values', () => {
      const values = [1.0000001, 1.0000002, 1.0000003];
      const cmds = computeSparklineCommands('line', values, 100, 24, defaultColors);
      const lines = filterLines(cmds);
      expect(lines).toHaveLength(1);
      expect(lines[0].points).toHaveLength(3);
    });
  });

  describe('SparklineConfig type coverage', () => {
    it('supports all three types', () => {
      for (const type of ['line', 'bar', 'winloss'] as const) {
        const cmds = computeSparklineCommands(type, [1, 2, 3], 100, 24, defaultColors);
        expect(cmds.length).toBeGreaterThan(0);
      }
    });
  });
});
