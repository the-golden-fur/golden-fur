import { useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ThemeContext } from '../../../../shared/providers/ThemeProvider/themeContext';
import styles from './LandingThemeToggle.module.css';

function systemPrefersDarkNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia) &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * Basic light/dark switch for the public marketing navbar
 * (Architectural-Change-History). Unlike the System/Light/Dark
 * ThemeToggle used in Settings > Preferences, this always flips between
 * the two explicit modes so a single click always has one obvious next
 * state - visitors here are anonymous, they've never set a preference yet.
 * Reads/writes the same ThemeContext the rest of the app uses, so the
 * choice takes effect immediately and (if the visitor later signs in)
 * persistence is already handled by ThemeProvider.
 */
export function LandingThemeToggle() {
  const { theme, setMode } = useContext(ThemeContext);
  // Only tracks the OS preference (an external system) - the effect below
  // updates this from the matchMedia 'change' event, never synchronously in
  // the effect body itself. Everything derived from theme.mode is computed
  // directly below instead of mirrored into state.
  const [systemPrefersDark, setSystemPrefersDark] =
    useState(systemPrefersDarkNow);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemPrefersDark(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const isDark =
    theme.mode === 'system' ? systemPrefersDark : theme.mode === 'dark';

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      onClick={() => setMode(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
