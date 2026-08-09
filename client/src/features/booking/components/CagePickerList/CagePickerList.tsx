import { useEffect, useRef, useState } from 'react';
import { getCagePickerOptions } from '../../api/booking.api';
import type {
  CagePickerOption,
  CagePreferenceInput,
} from '../../booking.types';
import styles from './CagePickerList.module.css';

interface CagePickerListProps {
  accessToken: string;
  branchId: string;
  selected: CagePreferenceInput | null;
  onSelect: (preference: CagePreferenceInput) => void;
  /** Same contract as StaffPickerList's onUnavailable - called once, the
   * first time the endpoint resolves cage_picker_enabled: false for this
   * branch/service type, so the caller can treat this as "no preference"
   * and move on. */
  onUnavailable?: () => void;
  /** Custom change: folded in from the now-removed standalone CagePicker
   * (which only ever showed this, with no way to act on it) - the
   * selected pet's own weight_class, so a same-size cage can carry a
   * "Recommended" badge here too instead of losing that signal. */
  recommendedSize?: string | null;
}

function getInitials(cageLabel: string): string {
  return cageLabel.slice(0, 2).toUpperCase();
}

function isSelected(
  option: CagePickerOption,
  selected: CagePreferenceInput | null
): boolean {
  if (!selected) return false;
  if (option.type === 'no_preference') return selected.type === 'no_preference';
  return selected.type === 'specific' && selected.cage_id === option.cage_id;
}

/**
 * Custom change: Cage Picker addendum, mirroring StaffPickerList. Only
 * mounted by the booking flow when the selected Hotel service type has
 * cage_picker_enabled set (Admin Settings > Service Types) - the caller
 * decides whether this step exists in the stepper at all. Branch-scoped
 * only (no time window - cage availability is a live status snapshot, not
 * a per-slot check); "No preference" is always present and pinned first.
 */
export function CagePickerList({
  accessToken,
  branchId,
  selected,
  onSelect,
  onUnavailable,
  recommendedSize,
}: CagePickerListProps) {
  const [options, setOptions] = useState<CagePickerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const onUnavailableRef = useRef(onUnavailable);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    let isMounted = true;

    void getCagePickerOptions(accessToken, branchId).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load available cages.');
        return;
      }

      setError(null);

      if (!result.data.cage_picker_enabled) {
        setIsUnavailable(true);
        onUnavailableRef.current?.();
        return;
      }

      setOptions(result.data.options);

      if (!selectedRef.current) {
        onSelectRef.current({ type: 'no_preference' });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  if (isUnavailable) {
    return null;
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading available cages...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.heading}>Cage</span>

      {options.length === 1 ? (
        <p className={styles.copy}>No cages are currently available.</p>
      ) : (
        <div className={styles.grid}>
          {options.map((option) => {
            const key =
              option.type === 'no_preference'
                ? 'no_preference'
                : option.cage_id;
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
                      : { type: 'specific', cage_id: option.cage_id }
                  )
                }
              >
                {option.type === 'no_preference' ? (
                  <span className={styles.noPreferenceIcon} aria-hidden="true">
                    ?
                  </span>
                ) : (
                  <span className={styles.avatarFallback} aria-hidden="true">
                    {getInitials(option.cage_label)}
                  </span>
                )}
                <span className={styles.name}>
                  {option.type === 'no_preference'
                    ? 'No preference'
                    : `${option.cage_label} (${option.size})`}
                </span>
                {option.type === 'specific' &&
                recommendedSize &&
                option.size === recommendedSize ? (
                  <span className={styles.recommendedBadge}>Recommended</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
