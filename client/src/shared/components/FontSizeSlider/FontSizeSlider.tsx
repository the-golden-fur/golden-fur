import { useContext } from 'react';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import type { FontSizePreference } from '../../providers/ThemeProvider/themeContext';
import styles from './FontSizeSlider.module.css';

const FONT_SIZE_STEPS: FontSizePreference[] = [
  'small',
  'medium',
  'large',
  'x-large',
];

const FONT_SIZE_LABELS: Record<FontSizePreference, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  'x-large': 'Extra Large',
};

/**
 * Settings > Appearance. A 4-step slider (not a free-form range) over the
 * same font_size_preference enum the server persists - each step sets
 * --font-scale (typography.css) via ThemeProvider, so every --text-* size
 * across the app scales together. The sample text below re-renders live off
 * that same CSS variable, no extra wiring needed.
 */
export function FontSizeSlider() {
  const { fontSize, setFontSize } = useContext(ThemeContext);
  const stepIndex = FONT_SIZE_STEPS.indexOf(fontSize);

  return (
    <div className={styles.wrapper}>
      <div className={styles.sliderRow}>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={FONT_SIZE_STEPS.length - 1}
          step={1}
          value={stepIndex === -1 ? 1 : stepIndex}
          onChange={(event) =>
            setFontSize(FONT_SIZE_STEPS[Number(event.target.value)])
          }
          aria-label="Font size"
          aria-valuetext={FONT_SIZE_LABELS[fontSize]}
        />
        <span className={styles.currentLabel}>
          {FONT_SIZE_LABELS[fontSize]}
        </span>
      </div>
      <div className={styles.ticks} aria-hidden="true">
        {FONT_SIZE_STEPS.map((step) => (
          <span key={step}>{FONT_SIZE_LABELS[step]}</span>
        ))}
      </div>
      <p className={styles.sampleText}>
        Sample text — The quick brown fox jumps over the lazy dog.
      </p>
    </div>
  );
}
