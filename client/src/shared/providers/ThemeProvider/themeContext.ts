import { createContext } from 'react';

export type ThemeMode = 'customer' | 'staff';

export interface ThemeContextValue {
  theme: ThemeMode;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'customer',
});
