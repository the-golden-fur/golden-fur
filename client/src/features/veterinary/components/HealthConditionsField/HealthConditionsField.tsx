import { useEffect, useState } from 'react';
import { getPetHealthConditions } from '../../../customers/api/customer.api';
import { upsertPetHealthConditions } from '../../api/veterinary.api';
import styles from './HealthConditionsField.module.css';

interface HealthConditionsFieldProps {
  petId: string;
  accessToken: string;
  disabled?: boolean;
}

/**
 * Issue #78: lets a Veterinarian record/update a pet's current known health
 * conditions as part of a consultation - moved here from the general-purpose
 * pet profile (M02). Any Veterinarian-role staff member may edit any Makati
 * pet's record (no per-pet assigned-vet restriction, matching the existing
 * consultations pattern) - enforced server-side (RLS + service), not here.
 */
export function HealthConditionsField({
  petId,
  accessToken,
  disabled = false,
}: HealthConditionsFieldProps) {
  const [conditionsText, setConditionsText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getPetHealthConditions(petId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);
      setConditionsText(result.data?.conditions_text ?? '');
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);

    const result = await upsertPetHealthConditions(
      petId,
      accessToken,
      conditionsText.trim() ? conditionsText.trim() : null
    );

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSavedMessage('Health conditions updated.');
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>Known health conditions</span>
      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : (
        <>
          <textarea
            className={styles.textarea}
            value={conditionsText}
            disabled={disabled}
            placeholder="e.g. Seasonal allergies, chronic hip dysplasia"
            onChange={(event) => setConditionsText(event.target.value)}
          />
          {error ? (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p className={styles.savedBanner}>{savedMessage}</p>
          ) : null}
          {!disabled ? (
            <button
              type="button"
              className={styles.button}
              disabled={isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving...' : 'Save health conditions'}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
