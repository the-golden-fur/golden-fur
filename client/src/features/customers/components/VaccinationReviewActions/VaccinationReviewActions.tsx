import { useState } from 'react';
import { reviewVaccinationRecord } from '../../api/customer.api';
import type { PetVaccinationRecord } from '../../customer.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import styles from './VaccinationReviewActions.module.css';

const REASON_MAX_LENGTH = 300;

interface VaccinationReviewActionsProps {
  petId: string;
  record: Pick<PetVaccinationRecord, 'id' | 'vaccine_name'>;
  accessToken: string;
  onReviewed: (record: PetVaccinationRecord) => void;
}

/**
 * Staff's Verify / Reject for an owner's pending vaccination record - on
 * the staff pet profile and the Vaccination Review page. Rejecting asks
 * for a reason, which the owner sees. The server notifies the owner either
 * way.
 */
export function VaccinationReviewActions({
  petId,
  record,
  accessToken,
  onReviewed,
}: VaccinationReviewActionsProps) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: 'verify' | 'reject') {
    setIsSaving(true);
    setError(null);
    const result = await reviewVaccinationRecord(
      petId,
      record.id,
      accessToken,
      decision === 'reject' ? { decision, reason: reason.trim() } : { decision }
    );
    setIsSaving(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not save the review.');
      return;
    }

    setIsRejecting(false);
    setReason('');
    onReviewed(result.data);
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.verifyButton}
        onClick={() => void review('verify')}
        disabled={isSaving}
      >
        Verify
      </button>
      <button
        type="button"
        className={styles.rejectButton}
        onClick={() => {
          setError(null);
          setIsRejecting(true);
        }}
        disabled={isSaving}
      >
        Reject
      </button>
      {error && !isRejecting ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        isOpen={isRejecting}
        title={`Reject ${record.vaccine_name}?`}
        body={
          <div className={styles.reasonField}>
            <label
              className={styles.reasonLabel}
              htmlFor={`reason-${record.id}`}
            >
              Reason - the owner will see this
            </label>
            <textarea
              id={`reason-${record.id}`}
              className={styles.reasonInput}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The card photo is too blurry to read the date"
              autoFocus
            />
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Reject record"
        tone="danger"
        isConfirming={isSaving}
        confirmDisabled={reason.trim() === ''}
        onConfirm={() => void review('reject')}
        onCancel={() => {
          setIsRejecting(false);
          setReason('');
          setError(null);
        }}
      />
    </div>
  );
}
