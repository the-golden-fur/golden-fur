import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** Walk-in booking flow: the customer/pet is physically at the branch
   * right now, so this picker stops browsing entirely - it selects a slot
   * that STARTS AT THE CURRENT TIME (rounded down to the minute) for the
   * service's own duration, and renders a non-interactive banner instead of
   * the calendar/time-grid. No availability fetch runs while locked; whether
   * staff are actually free right now is the StaffPickerList's job (it stays
   * interactive alongside this component). */
  lockToNow?: boolean;
  /** #22 follow-up: fired every time this date's availability resolves, so a
   * caller can react to "the day currently being viewed has zero open
   * slots" (e.g. show a fully-booked warning) without duplicating this
   * component's own fetch/availableCount logic. hasAnySlots is false both
   * when the branch has no operating_hours entry for that day AND when
   * every candidate for today has already passed (current time is past
   * closing) - getDaySlots returns an empty list either way, and neither
   * case is a real "fully booked" (capacity/staff/cage all taken)
   * situation, so callers should treat hasAnySlots === false as "nothing
   * to warn about here", not as a warning of its own. */
  onAvailabilityChange?: (info: {
    date: string;
    hasAnyAvailable: boolean;
    hasAnySlots: boolean;
  }) => void;
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
  lockToNow = false,
  onAvailabilityChange,
}: SlotPickerProps) {
  const [date, setDate] = useState(todayIso);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [operatingWindow, setOperatingWindow] =
    useState<OperatingWindow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Identity read via ref so a fresh arrow function on every parent render
  // never forces a re-fetch - only the actual query params below should.
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  useEffect(() => {
    onAvailabilityChangeRef.current = onAvailabilityChange;
  }, [onAvailabilityChange]);

  useEffect(() => {
    // Walk-in: nothing to fetch - the slot is "now", not something browsed
    // out of a day's availability. (isLoading is left as-is; every element
    // it gates is also gated on !lockToNow, so it never shows here.)
    if (lockToNow) {
      return;
    }

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
      onAvailabilityChangeRef.current?.({
        date,
        hasAnyAvailable: result.data.slots.some((slot) => slot.available),
        hasAnySlots: result.data.slots.length > 0,
      });
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
    lockToNow,
  ]);

  const availableCount = useMemo(
    () => slots.filter((slot) => slot.available).length,
    [slots]
  );

  // Walk-in booking flow: the slot IS the current moment - start at now
  // (seconds/ms zeroed for a clean scheduled_start) and run for the
  // service's own duration. Computed once per lock so it stays stable while
  // the receptionist works through the rest of the wizard.
  const nowSlot = useMemo(() => {
    if (!lockToNow) return null;
    const start = new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + slotDurationMinutes * 60_000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [lockToNow, slotDurationMinutes]);

  // Auto-select it with no click - the receptionist never picks a time for a
  // walk-in. Guarded so it settles after one call instead of looping.
  useEffect(() => {
    if (!nowSlot || selectedSlot?.start === nowSlot.start) return;
    onSelect(nowSlot);
  }, [nowSlot, selectedSlot, onSelect]);

  // A past date is never bookable (server-side: getDaySlots returns []
  // for any date before "today" in the branch's own timezone) - blocking
  // navigation to one here too is just the matching client-side guard, so
  // Previous day/the date input can't even be used to reach a date that
  // would always come back empty anyway.
  const minDate = todayIso();
  const isAtMinDate = date <= minDate;

  return (
    <div className={styles.wrapper}>
      {lockToNow ? (
        <div className={styles.lockedBanner}>
          <span className={styles.lockedBannerTitle}>
            Walk-in — starting now
          </span>
          <span>
            {nowSlot
              ? `${new Date(nowSlot.start).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })} - ${new Date(nowSlot.end).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })} today`
              : ''}
          </span>
        </div>
      ) : (
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
      )}

      {/* Walk-in booking flow: the locked banner above already covers
          loading/resolved/no-slot messaging, so the normal loading/error/
          empty copy below (written for a browsable date) is suppressed
          while locked to avoid redundant or confusing duplicate text. The
          error state still surfaces, since "the availability fetch itself
          failed" isn't something the banner's own copy communicates. */}
      {isLoading && !lockToNow ? (
        <p className={styles.copy}>Loading available times...</p>
      ) : null}

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && !lockToNow && slots.length === 0 ? (
        <p className={styles.copy}>
          No availability on this date. Try another date above.
        </p>
      ) : null}

      {!isLoading &&
      !error &&
      !lockToNow &&
      slots.length > 0 &&
      availableCount === 0 ? (
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

      {!lockToNow && !isLoading && !error && slots.length > 0 ? (
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
