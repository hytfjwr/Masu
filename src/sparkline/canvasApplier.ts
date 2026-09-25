import type { DrawCommand } from './renderer';

/**
 * Canvas 2D コンテキストに描画コマンドを適用する。
 */
export function applyCommands(ctx: CanvasRenderingContext2D, commands: DrawCommand[]): void {
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'line': {
        if (cmd.points.length < 2) break;
        ctx.beginPath();
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = cmd.lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
        for (let i = 1; i < cmd.points.length; i++) {
          ctx.lineTo(cmd.points[i].x, cmd.points[i].y);
        }
        ctx.stroke();
        break;
      }
      case 'rect': {
        ctx.fillStyle = cmd.color;
        ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.fillStyle = cmd.color;
        ctx.arc(cmd.cx, cmd.cy, cmd.radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
}
