import { useEffect, useMemo, useState } from 'react';
import type { OperatingWindow, SlotAvailability } from '../../booking.types';
import styles from './TimeSlotInput.module.css';

interface TimeSlotInputProps {
  /** Already fetched for the selected date. All candidates are listed in the
   * dropdown (unavailable ones shown disabled, same "see the whole day's
   * demand" visibility the old button grid gave staff/customers alike) -
   * only `available` ones are ever selectable. Past-time and outside-
   * operating-hours candidates never appear here at all (filtered out
   * server-side, see availability.service.ts). */
  slots: SlotAvailability[];
  /** Branch open/close for the selected date, used to bound the native time
   * input's typing range. Null when the branch is closed that day. */
  operatingWindow: OperatingWindow | null;
  viewerMode: 'customer' | 'staff';
  selectedStart: string | null;
  onSelect: (slot: SlotAvailability) => void;
}

/** A real count instead of the coarse Available/Partial/Fully-booked label -
 * "1 slot available" is more useful at a glance than "Partially available"
 * when deciding which time to pick. Grooming/Veterinary counts eligible
 * staff; Hotel's cage capacity is deliberately NOT repeated here - it's
 * identical across every candidate on a given date (cage capacity isn't
 * time-of-day-specific), and already shown once by SlotPicker's own summary
 * line and again per-size by CagePicker, so repeating it per time-block
 * would just be the same number three times over. */
function availabilityText(slot: SlotAvailability): string | null {
  if (slot.eligible_staff_count !== undefined) {
    const count = slot.eligible_staff_count;
    if (count === 0) return 'No slots available';
    return `${count} slot${count === 1 ? '' : 's'} available`;
  }

  if (
    slot.cage_capacity_remaining !== undefined &&
    slot.cage_capacity_total !== undefined
  ) {
    return null;
  }

  return slot.available ? 'Available' : 'Unavailable';
}

/** Browser-local "HH:MM" for a slot's ISO instant - matches how every other
 * display in this step already renders times (toLocaleTimeString(undefined)),
 * so a typed value compares against the same clock the option list shows. */
function timeKey(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Hybrid time selector: a native <input type="time"> (typeable, bounded by
 * the branch's operating-hours window for this date) plus a dropdown of the
 * day's real slots, replacing the old fixed grid of slot buttons. Both paths
 * resolve to one of the already-fetched `slots` - appointment availability is
 * quantized by service duration server-side, so a typed time that doesn't
 * land on a real, available slot is flagged rather than silently accepted.
 */
export function TimeSlotInput({
  slots,
  operatingWindow,
  viewerMode,
  selectedStart,
  onSelect,
}: TimeSlotInputProps) {
  const slotsByTime = useMemo(() => {
    const map = new Map<string, SlotAvailability>();
    for (const slot of slots) {
      if (slot.available) map.set(timeKey(slot.start), slot);
    }
    return map;
  }, [slots]);

  const [typedValue, setTypedValue] = useState(
    selectedStart ? timeKey(selectedStart) : ''
  );
  const [isOpen, setIsOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  // Adjusts local state when the `selectedStart` prop changes (e.g. a
  // rescheduled booking's existing slot loads in) - a direct render-time
  // setState guarded by comparing against the last-seen prop, per React's
  // "adjusting state when a prop changes" pattern, rather than a useEffect
  // (which would commit a stale value for one extra render first).
  const [prevSelectedStart, setPrevSelectedStart] = useState(selectedStart);
  if (selectedStart !== prevSelectedStart) {
    setPrevSelectedStart(selectedStart);
    setTypedValue(selectedStart ? timeKey(selectedStart) : '');
  }

  // Commits ~450ms after the last change so typing doesn't refetch the staff
  // list (keyed off the committed selection) on every keystroke. Clicking a
  // dropdown option calls onSelect immediately instead - see below.
  useEffect(() => {
    if (!typedValue) return;

    const match = slotsByTime.get(typedValue);
    if (!match || match.start === selectedStart) return;

    const timer = setTimeout(() => onSelect(match), 450);
    return () => clearTimeout(timer);
  }, [typedValue, slotsByTime, selectedStart, onSelect]);

  const showInvalid =
    touched && typedValue !== '' && !slotsByTime.has(typedValue);

  return (
    <div className={styles.wrapper}>
      <input
        type="time"
        className={styles.timeInput}
        value={typedValue}
        min={operatingWindow?.open}
        max={operatingWindow?.close}
        aria-label="Appointment time"
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setTouched(true);
          setTypedValue(event.target.value);
        }}
        onBlur={() => {
          // Delay so a click on a listbox option registers before it unmounts
          // (matches CatalogComboBox's own convention).
          setTimeout(() => setIsOpen(false), 150);
        }}
      />

      {showInvalid ? (
        <p className={styles.hint} role="alert">
          No appointment slot at that time - choose a suggested time below.
        </p>
      ) : null}

      {isOpen ? (
        <ul
          className={styles.listbox}
          role="listbox"
          aria-label="Suggested times"
        >
          {slots.length === 0 ? (
            <li className={styles.empty}>No available times on this date.</li>
          ) : (
            slots.map((slot) => {
              const staffText =
                viewerMode === 'staff' ? availabilityText(slot) : null;

              return (
                <li
                  key={slot.start}
                  role="option"
                  aria-selected={slot.start === selectedStart}
                  aria-disabled={!slot.available}
                >
                  <button
                    type="button"
                    className={`${styles.option} ${
                      slot.start === selectedStart ? styles.optionSelected : ''
                    }`}
                    disabled={!slot.available}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setTouched(false);
                      setTypedValue(timeKey(slot.start));
                      onSelect(slot);
                      setIsOpen(false);
                    }}
                  >
                    <span>{formatTime(slot.start)}</span>
                    {staffText ? (
                      <span className={styles.optionLevel}>{staffText}</span>
                    ) : !slot.available ? (
                      <span className={styles.optionLevel}>Unavailable</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
