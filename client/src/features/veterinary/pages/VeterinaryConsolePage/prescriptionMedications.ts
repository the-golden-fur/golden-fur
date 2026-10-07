import type {
  Consultation,
  MedicationInput,
  VetMedicationCatalogItem,
} from '../../veterinary.types';

/** The saved prescription as editable rows - also what Cancel restores. */
export function seedMedications(consultation: Consultation): MedicationInput[] {
  return (consultation.medications ?? []).map((medication) => ({
    name: medication.name,
    dose: medication.dose,
    notes: medication.notes ?? '',
    medicine_type: medication.medicine_type ?? '',
    strength: medication.strength ?? '',
    frequency: medication.frequency ?? '',
    duration: medication.duration ?? '',
    quantity: medication.quantity ?? 1,
    quantity_unit: medication.quantity_unit ?? '',
    refills: medication.refills ?? 0,
    medication_catalog_id: medication.medication_catalog_id ?? null,
  }));
}

/** A cleared Quantity box is "not typed yet", not zero - it goes out as 1,
 * and anything typed is kept to a whole number of at least 1. */
export function withValidQuantities(
  medications: MedicationInput[]
): MedicationInput[] {
  return medications.map((medication) => ({
    ...medication,
    quantity: Math.max(1, Math.round(medication.quantity ?? 1) || 1),
    refills: Math.max(0, Math.round(medication.refills ?? 0) || 0),
  }));
}

/** A typed medicine name as a new prescription row. The name box is free
 * text: a name that is on the shared medicine list - whatever case it was
 * typed in - becomes that list entry, picking up its spelling, type and
 * price; anything else is still prescribed, it just has no price and so
 * can't be sold here. */
export function buildMedication(
  typedName: string,
  catalog: VetMedicationCatalogItem[]
): MedicationInput {
  const name = typedName.trim();
  const item = catalog.find(
    (entry) => entry.name.toLowerCase() === name.toLowerCase()
  );

  return {
    name: item?.name ?? name,
    dose: '',
    notes: '',
    medicine_type: item?.default_medicine_type ?? '',
    strength: '',
    frequency: '',
    duration: '',
    quantity: 1,
    quantity_unit: '',
    refills: 0,
    medication_catalog_id: item?.id ?? null,
  };
}

/** The prescription plus whatever name is still sitting in the add box - a
 * medicine the vet typed but never pressed "Add medicine" for must not be
 * silently dropped when they save. */
export function includePendingMedicine(
  medications: MedicationInput[],
  pendingName: string,
  catalog: VetMedicationCatalogItem[]
): MedicationInput[] {
  return pendingName.trim() === ''
    ? medications
    : [...medications, buildMedication(pendingName, catalog)];
}

/** The first medicine with no dosage - the server refuses one. */
export function findMissingDosage(
  medications: MedicationInput[]
): MedicationInput | undefined {
  return medications.find((medication) => medication.dose.trim() === '');
}
