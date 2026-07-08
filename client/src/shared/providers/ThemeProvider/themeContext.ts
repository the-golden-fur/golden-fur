import { createContext } from 'react';

export type ThemeRole = 'customer' | 'staff';
export type ColorMode = 'light' | 'dark' | 'system';

export interface ThemeMode {
  role: ThemeRole;
  mode: ColorMode;
}

export interface ThemeContextValue {
  theme: ThemeMode;
  setMode: (mode: ColorMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: { role: 'customer', mode: 'system' },
  setMode: () => undefined,
});
