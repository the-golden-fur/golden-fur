import styles from './ToggleSwitch.module.css';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; also rendered next to the track unless hideLabel. */
  label: string;
  disabled?: boolean;
  /** Keeps label as the accessible name but visually hides it - for grid
   * layouts (e.g. a notification preferences table) where a column header
   * already states what the switch means, so repeating it per-row/cell
   * would be redundant. */
  hideLabel?: boolean;
}

/**
 * Branch-availability and active/inactive toggle, shared by all four Epic A
 * admin pages (#45-#48). A real button with role="switch" so it is
 * keyboard-operable and announces its state.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  hideLabel = false,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={styles.switch}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span
        className={checked ? styles.trackOn : styles.trackOff}
        aria-hidden="true"
      >
        <span className={styles.thumb} />
      </span>
      <span className={hideLabel ? styles.srOnlyLabel : styles.label}>
        {label}
      </span>
    </button>
  );
}
