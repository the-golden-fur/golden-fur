import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getFontSizePreference,
  getThemePreference,
  updateFontSizePreference,
  updateThemePreference,
} from '../../api/preferences.api';
import {
  ThemeContext,
  type ColorMode,
  type FontSizePreference,
  type ThemeRole,
} from './themeContext';

interface ThemeProviderProps {
  theme: ThemeRole;
  userId?: string | null;
  accessToken?: string | null;
  children: React.ReactNode;
}

/** Unitless multiplier consumed by --font-scale (typography.css), which
 * every --text-* size is expressed in terms of - so this one value scales
 * the whole app's type instead of needing per-component wiring. */
const FONT_SCALE_BY_SIZE: Record<FontSizePreference, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
  'x-large': 1.25,
};

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
  const [fontSize, setFontSizeState] = useState<FontSizePreference>('medium');

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

    getFontSizePreference(theme, userId).then((preference) => {
      if (!cancelled && preference) {
        setFontSizeState(preference);
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

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(FONT_SCALE_BY_SIZE[fontSize])
    );
  }, [fontSize]);

  const setMode = useCallback(
    (nextMode: ColorMode) => {
      setModeState(nextMode);
      if (accessToken) {
        void updateThemePreference(theme, accessToken, nextMode);
      }
    },
    [theme, accessToken]
  );

  const setFontSize = useCallback(
    (nextFontSize: FontSizePreference) => {
      setFontSizeState(nextFontSize);
      if (accessToken) {
        void updateFontSizePreference(theme, accessToken, nextFontSize);
      }
    },
    [theme, accessToken]
  );

  const value = useMemo(
    () => ({ theme: { role: theme, mode }, setMode, fontSize, setFontSize }),
    [theme, mode, setMode, fontSize, setFontSize]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
