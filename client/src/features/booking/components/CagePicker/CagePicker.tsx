import { useEffect, useState } from 'react';
import { getDayAvailability } from '../../api/booking.api';
import styles from './CagePicker.module.css';

const CAGE_SIZES = ['S', 'M', 'L', 'XL'] as const;
type CageSize = (typeof CAGE_SIZES)[number];

/** Hotel treats duration as a full night regardless of which service/package
 * ends up chosen (see availability.service.ts's HOTEL_ARRIVAL_STEP_MS) - a
 * fixed 1440 here is not an approximation the way it is for Grooming/
 * Veterinary/Daycare's default duration, it's just how Hotel always works. */
const HOTEL_NIGHT_MINUTES = 1440;

interface CagePickerProps {
  accessToken: string;
  branchId: string;
  /** YYYY-MM-DD - the date currently selected in the paired SlotPicker. */
  date: string;
  /** The pet's own staff-assessed weight class, if known - only this size
   * is ever actually booked (createBooking derives it server-side from the
   * pet, never from client input); other sizes are shown for context only. */
  recommendedSize: CageSize | null;
}

interface SizeCapacity {
  size: CageSize;
  remaining: number | null;
  total: number | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * #22 follow-up: replaces the Staff Picker step for Hotel bookings - shows
 * cage capacity grouped by size for the date currently selected in the
 * paired SlotPicker, so a customer sees cage availability before spending
 * time picking specific services/packages (which happens in a later step).
 * Purely informational (no schema field exists for "customer's chosen cage
 * size" - see the plan's Key design decisions) - reuses the same
 * customer-accessible GET /bookings/availability endpoint the SlotPicker
 * itself already calls, once per size, reading cage_capacity_remaining/
 * total exactly like SlotPicker's own single-size summary does today.
 */
export function CagePicker({
  accessToken,
  branchId,
  date,
  recommendedSize,
}: CagePickerProps) {
  const [capacities, setCapacities] = useState<SizeCapacity[]>(
    CAGE_SIZES.map((size) => ({
      size,
      remaining: null,
      total: null,
      isLoading: true,
      error: null,
    }))
  );

  useEffect(() => {
    let isMounted = true;

    // isLoading/error are reset from the fetch's own resolution below, not
    // synchronously here (React's set-state-in-effect guidance, matches
    // SlotPicker's identical pattern) - stale capacities stay visible until
    // the new result lands rather than flashing back to a loading state.
    void Promise.all(
      CAGE_SIZES.map(async (size) => {
        const result = await getDayAvailability(accessToken, {
          branchId,
          serviceCategory: 'Hotel',
          date,
          slotDurationMinutes: HOTEL_NIGHT_MINUTES,
          petWeightClass: size,
        });

        return { size, result };
      })
    ).then((results) => {
      if (!isMounted) return;

      setCapacities(
        results.map(({ size, result }) => {
          if (result.error || !result.data) {
            return {
              size,
              remaining: null,
              total: null,
              isLoading: false,
              error: result.error ?? 'Could not load cage availability.',
            };
          }

          const slot = result.data.slots[0];
          return {
            size,
            remaining: slot?.cage_capacity_remaining ?? null,
            total: slot?.cage_capacity_total ?? null,
            isLoading: false,
            error: null,
          };
        })
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, date]);

  return (
    <div className={styles.wrapper}>
      <span className={styles.heading}>Cage availability</span>
      <div className={styles.grid}>
        {capacities.map((entry) => (
          <div
            key={entry.size}
            className={`${styles.card} ${entry.size === recommendedSize ? styles.recommended : ''}`}
          >
            <span className={styles.sizeLabel}>{entry.size}</span>
            {entry.size === recommendedSize ? (
              <span className={styles.badge}>Recommended</span>
            ) : null}
            {entry.isLoading ? (
              <span className={styles.copy}>Loading...</span>
            ) : entry.error ? (
              <span className={styles.errorBanner}>{entry.error}</span>
            ) : (
              <span
                className={
                  entry.remaining !== null && entry.remaining <= 0
                    ? `${styles.count} ${styles.countFull}`
                    : styles.count
                }
              >
                {entry.remaining ?? 0} of {entry.total ?? 0} free
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
