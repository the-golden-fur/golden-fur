import { createContext } from 'react';

export type ThemeRole = 'customer' | 'staff';
export type ColorMode = 'light' | 'dark' | 'system';
export type FontSizePreference = 'small' | 'medium' | 'large' | 'x-large';
/** How this user wants pet weights rendered app-wide (Architectural-Change-
 * History). Storage is always canonical kilograms; this only affects display
 * and the default unit of a weight input. */
export type WeightUnitPreference = 'kg' | 'lbs';

export interface ThemeMode {
  role: ThemeRole;
  mode: ColorMode;
}

/** Moved here (not ThemeProvider.tsx) so it can be imported outside a
 * component without tripping react-refresh's "only export components" rule
 * for the file that defines ThemeProvider itself. */
export function resolveColorScheme(mode: ColorMode): 'light' | 'dark' {
  if (mode !== 'system') {
    return mode;
  }

  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export interface ThemeContextValue {
  theme: ThemeMode;
  setMode: (mode: ColorMode) => void;
  fontSize: FontSizePreference;
  setFontSize: (fontSize: FontSizePreference) => void;
  weightUnit: WeightUnitPreference;
  setWeightUnit: (weightUnit: WeightUnitPreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: { role: 'customer', mode: 'system' },
  setMode: () => undefined,
  fontSize: 'medium',
  setFontSize: () => undefined,
  weightUnit: 'kg',
  setWeightUnit: () => undefined,
});
