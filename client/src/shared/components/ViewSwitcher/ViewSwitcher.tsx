import type { LucideIcon } from 'lucide-react';
import styles from './ViewSwitcher.module.css';

export interface ViewSwitcherOption<V extends string> {
  value: V;
  label: string;
  icon?: LucideIcon;
}

interface ViewSwitcherProps<V extends string> {
  options: ViewSwitcherOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

/**
 * A small segmented control for switching between renderings of the same data
 * (Table / Board / ...). Generic over the view union so a page keeps its own
 * `'table' | 'board'` type.
 */
export function ViewSwitcher<V extends string>({
  options,
  value,
  onChange,
  ariaLabel = 'View',
}: ViewSwitcherProps<V>) {
  return (
    <div className={styles.group} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? styles.buttonActive : styles.button}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
