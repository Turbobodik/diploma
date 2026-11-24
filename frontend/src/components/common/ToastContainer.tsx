import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';

import type { ToastVariant } from '../../models/ui';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { dismissToast } from '../../store/uiSlice';
import { Button } from './Button';

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') return <CheckCircle2 size={18} aria-hidden="true" />;
  if (variant === 'error') return <AlertCircle size={18} aria-hidden="true" />;
  if (variant === 'warning') return <TriangleAlert size={18} aria-hidden="true" />;
  return <Info size={18} aria-hidden="true" />;
}

export function ToastContainer() {
  const toasts = useAppSelector((state) => state.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        dispatch(dismissToast(toast.id));
      }, 5000),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts, dispatch]);

  if (toasts.length === 0) return null;

  return (
    <aside className="toast-region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item ${toast.variant}`} role="status">
          <ToastIcon variant={toast.variant} />
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            {toast.description ? <div className="toast-desc">{toast.description}</div> : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Dismiss notification"
            onClick={() => dispatch(dismissToast(toast.id))}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      ))}
    </aside>
  );
}
