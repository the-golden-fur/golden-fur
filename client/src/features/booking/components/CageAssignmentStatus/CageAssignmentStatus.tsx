import { useEffect, useState } from 'react';
import { getCageAssignmentStatus } from '../../api/booking.api';
import styles from './CageAssignmentStatus.module.css';

interface CageAssignmentStatusProps {
  accessToken: string;
  branchId: string;
  petId: string;
  petName: string;
}

/**
 * Custom change (cage pet-type support / readonly cage assignment):
 * customer-facing readonly answer to "will my pet have a cage" - unlike
 * CagePickerList (interactive, receptionist-only as of this change), this
 * never lets the viewer pick anything, and deliberately has no
 * selectedSlot/date prop - cage availability is a live status snapshot, not
 * a per-slot check, so this can (and should) render as soon as the pet and
 * branch are known, satisfying the "indicated immediately" requirement.
 */
export function CageAssignmentStatus({
  accessToken,
  branchId,
  petId,
  petName,
}: CageAssignmentStatusProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);
  const [cageLabel, setCageLabel] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

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
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, petId]);

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

  return (
    <p className={styles.noMatchBanner} role="alert">
      No cage is currently available for {petName} at this branch. You can still
      continue - please check with staff before your stay.
    </p>
  );
}
