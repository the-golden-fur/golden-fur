import type {
  Pet,
  PetCoatType,
  PetWeightClass,
} from '../../../customers/customer.types';
import {
  PET_COAT_TYPES,
  PET_COAT_TYPE_LABEL,
} from '../../../customers/customer.types';
import type { WeightUnitPreference } from '../../../../shared/providers/ThemeProvider/themeContext';
import {
  deriveWeightClass,
  type WeightClassCutoffs,
} from '../../../maintenance/utils/deriveWeightClass';
import {
  toCanonicalKg,
  toDisplayValue,
  weightUnitLabel,
} from '../../../../shared/utils/petWeight';
import {
  weightLimitMessage,
  weightLimitsFrom,
  type PetWeightLimits,
} from '../../../maintenance/utils/petWeightLimits';
import styles from './AssessmentModal.module.css';

// Same option lists as PetDetailPanel's/PetForm's staff-only assessment
// fields - kept local rather than centralized, matching that established
// precedent (see PetDetailPanel.tsx/PetForm.tsx).
const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPE_OPTIONS: PetCoatType[] = PET_COAT_TYPES;

// Display labels only - the option values (and what's saved) stay the
// short codes the database stores.
const WEIGHT_CLASS_LABEL: Record<PetWeightClass, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra large',
};
const COAT_TYPE_LABEL = PET_COAT_TYPE_LABEL;
const ENTRY_UNITS: WeightUnitPreference[] = ['kg', 'lbs'];

export interface AssessmentModalProps {
  /** The pet being assessed, if already known - used only for the display
   * name in the body copy; null/undefined falls back to "This pet". */
  pet: Pet | null | undefined;
  /** Numeric weight the staff member typed, in `entryUnit`. '' = not entered. */
  weightKg: number | '';
  onWeightKgChange: (value: number | '') => void;
  /** The unit the number above is entered in - defaults to the viewer's
   * preference, not persisted. */
  entryUnit: WeightUnitPreference;
  onEntryUnitChange: (unit: WeightUnitPreference) => void;
  /** The admin-configured S/M/L/XL cut-offs - and, from the same config row,
   * the recordable weight range (pet weight limits); null until loaded. */
  cutoffs: (WeightClassCutoffs & Partial<PetWeightLimits>) | null;
  /** Only used when `weightClassOverridden` - the manual class choice. */
  weightClass: PetWeightClass | '';
  onWeightClassChange: (value: PetWeightClass | '') => void;
  weightClassOverridden: boolean;
  onWeightClassOverriddenChange: (overridden: boolean) => void;
  coatType: PetCoatType | '';
  onCoatTypeChange: (value: PetCoatType | '') => void;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** Bookings Queue (book before assessment): false when saving only records
   * the assessment - it does not complete the booking. The button reads
   * Save and the copy says the booking gets its final price instead.
   * Defaults to true (the Assessment Queue). */
  completesBooking?: boolean;
}

/**
 * Used by AssessmentQueuePage: clicking an Assessment row opens this modal to
 * record the pet's weight and coat type; Confirm saves the assessment and
 * carries the booking straight through to Completed. The weight class is
 * derived from the recorded weight via the Admin-configured cut-offs
 * (Architectural-Change-History) and shown read-only, with an override for
 * the unusual pet a receptionist re-classes by hand.
 */
export function AssessmentModal({
  pet,
  weightKg,
  onWeightKgChange,
  entryUnit,
  onEntryUnitChange,
  cutoffs,
  weightClass,
  onWeightClassChange,
  weightClassOverridden,
  onWeightClassOverriddenChange,
  coatType,
  onCoatTypeChange,
  isSaving,
  error,
  onCancel,
  onConfirm,
  completesBooking = true,
}: AssessmentModalProps) {
  const hasWeight = weightKg !== '' && weightKg > 0;
  const canonicalKg = hasWeight ? toCanonicalKg(weightKg, entryUnit) : null;
  const derivedClass =
    canonicalKg !== null && cutoffs
      ? deriveWeightClass(canonicalKg, cutoffs)
      : '';
  // When the cut-offs haven't loaded, fall back to a plain manual picker
  // rather than a disabled empty select.
  const canDerive = cutoffs !== null;
  const classSelectDisabled = hasWeight && canDerive && !weightClassOverridden;
  const classSelectValue =
    weightClassOverridden || !canDerive ? weightClass : derivedClass;

  // Pet weight limits: any entered weight that can't be recorded (out of
  // range, zero or negative) is highlighted with an "Invalid weight" message
  // as it's typed and can't be saved. Falls back to the default range until
  // the config loads; the server re-checks on save.
  const weightLimits = weightLimitsFrom(cutoffs);
  const limitMessage =
    weightKg === ''
      ? null
      : weightLimitMessage(
          toCanonicalKg(weightKg, entryUnit),
          weightLimits,
          entryUnit
        );

  // Switching kg<->lb reinterprets the number already typed so the real
  // weight the receptionist is recording doesn't silently change.
  const changeEntryUnit = (unit: WeightUnitPreference) => {
    if (canonicalKg !== null) {
      onWeightKgChange(toDisplayValue(canonicalKg, unit));
    }
    onEntryUnitChange(unit);
  };

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
          Record {pet?.name ?? 'this pet'}&apos;s weight and coat type. The
          weight class is worked out from the weight.{' '}
          {completesBooking
            ? 'Confirming saves the assessment and completes this booking.'
            : "Saving records the assessment and sets the booking's final price."}
        </p>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>
            Weight ({weightUnitLabel(entryUnit)})
          </span>
          <input
            className={`${styles.filterSelect} ${
              limitMessage ? styles.inputInvalid : ''
            }`}
            type="number"
            min={toDisplayValue(weightLimits.min_weight_kg, entryUnit)}
            max={toDisplayValue(weightLimits.max_weight_kg, entryUnit)}
            step="0.01"
            inputMode="decimal"
            aria-invalid={limitMessage ? true : undefined}
            aria-describedby={
              limitMessage ? 'assessment-weight-error' : undefined
            }
            value={weightKg}
            onChange={(event) =>
              onWeightKgChange(
                event.target.value === '' ? '' : Number(event.target.value)
              )
            }
          />
          {limitMessage ? (
            <span
              className={styles.fieldError}
              id="assessment-weight-error"
              role="alert"
            >
              {limitMessage}
            </span>
          ) : null}
        </label>

        <div
          className={styles.filterField}
          role="radiogroup"
          aria-label="Weight entry unit"
        >
          <span className={styles.filterLabel}>Entered in</span>
          <div className={styles.inlineOptions}>
            {ENTRY_UNITS.map((unit) => (
              <label key={unit}>
                <input
                  type="radio"
                  name="assessment-entry-unit"
                  checked={entryUnit === unit}
                  onChange={() => changeEntryUnit(unit)}
                />
                {weightUnitLabel(unit)}
              </label>
            ))}
          </div>
        </div>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Weight class</span>
          <select
            className={styles.filterSelect}
            value={classSelectValue}
            disabled={classSelectDisabled}
            onChange={(event) =>
              onWeightClassChange(event.target.value as PetWeightClass | '')
            }
          >
            <option value="">Select weight class</option>
            {WEIGHT_CLASS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {WEIGHT_CLASS_LABEL[option]}
              </option>
            ))}
          </select>
        </label>

        {hasWeight ? (
          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={weightClassOverridden}
              onChange={(event) => {
                onWeightClassOverriddenChange(event.target.checked);
                if (event.target.checked && derivedClass) {
                  onWeightClassChange(derivedClass);
                }
              }}
            />
            <span className={styles.derivedHint}>
              Override the derived weight class
            </span>
          </label>
        ) : null}

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
                {COAT_TYPE_LABEL[option]}
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
            disabled={
              !hasWeight ||
              limitMessage !== null ||
              !classSelectValue ||
              !coatType ||
              isSaving
            }
            onClick={onConfirm}
          >
            {isSaving ? 'Saving...' : completesBooking ? 'Confirm' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  );
}
