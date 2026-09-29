import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';

/** Keyed per role (not shared) - a customer and a staff member on the same
 * browser must not trust each other's device. Deliberately plain
 * localStorage, not the sessionStorage-backed dualStorage auth.api.ts uses -
 * "remember this device for 30 days" is meant to survive a browser restart
 * regardless of session-persistence settings. */
function storageKey(role: ThemeRole): string {
  return `gf-trusted-device-${role}`;
}

export function getStoredDeviceToken(role: ThemeRole): string | null {
  try {
    return window.localStorage.getItem(storageKey(role));
  } catch {
    return null;
  }
}

export function storeDeviceToken(role: ThemeRole, token: string): void {
  try {
    window.localStorage.setItem(storageKey(role), token);
  } catch {
    // Storage unavailable (e.g. private-mode edge cases) - the user just
    // gets re-challenged next time, which is the safe fallback anyway.
  }
}

export function clearStoredDeviceToken(role: ThemeRole): void {
  try {
    window.localStorage.removeItem(storageKey(role));
  } catch {
    // ignore
  }
}
