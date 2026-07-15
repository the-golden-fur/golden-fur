import { useContext } from 'react';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import type { ColorMode } from '../../providers/ThemeProvider/themeContext';
import styles from './ThemeToggle.module.css';

const OPTIONS: Array<{ mode: ColorMode; label: string }> = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export function ThemeToggle() {
  const { theme, setMode } = useContext(ThemeContext);

  return (
    <div
      className={styles.themeToggle}
      role="radiogroup"
      aria-label="Theme preference"
    >
      {OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={theme.mode === mode}
          className={
            theme.mode === mode
              ? `${styles.option} ${styles.optionActive}`
              : styles.option
          }
          onClick={() => setMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
