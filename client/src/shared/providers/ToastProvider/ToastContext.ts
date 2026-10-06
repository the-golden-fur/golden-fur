import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error';

export interface ToastContextValue {
  /** Queues a toast; it auto-dismisses on its own after a few seconds. */
  showToast: (message: string, variant?: ToastVariant) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Mounted once at the app root (App.tsx), unlike UnsavedChangesProvider's
 * Settings-only scope - any page can show a toast, so this throws rather
 * than silently no-op'ing outside a provider (that would hide a real setup
 * mistake instead of just skipping an optional feature).
 */
export function useToastContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
