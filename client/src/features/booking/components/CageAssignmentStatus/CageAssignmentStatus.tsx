import { useEffect, useState } from 'react';
import { getCageAssignmentStatus } from '../../api/booking.api';
import { useToast } from '../../../../shared/providers/ToastProvider/useToast';
import styles from './CageAssignmentStatus.module.css';

interface CageAssignmentStatusProps {
  accessToken: string;
  branchId: string;
  petId: string;
  petName: string;
  /** The customer's currently selected slot start (ISO), if any - this is a
   * real-time snapshot of `cages.status`, not a per-date query (see below),
   * but re-running it whenever the customer changes date/time at least picks
   * up any change in that live status since the last check (e.g. a cage
   * freed up at checkout) instead of silently going stale for the rest of
   * the flow. Optional and omittable - the check still fires once on mount
   * with no selection yet, satisfying "indicated immediately". */
  scheduledStart?: string | null;
}

/**
 * Custom change (cage pet-type support / readonly cage assignment):
 * customer-facing readonly answer to "will my pet have a cage" - unlike
 * CagePickerList (interactive, receptionist-only as of this change), this
 * never lets the viewer pick anything. Cage availability is a live status
 * snapshot, not a per-slot check, so this renders as soon as the pet and
 * branch are known, satisfying the "indicated immediately" requirement.
 *
 * The no-cage-available case is a toast (re-fired via scheduledStart below)
 * rather than a persistent inline banner - it was easy to miss that the
 * warning never updated after changing the date/time, letting a customer
 * read it once, pick a different date, and keep going without ever being
 * told whether that still held.
 */
export function CageAssignmentStatus({
  accessToken,
  branchId,
  petId,
  petName,
  scheduledStart,
}: CageAssignmentStatusProps) {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);
  const [cageLabel, setCageLabel] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getCageAssignmentStatus(accessToken, branchId, petId).then(
      (result) => {
        if (!isMounted) return;

        setIsLoading(false);

        if (result.error || !result.data) {
          setError(result.error ?? 'Could not check cage availability.');
          return;
        }

        setError(null);
        setMatched(result.data.matched);
        setCageLabel(result.data.cage?.cage_label ?? null);

        if (!result.data.matched) {
          showToast(
            `No cage is currently available for ${petName} at this branch. You can still continue - please check with staff before your stay.`,
            'error'
          );
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, petId, scheduledStart, petName, showToast]);

  if (isLoading) {
    return <p className={styles.copy}>Checking cage availability...</p>;
  }

  if (error) {
    return (
      <p className={styles.noMatchBanner} role="alert">
        {error}
      </p>
    );
  }

  if (matched) {
    return (
      <p className={styles.matchedBanner}>
        A cage is available for {petName} at this branch
        {cageLabel ? ` (${cageLabel})` : ''}. Staff will confirm the exact cage
        at check-in.
      </p>
    );
  }

  return null;
}
