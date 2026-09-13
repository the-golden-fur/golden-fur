import styles from './DayOfWeekPicker.module.css';

/** 0=Sunday..6=Saturday, matching the promos.days_of_week column and
 * Date#getDay(). */
const DAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

interface DayOfWeekPickerProps {
  label: string;
  selectedDays: number[];
  onChange: (days: number[]) => void;
}

/** A weekly-recurring promo's day-of-week selector (session 86) - a plain
 * 7-checkbox group, one per weekday. */
export function DayOfWeekPicker({
  label,
  selectedDays,
  onChange,
}: DayOfWeekPickerProps) {
  const toggle = (day: number) => {
    onChange(
      selectedDays.includes(day)
        ? selectedDays.filter((d) => d !== day)
        : [...selectedDays, day].sort((a, b) => a - b)
    );
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.days}>
        {DAYS.map((day) => (
          <label key={day.value} className={styles.day}>
            <input
              type="checkbox"
              checked={selectedDays.includes(day.value)}
              onChange={() => toggle(day.value)}
            />
            <span>{day.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
