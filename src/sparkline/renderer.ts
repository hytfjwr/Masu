import type { SparklineType, SparklineColors } from '../types/sparkline';

/** 線分描画コマンド */
export interface LineCommand {
  type: 'line';
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
}

/** 矩形描画コマンド */
export interface RectCommand {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** 円描画コマンド */
export interface CircleCommand {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
  color: string;
}

export type DrawCommand = LineCommand | RectCommand | CircleCommand;

const PADDING = 2;

/**
 * スパークラインの描画コマンドを生成する純粋関数。
 * Canvas/DOM に依存せず、座標と色のみを計算する。
 */
export function computeSparklineCommands(
  type: SparklineType,
  values: number[],
  width: number,
  height: number,
  colors: SparklineColors,
  groupScale?: { min: number; max: number },
): DrawCommand[] {
  if (values.length === 0) return [];

  switch (type) {
    case 'line':
      return computeLineCommands(values, width, height, colors, groupScale);
    case 'bar':
      return computeBarCommands(values, width, height, colors, groupScale);
    case 'winloss':
      return computeWinLossCommands(values, width, height, colors);
  }
}

function computeLineCommands(
  values: number[],
  width: number,
  height: number,
  colors: SparklineColors,
  groupScale?: { min: number; max: number },
): DrawCommand[] {
  const commands: DrawCommand[] = [];
  const drawWidth = width - PADDING * 2;
  const drawHeight = height - PADDING * 2;

  const dataMin = groupScale ? groupScale.min : Math.min(...values);
  const dataMax = groupScale ? groupScale.max : Math.max(...values);
  const range = dataMax - dataMin;

  // Map value to Y coordinate (inverted: max at top, min at bottom)
  const mapY = (v: number): number => {
    if (range === 0) return PADDING + drawHeight / 2;
    return PADDING + drawHeight - ((v - dataMin) / range) * drawHeight;
  };

  // Map index to X coordinate
  const mapX = (i: number): number => {
    if (values.length === 1) return PADDING + drawWidth / 2;
    return PADDING + (i / (values.length - 1)) * drawWidth;
  };

  // Single value: draw a point
  if (values.length === 1) {
    commands.push({
      type: 'circle',
      cx: mapX(0),
      cy: mapY(values[0]),
      radius: 2,
      color: colors.primary,
    });
    return commands;
  }

  // Line
  const points = values.map((v, i) => ({ x: mapX(i), y: mapY(v) }));
  commands.push({
    type: 'line',
    points,
    color: colors.primary,
    lineWidth: 1.5,
  });

  // High/low markers
  if (colors.highPoint || colors.lowPoint) {
    let maxIdx = 0;
    let minIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxIdx]) maxIdx = i;
      if (values[i] < values[minIdx]) minIdx = i;
    }

    if (colors.highPoint) {
      commands.push({
        type: 'circle',
        cx: points[maxIdx].x,
        cy: points[maxIdx].y,
        radius: 2.5,
        color: colors.highPoint,
      });
    }
    if (colors.lowPoint) {
      commands.push({
        type: 'circle',
        cx: points[minIdx].x,
        cy: points[minIdx].y,
        radius: 2.5,
        color: colors.lowPoint,
      });
    }
  }

  return commands;
}

function computeBarCommands(
  values: number[],
  width: number,
  height: number,
  colors: SparklineColors,
  groupScale?: { min: number; max: number },
): DrawCommand[] {
  const commands: DrawCommand[] = [];
  const drawWidth = width - PADDING * 2;
  const drawHeight = height - PADDING * 2;
  const gap = 1;
  const barWidth = Math.max(1, (drawWidth - gap * (values.length - 1)) / values.length);

  const dataMin = groupScale ? groupScale.min : Math.min(...values, 0);
  const dataMax = groupScale ? groupScale.max : Math.max(...values, 0);
  const range = dataMax - dataMin;

  // Zero line position
  const zeroY =
    range === 0
      ? PADDING + drawHeight
      : PADDING + drawHeight - ((0 - dataMin) / range) * drawHeight;

  for (let i = 0; i < values.length; i++) {
    const x = PADDING + i * (barWidth + gap);
    const v = values[i];
    const isNegative = v < 0;
    const color = isNegative && colors.negative ? colors.negative : colors.primary;

    let barY: number;
    let barHeight: number;

    if (range === 0) {
      // All zeros: draw thin line at bottom
      barY = zeroY - 1;
      barHeight = 1;
    } else {
      const valueY = PADDING + drawHeight - ((v - dataMin) / range) * drawHeight;
      if (isNegative) {
        barY = zeroY;
        barHeight = Math.max(1, valueY - zeroY);
      } else {
        barY = valueY;
        barHeight = Math.max(1, zeroY - valueY);
      }
    }

    commands.push({
      type: 'rect',
      x,
      y: barY,
      width: barWidth,
      height: barHeight,
      color,
    });
  }

  return commands;
}

function computeWinLossCommands(
  values: number[],
  width: number,
  height: number,
  colors: SparklineColors,
): DrawCommand[] {
  const commands: DrawCommand[] = [];
  const drawWidth = width - PADDING * 2;
  const drawHeight = height - PADDING * 2;
  const gap = 1;
  const barWidth = Math.max(1, (drawWidth - gap * (values.length - 1)) / values.length);
  const halfHeight = drawHeight / 2;
  const midY = PADDING + halfHeight;

  for (let i = 0; i < values.length; i++) {
    const x = PADDING + i * (barWidth + gap);
    const v = values[i];

    if (v === 0) {
      // Zero: thin line at midpoint
      commands.push({
        type: 'rect',
        x,
        y: midY - 1,
        width: barWidth,
        height: 2,
        color: colors.primary,
      });
    } else if (v > 0) {
      // Win: upper half
      commands.push({
        type: 'rect',
        x,
        y: PADDING + 1,
        width: barWidth,
        height: halfHeight - 2,
        color: colors.primary,
      });
    } else {
      // Loss: lower half
      commands.push({
        type: 'rect',
        x,
        y: midY + 1,
        width: barWidth,
        height: halfHeight - 2,
        color: colors.negative ?? colors.primary,
      });
    }
  }

  return commands;
}
