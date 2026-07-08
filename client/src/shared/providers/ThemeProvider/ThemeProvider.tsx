import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getThemePreference,
  updateThemePreference,
} from '../../api/preferences.api';
import { ThemeContext, type ColorMode, type ThemeRole } from './themeContext';

interface ThemeProviderProps {
  theme: ThemeRole;
  userId?: string | null;
  accessToken?: string | null;
  children: React.ReactNode;
}

function resolveColorScheme(mode: ColorMode): 'light' | 'dark' {
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

export function ThemeProvider({
  theme,
  userId,
  accessToken,
  children,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ColorMode>('system');

  // Role-based palette (data-theme='staff'/'customer') is selected by route and
  // stays untouched by the light/dark/system mode layered on top below.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    getThemePreference(theme, userId).then((preference) => {
      if (!cancelled && preference) {
        setModeState(preference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [theme, userId]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-color-mode',
      resolveColorScheme(mode)
    );

    if (
      mode !== 'system' ||
      typeof window === 'undefined' ||
      !window.matchMedia
    ) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      document.documentElement.setAttribute(
        'data-color-mode',
        media.matches ? 'dark' : 'light'
      );
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [mode]);

  const setMode = useCallback(
    (nextMode: ColorMode) => {
      setModeState(nextMode);
      if (accessToken) {
        void updateThemePreference(theme, accessToken, nextMode);
      }
    },
    [theme, accessToken]
  );

  const value = useMemo(
    () => ({ theme: { role: theme, mode }, setMode }),
    [theme, mode, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
