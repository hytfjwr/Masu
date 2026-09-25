import { useCallback, useRef, useState } from 'react';

export type ToastVariant = 'info' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

/** Minimal toast notification stack: showToast(message) enqueues a message that auto-dismisses. */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextIdRef.current++;
    setToasts(prev => [...prev, { id, message, variant }]);
  }, []);

  return { toasts, showToast, dismissToast };
}
