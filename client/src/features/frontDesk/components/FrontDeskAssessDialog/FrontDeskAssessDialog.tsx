import { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../../../../shared/providers/ThemeProvider/themeContext';
import type { WeightUnitPreference } from '../../../../shared/providers/ThemeProvider/themeContext';
import {
  toCanonicalKg,
  toDisplayValue,
} from '../../../../shared/utils/petWeight';
import { AssessmentModal } from '../../../booking/components/AssessmentModal/AssessmentModal';
import { getPet, updatePet } from '../../../customers/api/customer.api';
import type {
  Pet,
  PetCoatType,
  PetWeightClass,
} from '../../../customers/customer.types';
import { getPetWeightClassConfiguration } from '../../../maintenance/api/maintenance.api';
import type { PetWeightClassConfiguration } from '../../../maintenance/maintenance.types';

interface FrontDeskAssessDialogProps {
  petId: string;
  accessToken: string;
  onSaved: (petName: string) => void;
  onCancel: () => void;
}

/** Records a pet's weight and coat from the queue - the same popup and save
 * as the Bookings Queue. Saving is what reprices the waiting booking. */
export function FrontDeskAssessDialog({
  petId,
  accessToken,
  onSaved,
  onCancel,
}: FrontDeskAssessDialogProps) {
  const { weightUnit } = useContext(ThemeContext);
  const [pet, setPet] = useState<Pet | null>(null);
  const [cutoffs, setCutoffs] = useState<PetWeightClassConfiguration | null>(
    null
  );
  const [weightKg, setWeightKg] = useState<number | ''>('');
  const [entryUnit, setEntryUnit] = useState<WeightUnitPreference>(weightUnit);
  const [weightClass, setWeightClass] = useState<PetWeightClass | ''>('');
  const [weightClassOverridden, setWeightClassOverridden] = useState(false);
  const [coatType, setCoatType] = useState<PetCoatType | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getPet(petId, accessToken).then((result) => {
      if (!isMounted || !result.data) return;
      const loaded = result.data;
      setPet(loaded);
      setWeightKg(
        loaded.weight_kg != null
          ? toDisplayValue(loaded.weight_kg, weightUnit)
          : ''
      );
      setWeightClass(loaded.weight_class ?? '');
      setCoatType(loaded.coat_type ?? '');
    });
    void getPetWeightClassConfiguration(accessToken).then((result) => {
      if (isMounted && result.data) setCutoffs(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken, weightUnit]);

  async function save() {
    if (weightKg === '' || weightKg <= 0 || !coatType) return;

    setIsSaving(true);
    setError(null);

    const result = await updatePet(petId, accessToken, {
      weight_kg: toCanonicalKg(weightKg, entryUnit),
      coat_type: coatType,
      ...(weightClassOverridden && weightClass
        ? { weight_class: weightClass }
        : {}),
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setError(result.error ?? "Could not save this pet's assessment.");
      return;
    }

    onSaved(result.data.name);
  }

  return (
    <AssessmentModal
      pet={pet}
      weightKg={weightKg}
      onWeightKgChange={setWeightKg}
      entryUnit={entryUnit}
      onEntryUnitChange={setEntryUnit}
      cutoffs={cutoffs}
      weightClass={weightClass}
      onWeightClassChange={setWeightClass}
      weightClassOverridden={weightClassOverridden}
      onWeightClassOverriddenChange={setWeightClassOverridden}
      coatType={coatType}
      onCoatTypeChange={setCoatType}
      isSaving={isSaving}
      error={error}
      completesBooking={false}
      onCancel={onCancel}
      onConfirm={() => void save()}
    />
  );
}
