import { useContext, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from '../../../../shared/providers/ThemeProvider/themeContext';
import type { WeightUnitPreference } from '../../../../shared/providers/ThemeProvider/themeContext';
import { getPetWeightClassConfiguration } from '../../../maintenance/api/maintenance.api';
import type { PetWeightClassConfiguration } from '../../../maintenance/maintenance.types';
import { deriveWeightClass } from '../../../maintenance/utils/deriveWeightClass';
import {
  toCanonicalKg,
  toDisplayValue,
  weightUnitLabel,
} from '../../../../shared/utils/petWeight';
import {
  weightLimitMessage,
  weightLimitsFrom,
} from '../../../maintenance/utils/petWeightLimits';
import type { PetWeightClass } from '../../customer.types';
import styles from './PetWeightAssessmentFields.module.css';

const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const ENTRY_UNITS: WeightUnitPreference[] = ['kg', 'lbs'];

export interface PetWeightAssessmentFieldsProps {
  accessToken: string;
  /** The pet's stored weight in canonical kilograms, or null if unrecorded -
   * seeds the input once (in the viewer's unit). */
  initialKg: number | null;
  /** Canonical kilograms as the staff member edits, or null when the input is
   * cleared. */
  onCanonicalKgChange: (kg: number | null) => void;
  weightClass: PetWeightClass | '';
  onWeightClassChange: (value: PetWeightClass | '') => void;
  overridden: boolean;
  onOverriddenChange: (overridden: boolean) => void;
  /** Pet weight limits: told the out-of-range message (or null once it's
   * fixed) so the host form can refuse to save - the message is also shown
   * inline under the weight field. */
  onWeightLimitErrorChange?: (message: string | null) => void;
  /** Styling hooks so this drops into each host form's own field layout. */
  fieldClassName: string;
  labelClassName: string;
  inputClassName: string;
}

/**
 * Shared staff-only weight capture used by PetForm and PetDetailPanel
 * (Architectural-Change-History): a numeric weight + kg/lb entry-unit toggle,
 * a read-only weight class derived from that weight via the Admin-configured
 * cut-offs, and an "override" checkbox for the unusual pet a receptionist
 * re-classes by hand. AssessmentModal has its own inline copy of this
 * interaction, matching the "kept local" precedent in that file.
 */
export function PetWeightAssessmentFields({
  accessToken,
  initialKg,
  onCanonicalKgChange,
  weightClass,
  onWeightClassChange,
  overridden,
  onOverriddenChange,
  onWeightLimitErrorChange,
  fieldClassName,
  labelClassName,
  inputClassName,
}: PetWeightAssessmentFieldsProps) {
  const { weightUnit } = useContext(ThemeContext);
  // Seeded from the account preference at mount; the field's own label always
  // names this unit, so it stays self-consistent even if the preference
  // resolves later. Staff can switch it explicitly with the toggle below.
  const [entryUnit, setEntryUnit] = useState<WeightUnitPreference>(weightUnit);
  const [rawValue, setRawValue] = useState<string>(() =>
    initialKg != null ? String(toDisplayValue(initialKg, weightUnit)) : ''
  );
  const [cutoffs, setCutoffs] = useState<PetWeightClassConfiguration | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;
    void getPetWeightClassConfiguration(accessToken)
      .then((result) => {
        if (isMounted && result.data) setCutoffs(result.data);
      })
      .catch(() => {
        // Non-fatal: without cut-offs the class just can't be derived live;
        // the server still derives it on save.
      });
    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const canonicalKg = useMemo(() => {
    if (rawValue === '') return null;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return toCanonicalKg(parsed, entryUnit);
  }, [rawValue, entryUnit]);

  useEffect(() => {
    onCanonicalKgChange(canonicalKg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalKg]);

  // Pet weight limits (Superadmin-set on the same config row as the cut-offs;
  // the default range until it loads). Any entered weight that can't be
  // recorded - out of range, zero, negative - is flagged as it's typed; the
  // server re-checks on save either way.
  const weightLimits = weightLimitsFrom(cutoffs);
  const limitMessage =
    rawValue === ''
      ? null
      : weightLimitMessage(
          toCanonicalKg(Number(rawValue), entryUnit),
          weightLimits,
          entryUnit
        );

  useEffect(() => {
    onWeightLimitErrorChange?.(limitMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitMessage]);

  const derivedClass =
    canonicalKg !== null && cutoffs
      ? deriveWeightClass(canonicalKg, cutoffs)
      : '';
  const hasWeight = canonicalKg !== null;
  const canDerive = cutoffs !== null;
  const selectDisabled = hasWeight && canDerive && !overridden;
  const selectValue = overridden || !canDerive ? weightClass : derivedClass;

  const changeEntryUnit = (unit: WeightUnitPreference) => {
    // Keep the same real weight - reinterpret the visible number into the new
    // unit so "5" doesn't silently become a different pet.
    if (canonicalKg !== null) {
      setRawValue(String(toDisplayValue(canonicalKg, unit)));
    }
    setEntryUnit(unit);
  };

  return (
    <>
      <label className={fieldClassName}>
        <span className={labelClassName}>
          Weight ({weightUnitLabel(entryUnit)}) - optional, leave blank if not
          yet weighed
        </span>
        <input
          className={`${inputClassName} ${
            limitMessage ? styles.inputInvalid : ''
          }`}
          type="number"
          min={toDisplayValue(weightLimits.min_weight_kg, entryUnit)}
          max={toDisplayValue(weightLimits.max_weight_kg, entryUnit)}
          step="0.01"
          inputMode="decimal"
          aria-invalid={limitMessage ? true : undefined}
          aria-describedby={limitMessage ? 'pet-weight-error' : undefined}
          value={rawValue}
          onChange={(event) => setRawValue(event.target.value)}
        />
        {limitMessage ? (
          <span
            className={styles.fieldError}
            id="pet-weight-error"
            role="alert"
          >
            {limitMessage}
          </span>
        ) : null}
      </label>

      <div
        className={fieldClassName}
        role="radiogroup"
        aria-label="Weight entry unit"
      >
        <span className={labelClassName}>Entered in</span>
        <div className={styles.inlineOptions}>
          {ENTRY_UNITS.map((unit) => (
            <label key={unit}>
              <input
                type="radio"
                name="pet-weight-entry-unit"
                checked={entryUnit === unit}
                onChange={() => changeEntryUnit(unit)}
              />
              {weightUnitLabel(unit)}
            </label>
          ))}
        </div>
      </div>

      <label className={fieldClassName}>
        <span className={labelClassName}>Weight class</span>
        <select
          className={inputClassName}
          value={selectValue}
          disabled={selectDisabled}
          onChange={(event) =>
            onWeightClassChange(event.target.value as PetWeightClass | '')
          }
        >
          <option value="">Not yet assessed</option>
          {WEIGHT_CLASS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {hasWeight ? (
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={overridden}
            onChange={(event) => {
              onOverriddenChange(event.target.checked);
              if (event.target.checked && derivedClass) {
                onWeightClassChange(derivedClass);
              }
            }}
          />
          <span className={styles.hint}>Override the derived weight class</span>
        </label>
      ) : null}
    </>
  );
}
