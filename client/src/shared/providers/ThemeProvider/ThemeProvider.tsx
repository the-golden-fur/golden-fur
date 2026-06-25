import { useEffect, useMemo } from 'react';
import { ThemeContext, type ThemeMode } from './themeContext';

interface ThemeProviderProps {
  theme: ThemeMode;
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo(() => ({ theme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
