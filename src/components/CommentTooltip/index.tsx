import { memo } from 'react';

interface CommentTooltipProps {
  comment: string;
  x: number;  // clientX position
  y: number;  // clientY position
}

export const CommentTooltip = memo(function CommentTooltip({ comment, x, y }: CommentTooltipProps) {
  return (
    <div
      className="fixed z-50 max-w-xs px-2 py-1.5 text-xs glass-surface text-text-primary rounded-lg pointer-events-none animate-float-up"
      style={{
        left: x + 12,
        top: y + 12,
      }}
    >
      {comment}
    </div>
  );
});
