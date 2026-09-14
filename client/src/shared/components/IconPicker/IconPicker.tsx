import { SERVICE_ICON_MAP, SERVICE_ICON_NAMES } from './serviceIcons';
import styles from './IconPicker.module.css';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
  /** Accessible label for the grid, e.g. "Service type icon". */
  label: string;
}

/**
 * A grid of curated Lucide icons an admin can pick one of (Architectural-
 * Change-History: "should be able to select icon for new service type").
 * Clicking the already-selected icon clears the selection - there is no
 * separate "None" button, one less control for the same effect.
 */
export function IconPicker({ value, onChange, label }: IconPickerProps) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>{label}</span>
      <div className={styles.grid} role="radiogroup" aria-label={label}>
        {SERVICE_ICON_NAMES.map((name) => {
          const Icon = SERVICE_ICON_MAP[name];
          const isSelected = value === name;

          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={name}
              title={name}
              className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
              onClick={() => onChange(isSelected ? null : name)}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
