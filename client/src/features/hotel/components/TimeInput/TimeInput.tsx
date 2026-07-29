import { formatTimeValue } from './formatTimeValue';
import styles from './TimeInput.module.css';

const DEFAULT_PRESETS = ['07:00', '08:00', '12:00', '15:00', '18:00', '20:00'];

interface TimeInputProps {
  /** "HH:MM", 24h - the native <input type="time"> value format. */
  value: string;
  onChange: (value: string) => void;
  presets?: string[];
  'aria-label'?: string;
  /** Read-only display - HotelCheckInPage's Care Instructions section uses
   * this once check-in makes feeding/walking/medication instructions
   * read-only for every staff role. */
  disabled?: boolean;
}

/**
 * Issue #79 revision: hybrid time picker - a native <input type="time">
 * (precise, works on mobile, and lets the receptionist type/scrub freely)
 * plus a quick-pick dropdown of common times that fills it in. Used for
 * walking start/end and each medication scheduled time.
 */
export function TimeInput({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  'aria-label': ariaLabel,
  disabled = false,
}: TimeInputProps) {
  return (
    <div className={styles.wrapper}>
      <input
        className={styles.input}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <select
        className={styles.presetSelect}
        aria-label={
          ariaLabel ? `${ariaLabel} quick-pick` : 'Quick-pick a common time'
        }
        value=""
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      >
        <option value="">Quick pick...</option>
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {formatTimeValue(preset)}
          </option>
        ))}
      </select>
    </div>
  );
}
