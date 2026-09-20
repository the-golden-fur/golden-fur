import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router';
import { useUnsavedChangesContext } from './UnsavedChangesContext';

/**
 * useNavigate(), wrapped so it defers to guardIfDirty first - if something
 * registered with useUnsavedChanges is dirty, the "unsaved changes"
 * confirmation appears and the navigation only happens if the user picks
 * Discard, or after Save succeeds. Falls back to a plain navigate() outside
 * a provider (nothing to guard).
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  const context = useUnsavedChangesContext();

  return useCallback(
    (to: To, options?: NavigateOptions) => {
      if (!context) {
        navigate(to, options);
        return;
      }

      context.guardIfDirty(() => navigate(to, options));
    },
    [context, navigate]
  );
}
