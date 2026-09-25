import { memo, useEffect } from 'react';
import type { ToastItem } from './useToast';

const AUTO_DISMISS_MS = 4000;

interface ToastContainerProps {
  toasts: ToastItem[];
  /** Optional: omit to auto-dismiss only (no manual dismiss handling needed by the caller). */
  onDismiss?: (id: number) => void;
}

export const ToastContainer = memo(function ToastContainer({
  toasts,
  onDismiss = () => {},
}: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
});

const ToastRow = memo(function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  // useEffect required: auto-dismiss this toast after a fixed delay
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      className={`relative overflow-hidden pointer-events-auto rounded-lg shadow-xl px-4 py-2 text-xs animate-toast-in max-w-[420px] text-center ${
        toast.variant === 'error'
          ? 'bg-error text-grid-bg font-medium border border-error'
          : 'glass-surface text-text-primary'
      }`}
      data-testid="toast"
    >
      {toast.message}
      {/* Countdown bar: shrinks over the auto-dismiss delay */}
      <span
        aria-hidden
        className="toast-progress"
        style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
      />
    </div>
  );
});
