import { formatNightLabel } from '../../utils/hotelNights';
import styles from './NightTabs.module.css';

interface NightTabsProps {
  /** YYYY-MM-DD, one per night of the stay, in order. */
  nights: string[];
  /** null selects the first (dateless) tab. */
  activeDate: string | null;
  onSelect: (date: string | null) => void;
  /** Label for the dateless tab. Defaults to "All nights" (the read-only
   * details view); the booking wizard passes "Default (all nights)" to make
   * clear that entries there are the fallback every un-overridden night uses. */
  allNightsLabel?: string;
}

/**
 * Shared by the booking wizard's per-night Care Instructions editor (tabs
 * are clickable, drive which night's rows are shown/edited) and the
 * read-only booking details page (tabs are clickable, drive which night's
 * resolved instructions are displayed - no edit path either way, this
 * component itself never mutates anything).
 */
export function NightTabs({
  nights,
  activeDate,
  onSelect,
  allNightsLabel = 'All nights',
}: NightTabsProps) {
  return (
    <div className={styles.wrapper} role="tablist" aria-label="Night">
      <button
        type="button"
        role="tab"
        aria-selected={activeDate === null}
        className={`${styles.tab} ${activeDate === null ? styles.active : ''}`}
        onClick={() => onSelect(null)}
      >
        {allNightsLabel}
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
