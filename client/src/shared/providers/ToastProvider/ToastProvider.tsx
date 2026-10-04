import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastVariant } from './ToastContext';
import styles from './ToastProvider.module.css';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 4000;

interface ToastProviderProps {
  children: ReactNode;
}

/** App-wide toast stack (bottom-right), mounted once in App.tsx. Originally
 * built for the MFA setup flow's "show a toast on success/fail" - most
 * other transient messaging in this app still uses an inline role="alert"
 * banner under the triggering control instead, reserving a toast for
 * something that should re-notify the viewer each time it recurs (e.g.
 * CageAssignmentStatus re-firing on every date/slot change) rather than
 * sitting as a permanent part of the page. */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              toast.variant === 'success' ? styles.success : styles.error
            }
            role="status"
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss"
              onClick={() => dismissToast(toast.id)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
