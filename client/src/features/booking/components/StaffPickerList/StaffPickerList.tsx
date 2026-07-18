import { useEffect, useRef, useState } from 'react';
import { getStaffPickerOptions } from '../../api/booking.api';
import type {
  StaffPickerOption,
  StaffPreferenceInput,
} from '../../booking.types';
import styles from './StaffPickerList.module.css';

interface StaffPickerListProps {
  accessToken: string;
  branchId: string;
  serviceCategory: 'Grooming' | 'Veterinary';
  scheduledStart: string;
  scheduledEnd: string;
  selected: StaffPreferenceInput | null;
  onSelect: (preference: StaffPreferenceInput) => void;
  /**
   * Called once, the first time the endpoint resolves
   * `staff_picker_enabled: false` for this branch+service type - the caller
   * should treat this the same as "no staff preference" and move on (AC-1:
   * absent, not shown-then-hidden). GET /bookings/staff-picker is the only
   * customer-accessible signal for this - GET /bookings/policy is staff-only
   * (#52), so resolving it here (rather than a pre-check the caller does
   * before ever mounting this component) is what keeps this usable from
   * both the customer flow (#55/#59) and staff surfaces (#60).
   */
  onUnavailable?: () => void;
}

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function isSelected(
  option: StaffPickerOption,
  selected: StaffPreferenceInput | null
): boolean {
  if (!selected) return false;
  if (option.type === 'no_preference') return selected.type === 'no_preference';
  return selected.type === 'specific' && selected.staff_id === option.staff_id;
}

/**
 * Only mounted by the flow page when #52's toggle is enabled for the
 * selected branch+service type (AC-1) - the caller decides whether this
 * step exists in the stepper at all, so this component always assumes it
 * should render once mounted. Sourced directly from the #49 RPC response
 * shape via the Staff Picker endpoint - no second fetch to staff_profiles
 * (dev notes).
 */
export function StaffPickerList({
  accessToken,
  branchId,
  serviceCategory,
  scheduledStart,
  scheduledEnd,
  selected,
  onSelect,
  onUnavailable,
}: StaffPickerListProps) {
  const [options, setOptions] = useState<StaffPickerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  // Read via ref inside the fetch effect below so the callback's identity
  // (a fresh arrow function on every parent render, in practice) never
  // forces a re-fetch - only the actual query params should do that.
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let isMounted = true;

    // isLoading/error reset from the fetch's own resolution below, not
    // synchronously here (React's set-state-in-effect guidance - a bare
    // top-of-effect setState would trigger an extra synchronous render
    // before the request even starts).
    void getStaffPickerOptions(accessToken, {
      branchId,
      serviceCategory,
      scheduledStart,
      scheduledEnd,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load available staff.');
        return;
      }

      setError(null);

      if (!result.data.staff_picker_enabled) {
        setIsUnavailable(true);
        onUnavailableRef.current?.();
        return;
      }

      // "No preference" is always first per #52 AC-4 - the endpoint already
      // guarantees this ordering, kept as-is rather than re-sorted here.
      setOptions(result.data.options);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, serviceCategory, scheduledStart, scheduledEnd]);

  if (isUnavailable) {
    return null;
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading available staff...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className={styles.grid}>
      {options.map((option) => {
        const key = option.type === 'no_preference' ? 'no_preference' : option.staff_id;
        const active = isSelected(option, selected);

        return (
          <button
            key={key}
            type="button"
            className={`${styles.card} ${active ? styles.selected : ''}`}
            onClick={() =>
              onSelect(
                option.type === 'no_preference'
                  ? { type: 'no_preference' }
                  : { type: 'specific', staff_id: option.staff_id }
              )
            }
          >
            {option.type === 'no_preference' ? (
              <span className={styles.noPreferenceIcon} aria-hidden="true">
                ?
              </span>
            ) : option.profile_photo_url ? (
              <img
                className={styles.avatar}
                src={option.profile_photo_url}
                alt=""
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                {getInitials(option.display_name)}
              </span>
            )}
            <span className={styles.name}>
              {option.type === 'no_preference'
                ? 'No preference'
                : option.display_name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
