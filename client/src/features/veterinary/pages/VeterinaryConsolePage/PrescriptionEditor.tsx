import { useId, useState } from 'react';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import {
  FREQUENCY_OPTIONS,
  MEDICINE_TYPE_OPTIONS,
  QUANTITY_UNIT_OPTIONS,
  type MedicationInput,
  type VetMedicationCatalogItem,
} from '../../veterinary.types';
import { buildMedication } from './prescriptionMedications';
import styles from './ConsultationDetailPanel.module.css';

export interface PrescriptionEditorProps {
  medications: MedicationInput[];
  onMedicationsChange: (medications: MedicationInput[]) => void;
  /** True = buying from this branch's pharmacy (billed); false = elsewhere. */
  soldAtPharmacy: boolean;
  onSoldAtPharmacyChange: (soldAtPharmacy: boolean) => void;
  /** The shared medicine list - name suggestions, and where prices come from. */
  medicationCatalog: VetMedicationCatalogItem[];
  /** False renders the prescription read-only. */
  editable: boolean;
  /** Only a Veterinarian is shown list prices. */
  canWrite: boolean;
  /** The medicine transaction has been paid - where it is bought is fixed. */
  medicinePaid: boolean;
  /** Explains that an edit no longer changes the bill (see medicinePaid). */
  showPaidNote: boolean;
  /** The name typed into the add box but not added yet - pass both to read
   * it on save (see includePendingMedicine). Optional. */
  pendingName?: string;
  onPendingNameChange?: (name: string) => void;
}

/**
 * The Prescription section: the medicine rows, the type-a-name box that adds
 * one, and where the medicine will be bought. Shared by the Consultation
 * Details form and the "Prescribe" pop-up that follows a completed visit.
 */
export function PrescriptionEditor({
  medications,
  onMedicationsChange,
  soldAtPharmacy,
  onSoldAtPharmacyChange,
  medicationCatalog,
  editable,
  canWrite,
  medicinePaid,
  showPaidNote,
  pendingName,
  onPendingNameChange,
}: PrescriptionEditorProps) {
  const id = useId();
  // The add box's text lives in the owner when it asks for it (so a save
  // can pick up a name that was typed but not added), here otherwise.
  const [localName, setLocalName] = useState('');
  const newMedicineName = pendingName ?? localName;
  const setNewMedicineName = onPendingNameChange ?? setLocalName;

  function addMedicine() {
    if (!newMedicineName.trim()) return;

    onMedicationsChange([
      ...medications,
      buildMedication(newMedicineName, medicationCatalog),
    ]);
    setNewMedicineName('');
  }

  function updateMedication(index: number, patch: Partial<MedicationInput>) {
    onMedicationsChange(
      medications.map((medication, i) =>
        i === index ? { ...medication, ...patch } : medication
      )
    );
  }

  function removeMedication(index: number) {
    onMedicationsChange(medications.filter((_, i) => i !== index));
  }

  function listPriceOf(medication: MedicationInput): number | null {
    const item = medicationCatalog.find(
      (entry) => entry.id === medication.medication_catalog_id
    );
    return item?.default_price ?? null;
  }

  // Shown for the vet's information only - the server prices the sale
  // itself from the medicine list when it writes the transaction.
  const showsPrices = soldAtPharmacy && canWrite;
  const unpricedMedicines = medications.filter(
    (medication) => listPriceOf(medication) === null
  );
  const medicineTotal = medications.reduce(
    (sum, medication) =>
      sum + (listPriceOf(medication) ?? 0) * (medication.quantity ?? 1),
    0
  );

  return (
    <div className={styles.listSection}>
      <span className={styles.fieldLabel}>Prescription</span>
      {medications.map((medication, index) => (
        <div key={index} className={styles.medicationCard}>
          <div className={styles.medicationRowFields}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Medication</span>
              <span className={styles.readOnlyField}>{medication.name}</span>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Strength</span>
              <input
                className={styles.input}
                placeholder="e.g. 250 mg"
                value={medication.strength ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, { strength: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Dosage</span>
              <input
                className={styles.input}
                placeholder="e.g. 10 mg/kg"
                value={medication.dose}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, { dose: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Route</span>
              <input
                className={styles.input}
                list={`${id}-medicine-type-options`}
                placeholder="e.g. Oral"
                value={medication.medicine_type ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, {
                    medicine_type: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Frequency</span>
              <input
                className={styles.input}
                list={`${id}-frequency-options`}
                placeholder="e.g. Every 12 hours"
                value={medication.frequency ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, {
                    frequency: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Duration</span>
              <input
                className={styles.input}
                placeholder="e.g. 7 days"
                value={medication.duration ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, {
                    duration: event.target.value,
                  })
                }
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Quantity</span>
              <div className={styles.quantityInputs}>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  step={1}
                  placeholder="14"
                  aria-label={`Quantity of ${medication.name}`}
                  value={medication.quantity ?? ''}
                  disabled={!editable}
                  onChange={(event) =>
                    updateMedication(index, {
                      quantity:
                        event.target.value === ''
                          ? undefined
                          : Number(event.target.value),
                    })
                  }
                />
                <input
                  className={styles.input}
                  list={`${id}-quantity-unit-options`}
                  placeholder="capsules"
                  aria-label={`Quantity unit of ${medication.name}`}
                  value={medication.quantity_unit ?? ''}
                  disabled={!editable}
                  onChange={(event) =>
                    updateMedication(index, {
                      quantity_unit: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Refills</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={medication.refills ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, {
                    refills:
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.fieldLabel}>Instructions</span>
              <input
                className={styles.input}
                placeholder="e.g. Give with food"
                value={medication.notes ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  updateMedication(index, { notes: event.target.value })
                }
              />
            </label>
            {showsPrices ? (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Price</span>
                <span className={styles.readOnlyField}>
                  {listPriceOf(medication) !== null
                    ? `${formatCurrency(listPriceOf(medication) ?? 0)} each`
                    : 'No price set'}
                </span>
              </div>
            ) : null}
          </div>
          {editable ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => removeMedication(index)}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <datalist id={`${id}-quantity-unit-options`}>
        {QUANTITY_UNIT_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id={`${id}-medicine-type-options`}>
        {MEDICINE_TYPE_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id={`${id}-frequency-options`}>
        {FREQUENCY_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {editable ? (
        <div className={styles.addMedicineRow}>
          <input
            className={styles.input}
            list={`${id}-medicine-name-options`}
            aria-label="Medicine name"
            placeholder="Type a medicine name, then Add medicine"
            value={newMedicineName}
            onChange={(event) => setNewMedicineName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addMedicine();
              }
            }}
          />
          <datalist id={`${id}-medicine-name-options`}>
            {medicationCatalog.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={newMedicineName.trim() === ''}
            onClick={addMedicine}
          >
            Add medicine
          </button>
        </div>
      ) : null}

      {medications.length > 0 ? (
        <fieldset className={styles.pharmacyChoice}>
          <legend className={styles.fieldLabel}>
            Where will the medicine be bought?
          </legend>
          <label className={styles.checkboxLabel}>
            <input
              type="radio"
              name={`${id}-pharmacy`}
              checked={!soldAtPharmacy}
              disabled={!editable || medicinePaid}
              onChange={() => onSoldAtPharmacyChange(false)}
            />
            Buying from another pharmacy
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="radio"
              name={`${id}-pharmacy`}
              checked={soldAtPharmacy}
              disabled={!editable || medicinePaid}
              onChange={() => onSoldAtPharmacyChange(true)}
            />
            Buying from our pharmacy
          </label>
          {soldAtPharmacy ? (
            <p className={styles.reason}>
              {showsPrices
                ? `Medicine total: ${formatCurrency(medicineTotal)}. `
                : ''}
              Billed to the customer as its own transaction, which the cashier
              collects.
            </p>
          ) : (
            <p className={styles.reason}>
              Nothing is charged for the medicine. The prescription can be
              printed for the customer.
            </p>
          )}
          {showsPrices &&
          editable &&
          !medicinePaid &&
          unpricedMedicines.length > 0 ? (
            <p className={styles.errorBanner} role="status">
              Set a price in My Catalog before selling:{' '}
              {unpricedMedicines
                .map((medication) => medication.name)
                .join(', ')}
              .
            </p>
          ) : null}
          {showPaidNote ? (
            <p className={styles.reason}>
              The medicine for this visit has already been paid. Changes here
              update the medical record only, not the bill.
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
