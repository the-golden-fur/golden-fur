import { useEffect, useState } from 'react';
import { getPetHealthConditions } from '../../../api/customer.api';
import styles from './PetHealthConditionBadge.module.css';

interface PetHealthConditionBadgeProps {
  petId: string;
  accessToken: string;
  /** Bump after a Veterinarian saves a change so the badge re-checks
   * (Issue #78 AC-3 - no stale cache). */
  refreshKey?: number;
}

/**
 * Issue #78: read-only chip on the pet profile, sourced live from
 * pet_health_conditions (recorded/maintained only from the Veterinary
 * console - HealthConditionsField). Renders nothing when there's no row or
 * an empty conditions_text - "no health conditions recorded" is a normal,
 * common state (AC-4), not an error.
 */
export function PetHealthConditionBadge({
  petId,
  accessToken,
  refreshKey = 0,
}: PetHealthConditionBadgeProps) {
  const [conditionsText, setConditionsText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void getPetHealthConditions(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);
      setConditionsText(result.data?.conditions_text ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken, refreshKey]);

  if (isLoading || !conditionsText) {
    return null;
  }

  return (
    <span className={styles.badge} role="status">
      <span className={styles.label}>Health:</span> {conditionsText}
    </span>
  );
}
