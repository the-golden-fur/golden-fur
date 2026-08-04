import styles from './NightTabs.module.css';

interface NightTabsProps {
  /** YYYY-MM-DD, one per night of the stay, in order. */
  nights: string[];
  /** null selects the "All nights" tab. */
  activeDate: string | null;
  onSelect: (date: string | null) => void;
}

function formatNightLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Shared by the booking wizard's per-night Care Instructions editor (tabs
 * are clickable, drive which night's rows are shown/edited) and the
 * read-only booking details page (tabs are clickable, drive which night's
 * resolved instructions are displayed - no edit path either way, this
 * component itself never mutates anything).
 */
export function NightTabs({ nights, activeDate, onSelect }: NightTabsProps) {
  return (
    <div className={styles.wrapper} role="tablist" aria-label="Night">
      <button
        type="button"
        role="tab"
        aria-selected={activeDate === null}
        className={`${styles.tab} ${activeDate === null ? styles.active : ''}`}
        onClick={() => onSelect(null)}
      >
        All nights
      </button>
      {nights.map((date) => (
        <button
          key={date}
          type="button"
          role="tab"
          aria-selected={activeDate === date}
          className={`${styles.tab} ${activeDate === date ? styles.active : ''}`}
          onClick={() => onSelect(date)}
        >
          {formatNightLabel(date)}
        </button>
      ))}
    </div>
  );
}
