import { useEffect, useMemo, useState } from 'react';
import { getDayAvailability } from '../../api/booking.api';
import type {
  OperatingWindow,
  ServiceCategory,
  SlotAvailability,
} from '../../booking.types';
import { TimeSlotInput } from '../TimeSlotInput/TimeSlotInput';
import styles from './SlotPicker.module.css';

interface SelectedSlot {
  start: string;
  end: string;
}

interface SlotPickerProps {
  accessToken: string;
  branchId: string;
  serviceCategory: ServiceCategory;
  slotDurationMinutes: number;
  /** Required (and only meaningful) for Hotel. */
  petWeightClass?: string;
  /** Customer mode shows only available/unavailable (AC-1); Receptionist/
   * Admin mode adds the 3-color coverage overlay (AC-2). One component, two
   * render modes - not forked into two components (#56 dev notes). */
  viewerMode: 'customer' | 'staff';
  selectedSlot: SelectedSlot | null;
  onSelect: (slot: SelectedSlot) => void;
}

/** Browser-LOCAL calendar date, not UTC - `.toISOString()` reports the UTC
 * date, which lags a full local day behind for any positive UTC offset
 * (e.g. Asia/Manila, UTC+8) during the local-midnight-to-8AM window, letting
 * "today" (and therefore the min-date guard below) silently resolve to
 * yesterday during that window. */
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * One SlotPicker, two render modes gated by viewerMode (#56 dev notes) -
 * data comes from the same capacity + get_staff_availability() read path
 * #51/#49 expose (via the #56 supporting availability endpoint), so
 * availability logic is never duplicated client-side.
 */
export function SlotPicker({
  accessToken,
  branchId,
  serviceCategory,
  slotDurationMinutes,
  petWeightClass,
  viewerMode,
  selectedSlot,
  onSelect,
}: SlotPickerProps) {
  const [date, setDate] = useState(todayIso);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [operatingWindow, setOperatingWindow] =
    useState<OperatingWindow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (serviceCategory === 'Hotel' && !petWeightClass) {
      return;
    }

    let isMounted = true;

    // isLoading/error are reset from the fetch's own resolution below, not
    // synchronously here - a plain top-of-effect setState would trigger an
    // extra synchronous render before the request even starts (React's
    // set-state-in-effect guidance). Stale slots stay visible until the new
    // result lands, which is fine since every resolution below deterministically
    // sets the correct final data/error regardless of what was showing before.
    void getDayAvailability(accessToken, {
      branchId,
      serviceCategory,
      date,
      slotDurationMinutes,
      petWeightClass,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load availability.');
        return;
      }

      setError(null);
      setSlots(result.data.slots);
      setOperatingWindow(result.data.window);
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    branchId,
    serviceCategory,
    date,
    slotDurationMinutes,
    petWeightClass,
  ]);

  const availableCount = useMemo(
    () => slots.filter((slot) => slot.available).length,
    [slots]
  );

  // A past date is never bookable (server-side: getDaySlots returns []
  // for any date before "today" in the branch's own timezone) - blocking
  // navigation to one here too is just the matching client-side guard, so
  // Previous day/the date input can't even be used to reach a date that
  // would always come back empty anyway.
  const minDate = todayIso();
  const isAtMinDate = date <= minDate;

  return (
    <div className={styles.wrapper}>
      <div className={styles.dateNav}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={isAtMinDate}
          onClick={() => setDate((current) => shiftDate(current, -1))}
        >
          Previous day
        </button>
        <label className={styles.dateField}>
          <span className={styles.dateLabel}>Date</span>
          <input
            className={styles.dateInput}
            type="date"
            min={minDate}
            value={date}
            onChange={(event) =>
              setDate(
                event.target.value < minDate ? minDate : event.target.value
              )
            }
          />
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setDate((current) => shiftDate(current, 1))}
        >
          Next day
        </button>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading available times...</p>
      ) : null}

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && slots.length === 0 ? (
        <p className={styles.copy}>
          No availability on this date. Try another date above.
        </p>
      ) : null}

      {!isLoading && !error && slots.length > 0 && availableCount === 0 ? (
        <p className={styles.copy}>
          No open slots on this date. Try another date above.
        </p>
      ) : null}

      {/* Hotel's single day-level slot doesn't otherwise explain WHY it's
          enabled/disabled - cage size is a separate concern from the date/
          time picker itself, but its availability should still be visible
          here rather than just a plain enabled/disabled button. */}
      {!isLoading &&
      !error &&
      serviceCategory === 'Hotel' &&
      slots[0]?.cage_capacity_total !== undefined ? (
        <p className={styles.copy}>
          Cage availability for this size: {slots[0].cage_capacity_remaining} of{' '}
          {slots[0].cage_capacity_total} free.
        </p>
      ) : null}

      {!isLoading && !error && slots.length > 0 ? (
        <TimeSlotInput
          slots={slots}
          operatingWindow={operatingWindow}
          viewerMode={viewerMode}
          selectedStart={selectedSlot?.start ?? null}
          onSelect={(slot) => onSelect({ start: slot.start, end: slot.end })}
        />
      ) : null}
    </div>
  );
}
