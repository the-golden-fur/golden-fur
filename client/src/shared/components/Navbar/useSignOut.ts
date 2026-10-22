import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { useUnsavedChangesContext } from '../../providers/UnsavedChangesProvider/UnsavedChangesContext';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';

export const HOME_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff',
  customer: '/portal',
};

export const SETTINGS_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/settings',
  customer: '/portal/settings',
};

const LOGIN_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/login',
  customer: '/login',
};

/**
 * Sign out, guarded by the unsaved-changes prompt: runs immediately if
 * nothing's dirty (or there's no provider), otherwise asks
 * Save/Discard/Cancel first - see AppShell's UnsavedChangesProvider. Shared
 * by the desktop Navbar and the phone navigation drawer.
 */
export function useSignOut(role: ThemeRole) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const unsavedChanges = useUnsavedChangesContext();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const performSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    window.sessionStorage.removeItem('staffMfaPending');
    window.sessionStorage.removeItem('customerMfaPending');
    navigate(LOGIN_PATH_BY_ROLE[role], { replace: true });
  };

  const requestSignOut = () => {
    if (unsavedChanges) {
      unsavedChanges.guardIfDirty(() => void performSignOut());
    } else {
      void performSignOut();
    }
  };

  return { isSigningOut, requestSignOut };
}
