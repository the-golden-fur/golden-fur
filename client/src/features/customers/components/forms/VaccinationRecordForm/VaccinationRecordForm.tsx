import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createVaccinationRecord,
  updateVaccinationRecord,
} from '../../../api/customer.api';
import type {
  PetVaccinationRecord,
  VaccinationRecordInput,
} from '../../../customer.types';
import { todayDateKey } from '../../../../../shared/utils/isFutureDate';
import styles from './VaccinationRecordForm.module.css';

const ACCEPTED_CARD_TYPES = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_CARD_BYTES = 5 * 1024 * 1024;

interface VaccinationRecordFormProps {
  petId: string;
  accessToken: string;
  /** Set to edit that record; omitted to add a new one. */
  record?: PetVaccinationRecord;
  /** The pet's owner must attach the vaccination card; staff needn't. */
  requireCard: boolean;
  onSaved: (record: PetVaccinationRecord) => void;
  onCancel: () => void;
}

/**
 * Add (or fix) a vaccination the pet already had. From the pet's owner it
 * is saved "Pending verification" with their card photo until staff review
 * it - see vaccinationRecord.service.ts. Information only: it never touches
 * booking.
 */
export function VaccinationRecordForm({
  petId,
  accessToken,
  record,
  requireCard,
  onSaved,
  onCancel,
}: VaccinationRecordFormProps) {
  const [input, setInput] = useState<VaccinationRecordInput>({
    vaccine_name: record?.vaccine_name ?? '',
    date_administered: record?.date_administered ?? '',
    next_due_date: record?.next_due_date ?? '',
    notes: record?.notes ?? '',
    proof: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // An image card gets a preview (createObjectURL is missing in some test
  // environments); the object URL is freed when it changes.
  const previewUrl = useMemo(
    () =>
      input.proof?.type.startsWith('image/') &&
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(input.proof)
        : null,
    [input.proof]
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const today = todayDateKey();
  // Editing keeps the card already on file unless a new one is chosen.
  const needsCard = requireCard && !record;

  function update<K extends keyof VaccinationRecordInput>(
    key: K,
    value: VaccinationRecordInput[K]
  ) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!input.vaccine_name.trim() || !input.date_administered) {
      setError('Enter the vaccine name and the date it was given.');
      return;
    }
    if (input.date_administered > today) {
      setError('The vaccination date cannot be in the future.');
      return;
    }
    if (input.next_due_date && input.next_due_date < input.date_administered) {
      setError('The next due date cannot be before the vaccination date.');
      return;
    }
    if (needsCard && !input.proof) {
      setError('Add a photo of the vaccination card.');
      return;
    }
    if (input.proof && input.proof.size > MAX_CARD_BYTES) {
      setError('The card file must be 5 MB or smaller.');
      return;
    }

    setIsSaving(true);
    const result = record
      ? await updateVaccinationRecord(petId, record.id, accessToken, input)
      : await createVaccinationRecord(petId, accessToken, input);
    setIsSaving(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not save this vaccination.');
      return;
    }

    onSaved(result.data);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      {requireCard ? (
        <p className={styles.copy}>
          The clinic will check your card and mark the record as verified.
        </p>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Vaccine</span>
        <input
          className={styles.input}
          value={input.vaccine_name}
          onChange={(event) => update('vaccine_name', event.target.value)}
          placeholder="e.g. Anti-rabies"
          required
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Date given</span>
          <input
            className={styles.input}
            type="date"
            max={today}
            value={input.date_administered}
            onChange={(event) =>
              update('date_administered', event.target.value)
            }
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Next due (optional)</span>
          <input
            className={styles.input}
            type="date"
            min={input.date_administered || undefined}
            value={input.next_due_date}
            onChange={(event) => update('next_due_date', event.target.value)}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Notes (optional)</span>
        <textarea
          className={styles.input}
          rows={2}
          value={input.notes}
          onChange={(event) => update('notes', event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          {record
            ? 'Replace card photo (optional)'
            : needsCard
              ? 'Vaccination card photo'
              : 'Vaccination card photo (optional)'}
        </span>
        <input
          className={styles.fileInput}
          type="file"
          accept={ACCEPTED_CARD_TYPES}
          onChange={(event) => update('proof', event.target.files?.[0] ?? null)}
        />
        <span className={styles.hint}>PNG, JPG, WEBP or PDF, up to 5 MB.</span>
      </label>

      {previewUrl ? (
        <img
          className={styles.preview}
          src={previewUrl}
          alt="Preview of the vaccination card"
        />
      ) : input.proof ? (
        <p className={styles.copy}>{input.proof.name}</p>
      ) : null}

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button type="submit" className={styles.button} disabled={isSaving}>
          {isSaving ? 'Saving...' : record ? 'Save changes' : 'Add vaccination'}
        </button>
      </div>
    </form>
  );
}
