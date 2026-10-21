import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  deleteVaccinationRecord,
  listVaccinationRecords,
} from '../../../api/customer.api';
import type { PetVaccinationRecord } from '../../../customer.types';
import { VaccinationStatusBadge } from '../../badges/VaccinationStatusBadge/VaccinationStatusBadge';
import { VaccinationRecordForm } from '../../forms/VaccinationRecordForm/VaccinationRecordForm';
import { VaccinationReviewActions } from '../../VaccinationReviewActions/VaccinationReviewActions';
import { Modal } from '../../../../../shared/components/Modal/Modal';
import { ConfirmDialog } from '../../../../../shared/components/ConfirmDialog/ConfirmDialog';
import styles from './VaccinationRecordList.module.css';
import { LoadingState } from '../../../../../shared/components/LoadingState/LoadingState';

/** 'owner': the pet's customer - can add records (with a card photo, saved
 * pending) and fix or delete their own unverified ones. 'staff': can add
 * (verified straight away) and verify/reject owners' pending records.
 * 'readonly': just the list. */
export type VaccinationRecordListMode = 'owner' | 'staff' | 'readonly';

interface VaccinationRecordListProps {
  petId: string;
  accessToken: string;
  mode?: VaccinationRecordListMode;
}

/** Newest vaccination first, matching the server's own order. */
function byDateGiven(a: PetVaccinationRecord, b: PetVaccinationRecord) {
  return b.date_administered.localeCompare(a.date_administered);
}

/**
 * A pet's vaccination records with whether the clinic has verified each -
 * on the customer's pet profile and staff's. Customer-reported records
 * (20261021277) show "Pending verification" until staff review them.
 * Information only: nothing in booking reads a record's status.
 */
export function VaccinationRecordList({
  petId,
  accessToken,
  mode = 'readonly',
}: VaccinationRecordListProps) {
  const [records, setRecords] = useState<PetVaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = closed; 'new' = adding; a record = editing it.
  const [formTarget, setFormTarget] = useState<
    PetVaccinationRecord | 'new' | null
  >(null);
  const [recordToDelete, setRecordToDelete] =
    useState<PetVaccinationRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listVaccinationRecords(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setRecords(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  function upsert(saved: PetVaccinationRecord) {
    setRecords((prev) =>
      [...prev.filter((record) => record.id !== saved.id), saved].sort(
        byDateGiven
      )
    );
  }

  function handleSaved(saved: PetVaccinationRecord) {
    const wasEditing = formTarget !== 'new';
    upsert(saved);
    setFormTarget(null);
    setMessage(
      saved.status === 'pending'
        ? wasEditing
          ? 'Saved. The clinic will check it again.'
          : 'Added. The clinic will check your card and verify it.'
        : 'Vaccination saved.'
    );
  }

  async function handleConfirmDelete() {
    if (!recordToDelete) return;

    setIsDeleting(true);
    const result = await deleteVaccinationRecord(
      petId,
      recordToDelete.id,
      accessToken
    );
    setIsDeleting(false);

    if (result.error) {
      setError(result.error);
      setRecordToDelete(null);
      return;
    }

    setRecords((prev) =>
      prev.filter((record) => record.id !== recordToDelete.id)
    );
    setRecordToDelete(null);
    setMessage('Vaccination removed.');
  }

  /** Owners may change only what they added and the clinic hasn't
   * verified (the server enforces the same). */
  function ownerMayChange(record: PetVaccinationRecord) {
    return (
      mode === 'owner' &&
      record.reported_by_customer_id !== null &&
      record.status !== 'verified'
    );
  }

  if (isLoading) {
    return <LoadingState label="Loading vaccination records..." />;
  }

  return (
    <div className={styles.container}>
      {mode !== 'readonly' ? (
        <button
          type="button"
          className={styles.addButton}
          onClick={() => {
            setMessage(null);
            setFormTarget('new');
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add vaccination
        </button>
      ) : null}

      {message ? <p className={styles.successBanner}>{message}</p> : null}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {records.length === 0 ? (
        <p className={styles.copy}>No vaccination records yet.</p>
      ) : (
        <ul className={styles.list}>
          {records.map((record) => (
            <li className={styles.item} key={record.id}>
              <div className={styles.itemHeader}>
                <span className={styles.name}>{record.vaccine_name}</span>
                <VaccinationStatusBadge status={record.status} />
              </div>
              <span className={styles.meta}>
                Administered {record.date_administered}
              </span>
              {record.next_due_date ? (
                <span className={styles.meta}>
                  Next due {record.next_due_date}
                </span>
              ) : null}
              {record.notes ? (
                <span className={styles.meta}>{record.notes}</span>
              ) : null}
              {record.status === 'rejected' && record.rejection_reason ? (
                <span className={styles.rejection}>
                  Not verified: {record.rejection_reason}
                  {mode === 'owner' ? ' - edit the record to send it again.' : ''}
                </span>
              ) : null}

              {record.proof_url ||
              ownerMayChange(record) ||
              (mode === 'staff' && record.status === 'pending') ? (
                <div className={styles.itemActions}>
                  {record.proof_url ? (
                    <a
                      className={styles.link}
                      href={record.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View card
                    </a>
                  ) : null}
                  {ownerMayChange(record) ? (
                    <>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => {
                          setMessage(null);
                          setFormTarget(record);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.textButtonDanger}
                        onClick={() => {
                          setMessage(null);
                          setRecordToDelete(record);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  {mode === 'staff' && record.status === 'pending' ? (
                    <VaccinationReviewActions
                      petId={petId}
                      record={record}
                      accessToken={accessToken}
                      onReviewed={(reviewed) => {
                        upsert(reviewed);
                        setMessage(
                          reviewed.status === 'verified'
                            ? `${reviewed.vaccine_name} verified. The owner has been notified.`
                            : `${reviewed.vaccine_name} rejected. The owner has been notified.`
                        );
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={formTarget !== null}
        title={formTarget === 'new' ? 'Add a vaccination' : 'Edit vaccination'}
        onClose={() => setFormTarget(null)}
        closeOnBackdropClick={false}
      >
        {formTarget !== null ? (
          <VaccinationRecordForm
            petId={petId}
            accessToken={accessToken}
            record={formTarget === 'new' ? undefined : formTarget}
            requireCard={mode === 'owner'}
            onSaved={handleSaved}
            onCancel={() => setFormTarget(null)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={recordToDelete !== null}
        title={`Delete ${recordToDelete?.vaccine_name ?? 'vaccination'}?`}
        body={<p className={styles.copy}>This removes the record and its card photo.</p>}
        confirmLabel="Delete"
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setRecordToDelete(null)}
      />
    </div>
  );
}
