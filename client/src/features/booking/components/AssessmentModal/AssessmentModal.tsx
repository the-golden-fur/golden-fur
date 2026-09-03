import type {
  Pet,
  PetCoatType,
  PetWeightClass,
} from '../../../customers/customer.types';
import styles from './AssessmentModal.module.css';

// Same option lists as PetDetailPanel's/PetForm's staff-only assessment
// fields - kept local rather than centralized, matching that established
// precedent (see PetDetailPanel.tsx/PetForm.tsx).
const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPE_OPTIONS: PetCoatType[] = ['SC', 'LC'];

export interface AssessmentModalProps {
  /** The pet being assessed, if already known - used only for the display
   * name in the body copy; null/undefined falls back to "This pet". */
  pet: Pet | null | undefined;
  weightClass: PetWeightClass | '';
  onWeightClassChange: (value: PetWeightClass | '') => void;
  coatType: PetCoatType | '';
  onCoatTypeChange: (value: PetCoatType | '') => void;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Extracted from the inline "Save & Start" modal that used to live directly
 * in ReceptionistBookingsQueuePage (folded back from the deleted Payments
 * Queue). Now used by AssessmentQueuePage: starting an Initial Assessment /
 * Reassessment booking records the pet's weight class + coat type first.
 */
export function AssessmentModal({
  pet,
  weightClass,
  onWeightClassChange,
  coatType,
  onCoatTypeChange,
  isSaving,
  error,
  onCancel,
  onConfirm,
}: AssessmentModalProps) {
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        className={styles.modalDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assess-pet-title"
      >
        <h2 id="assess-pet-title" className={styles.modalTitle}>
          Record pet assessment
        </h2>
        <p className={styles.modalBody}>
          {pet?.name ?? 'This pet'}&apos;s weight class and coat type are
          recorded as part of starting this booking. Starting will save the
          assessment first.
        </p>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Weight class</span>
          <select
            className={styles.filterSelect}
            value={weightClass}
            onChange={(event) =>
              onWeightClassChange(event.target.value as PetWeightClass | '')
            }
          >
            <option value="">Select weight class</option>
            {WEIGHT_CLASS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Coat type</span>
          <select
            className={styles.filterSelect}
            value={coatType}
            onChange={(event) =>
              onCoatTypeChange(event.target.value as PetCoatType | '')
            }
          >
            <option value="">Select coat type</option>
            {COAT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!weightClass || !coatType || isSaving}
            onClick={onConfirm}
          >
            {isSaving ? 'Saving...' : 'Save & Start'}
          </button>
        </div>
      </section>
    </div>
  );
}
