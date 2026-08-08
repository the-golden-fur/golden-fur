import { X } from 'lucide-react';
import styles from './ActiveFilterChips.module.css';

export interface ActiveFilterChip {
  id: string;
  label: string;
  onClear: () => void;
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
}

/**
 * Notion-style row of removable pills, one per non-default filter/search/
 * sort value a queue page currently has active - each page computes its own
 * `chips` array from state it already owns (QueueFilterBar/SearchSortBar
 * stay uncontrolled of this; they don't know what a page considers
 * "default"). Renders nothing when no filter is active, so pages don't need
 * to conditionally render this themselves.
 */
export function ActiveFilterChips({ chips }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    // A plain group of buttons, not a <ul>/<li> list - these are actions,
    // and a semantic list would collide with every queue page's own
    // getAllByRole('listitem') query over its actual row list.
    <div className={styles.row} role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={styles.chip}
          onClick={chip.onClear}
        >
          <span>{chip.label}</span>
          <X size={13} aria-hidden="true" />
          <span className={styles.srOnly}>Clear {chip.label}</span>
        </button>
      ))}
    </div>
  );
}
