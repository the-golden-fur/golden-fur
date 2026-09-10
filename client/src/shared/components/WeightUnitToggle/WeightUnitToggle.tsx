import { useContext } from 'react';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import type { WeightUnitPreference } from '../../providers/ThemeProvider/themeContext';
import styles from './WeightUnitToggle.module.css';

const OPTIONS: Array<{ unit: WeightUnitPreference; label: string }> = [
  { unit: 'kg', label: 'Kilograms (kg)' },
  { unit: 'lbs', label: 'Pounds (lb)' },
];

/**
 * Settings > Preferences: how this user wants pet weights shown app-wide
 * (Architectural-Change-History). Persists per-account through
 * ThemeProvider/preferences.api and applies instantly, same as ThemeToggle.
 */
export function WeightUnitToggle() {
  const { weightUnit, setWeightUnit } = useContext(ThemeContext);

  return (
    <div
      className={styles.weightUnitToggle}
      role="radiogroup"
      aria-label="Pet weight unit preference"
    >
      {OPTIONS.map(({ unit, label }) => (
        <button
          key={unit}
          type="button"
          role="radio"
          aria-checked={weightUnit === unit}
          className={
            weightUnit === unit
              ? `${styles.option} ${styles.optionActive}`
              : styles.option
          }
          onClick={() => setWeightUnit(unit)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
