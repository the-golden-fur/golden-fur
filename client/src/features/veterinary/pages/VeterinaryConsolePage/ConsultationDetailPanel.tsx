import { useEffect, useState, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import { GripVertical } from 'lucide-react';
import { PrescriptionPrintout } from '../../../../shared/components/PrescriptionPrintout/PrescriptionPrintout';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import { FINISHED_BOOKING_STATUSES } from '../../../booking/booking.types';
import { listPetPrescriptions } from '../../../customers/api/customer.api';
import type { PetPrescriptionHistoryEntry } from '../../../customers/customer.types';
import { HealthConditionsField } from '../../components/HealthConditionsField/HealthConditionsField';
import {
  listConsultationFormTemplates,
  listMedicationCatalog,
  listPrescriptionTemplates,
} from '../../api/veterinary.api';
import {
  FREQUENCY_OPTIONS,
  MEDICINE_TYPE_OPTIONS,
  type Consultation,
  type ConsultationFormResponse,
  type ConsultationFormTemplate,
  type ConsultationMedication,
  type MedicationInput,
  type VetMedicationCatalogItem,
  type VetPrescriptionTemplate,
} from '../../veterinary.types';
import { FormTemplatePicker } from './FormTemplatePicker';
import styles from './ConsultationDetailPanel.module.css';

export interface ConsultationDetailPanelProps {
  consultation: Consultation;
  petName: string;
  ownerName: string;
  accessToken: string;
  canWrite: boolean;
  isSaving: boolean;
  saveError: string | null;
  onStart: () => void;
  onComplete: (fields: {
    diagnosis: string;
    medications: MedicationInput[];
    /** True = the customer is buying the medicine from this branch's
     * pharmacy (billed as its own transaction); false = somewhere else. */
    soldAtPharmacy: boolean;
    formResponses: ConsultationFormResponse[];
    vaccination?: {
      vaccine_name: string;
      date_administered: string;
      next_due_date?: string;
      notes?: string;
    };
  }) => void;
  /** Pharmacy prescriptions: whether this viewer may still correct a
   * Completed visit's diagnosis and prescription - only the vet who handled
   * it (see VeterinaryConsolePage). */
  canEditRecord: boolean;
  /** Saves an edit to a Completed visit. Resolves true when it was saved,
   * so the panel knows to leave edit mode. */
  onSaveRecord: (fields: {
    diagnosis: string;
    medications: MedicationInput[];
    soldAtPharmacy: boolean;
  }) => Promise<boolean>;
  /** Vet-priced visits: opens the Schedule follow-up form for this visit
   * (hosted by VeterinaryConsolePage). Offered to the same vet who may edit
   * the record, once per visit. */
  onScheduleFollowUp: () => void;
}

/** #117: build a fresh, empty ConsultationFormResponse from a saved template
 * - one field per template field, all values start empty/false/null
 * depending on the field's type. Custom change: a 'prescription' field
 * starts as an empty medication list, filled in the same way as the
 * form field's own add-from-catalog / add-from-saved-prescription
 * controls below (the top-level Prescription section has since become a
 * typed-in medicine box instead - see addMedicine). */
function buildEmptyResponse(
  template: ConsultationFormTemplate
): ConsultationFormResponse {
  return {
    template_id: template.id,
    template_name: template.name,
    filled_at: new Date().toISOString(),
    fields: template.fields.map((field) => ({
      field_id: field.id,
      label: field.label,
      type: field.type,
      value:
        field.type === 'checkbox'
          ? false
          : field.type === 'prescription'
            ? []
            : '',
    })),
  };
}

/** The saved prescription as editable rows - also what Cancel restores. */
function seedMedications(consultation: Consultation): MedicationInput[] {
  return (consultation.medications ?? []).map((medication) => ({
    name: medication.name,
    dose: medication.dose,
    notes: medication.notes ?? '',
    medicine_type: medication.medicine_type ?? '',
    frequency: medication.frequency ?? '',
    duration: medication.duration ?? '',
    quantity: medication.quantity ?? 1,
    medication_catalog_id: medication.medication_catalog_id ?? null,
  }));
}

/** A cleared Quantity box is "not typed yet", not zero - it goes out as 1,
 * and anything typed is kept to a whole number of at least 1. */
function withValidQuantities(
  medications: MedicationInput[]
): MedicationInput[] {
  return medications.map((medication) => ({
    ...medication,
    quantity: Math.max(1, Math.round(medication.quantity ?? 1) || 1),
  }));
}

function asMedicationList(
  value: ConsultationFormResponse['fields'][number]['value']
): ConsultationMedication[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Issue #70: consultation form (medications/results/vaccination sub-section)
 * and follow-up scheduling. Pet History moved out to the "My Patients" page.
 *
 * #117: the Procedures section is removed. Medications is now a real
 * Prescription Builder, and a Results section lets a vet fill in any of
 * their own reusable consultation-form templates.
 *
 * Custom change: vitals (temperature/weight/heart rate/respiratory rate)
 * and diagnosis are no longer fixed fields on this form - they're just
 * another consultation form template now (see the "General Consultation"
 * default template seeded in My Catalog > Forms). A form is added to a
 * visit from the Results section's own picker - the "Choose consultation
 * form(s)" popup that used to open on a fresh consultation was removed.
 *
 * Pharmacy prescriptions: Diagnosis is a fixed field again (saved to the
 * visit itself, so My Patients can show it). Each prescribed medicine has a
 * quantity and no typed-in price - the vet says where the customer is
 * buying: "another pharmacy" (the default - a medical record only, nothing
 * billed) or "our pharmacy" (billed as its own transaction, priced from the
 * shared medicine list). A Completed visit's diagnosis and prescription can
 * still be corrected by the vet who handled it ("Edit record"), and its
 * prescription can be printed for buying elsewhere.
 */
export function ConsultationDetailPanel({
  consultation,
  petName,
  ownerName,
  accessToken,
  canWrite,
  isSaving,
  saveError,
  onStart,
  onComplete,
  canEditRecord,
  onSaveRecord,
  onScheduleFollowUp,
}: ConsultationDetailPanelProps) {
  // Lazy initial state seeded from the selected consultation. The parent
  // renders this component with key={consultation.id} (VeterinaryConsolePage),
  // so React remounts - and re-seeds all of this state fresh - whenever a
  // different consultation is selected, with no synchronizing effect needed.
  const [medications, setMedications] = useState<MedicationInput[]>(() =>
    seedMedications(consultation)
  );
  const [diagnosis, setDiagnosis] = useState(consultation.diagnosis ?? '');
  const [soldAtPharmacy, setSoldAtPharmacy] = useState(
    consultation.sold_at_pharmacy ?? false
  );
  const [newMedicineName, setNewMedicineName] = useState('');
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [printing, setPrinting] = useState<PetPrescriptionHistoryEntry | null>(
    null
  );
  const [printError, setPrintError] = useState<string | null>(null);
  const [formResponses, setFormResponses] = useState<
    ConsultationFormResponse[]
  >(() => consultation.form_responses ?? []);
  const [draggedResponseIndex, setDraggedResponseIndex] = useState<
    number | null
  >(null);
  const [vaccineName, setVaccineName] = useState('');
  const [vaccineDate, setVaccineDate] = useState('');

  const [medicationCatalog, setMedicationCatalog] = useState<
    VetMedicationCatalogItem[]
  >([]);
  const [prescriptionTemplates, setPrescriptionTemplates] = useState<
    VetPrescriptionTemplate[]
  >([]);
  const [formTemplates, setFormTemplates] = useState<
    ConsultationFormTemplate[]
  >([]);

  // The catalog/template read endpoints are Veterinarian-only (owner-
  // scoped), same as the write actions this whole form already gates on
  // `canWrite` - a non-Veterinarian viewer would just get a 403, so don't
  // bother fetching.
  useEffect(() => {
    if (!canWrite) return;

    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(accessToken),
      listPrescriptionTemplates(accessToken),
      listConsultationFormTemplates(accessToken),
    ]).then(([medicationResult, prescriptionResult, templateResult]) => {
      if (!isMounted) return;
      if (medicationResult.data) setMedicationCatalog(medicationResult.data);
      if (prescriptionResult.data) {
        setPrescriptionTemplates(prescriptionResult.data);
      }
      if (templateResult.data) setFormTemplates(templateResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, canWrite]);

  /** The Prescription section's medicine box is free text: the vet types
   * any medicine name (the shared medicine list is offered as suggestions).
   * A name that is on the list - whatever case it was typed in - becomes
   * that list entry, picking up its spelling, type and price; anything else
   * is still prescribed, it just has no price and so can't be sold here. */
  function addMedicine() {
    const name = newMedicineName.trim();
    if (!name) return;

    const item = medicationCatalog.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase()
    );

    setMedications((prev) => [
      ...prev,
      {
        name: item?.name ?? name,
        dose: '',
        notes: '',
        medicine_type: item?.default_medicine_type ?? '',
        frequency: '',
        duration: '',
        quantity: 1,
        medication_catalog_id: item?.id ?? null,
      },
    ]);
    setNewMedicineName('');
  }

  function updateMedication(index: number, patch: Partial<MedicationInput>) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === index ? { ...medication, ...patch } : medication
      )
    );
  }

  function removeMedication(index: number) {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  }

  function addResponseFromTemplate(templateId: string) {
    const template = formTemplates.find((entry) => entry.id === templateId);
    if (!template) return;

    setFormResponses((prev) => [...prev, buildEmptyResponse(template)]);
  }

  function updateResponseFieldValue(
    responseIndex: number,
    fieldIndex: number,
    value: string | number | boolean | null | ConsultationMedication[]
  ) {
    setFormResponses((prev) =>
      prev.map((response, i) =>
        i === responseIndex
          ? {
              ...response,
              fields: response.fields.map((field, j) =>
                j === fieldIndex ? { ...field, value } : field
              ),
            }
          : response
      )
    );
  }

  function removeResponse(index: number) {
    setFormResponses((prev) => prev.filter((_, i) => i !== index));
  }

  // Custom change: "support draggable form components once they're added to
  // the current consultation" - a result card's own drag handle reorders
  // formResponses, same native drag/drop idiom DataBoard already uses for
  // column reordering (handle starts the drag, the whole card is the drop
  // target so dropping anywhere on it - not just its handle - works).
  function handleResponseDragStart(index: number) {
    return () => setDraggedResponseIndex(index);
  }

  function handleResponseDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  function handleResponseDrop(index: number) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setFormResponses((prev) => {
        if (draggedResponseIndex === null || draggedResponseIndex === index) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(draggedResponseIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDraggedResponseIndex(null);
    };
  }

  /** Custom change: "a custom field in form builder, where you can insert a
   * prescription field" - a 'prescription'-type Results field fills in with
   * its own editable medication list, using the exact same add-from-
   * catalog/add-from-saved-prescription actions as the top-level
   * Prescription section (see addMedicationFromCatalog/
   * addMedicationsFromPrescriptionTemplate above), just scoped to one
   * field's value instead of the top-level `medications` state. */
  function addCatalogMedicationToField(
    responseIndex: number,
    fieldIndex: number,
    itemId: string
  ) {
    const item = medicationCatalog.find((entry) => entry.id === itemId);
    if (!item) return;

    updateResponseFieldValue(responseIndex, fieldIndex, [
      ...asMedicationList(
        formResponses[responseIndex].fields[fieldIndex].value
      ),
      {
        name: item.name,
        dose: '',
        notes: '',
        medicine_type: item.default_medicine_type ?? '',
        frequency: '',
        duration: '',
      },
    ]);
  }

  function addPrescriptionTemplateToField(
    responseIndex: number,
    fieldIndex: number,
    templateId: string
  ) {
    const template = prescriptionTemplates.find(
      (entry) => entry.id === templateId
    );
    if (!template) return;

    updateResponseFieldValue(responseIndex, fieldIndex, [
      ...asMedicationList(
        formResponses[responseIndex].fields[fieldIndex].value
      ),
      ...template.items.map((item) => ({
        name: item.name,
        dose: item.dose,
        notes: '',
        medicine_type: item.medicine_type ?? '',
        frequency: item.frequency,
        duration: item.duration ?? '',
      })),
    ]);
  }

  function updateFieldMedication(
    responseIndex: number,
    fieldIndex: number,
    medicationIndex: number,
    patch: Partial<ConsultationMedication>
  ) {
    const medications = asMedicationList(
      formResponses[responseIndex].fields[fieldIndex].value
    );
    updateResponseFieldValue(
      responseIndex,
      fieldIndex,
      medications.map((medication, i) =>
        i === medicationIndex ? { ...medication, ...patch } : medication
      )
    );
  }

  function removeFieldMedication(
    responseIndex: number,
    fieldIndex: number,
    medicationIndex: number
  ) {
    const medications = asMedicationList(
      formResponses[responseIndex].fields[fieldIndex].value
    );
    updateResponseFieldValue(
      responseIndex,
      fieldIndex,
      medications.filter((_, i) => i !== medicationIndex)
    );
  }

  // Custom change: exclude form templates already added to this visit's
  // results, so the Results section's picker can't add the same template's
  // results twice.
  const availableFormTemplates = formTemplates.filter(
    (template) =>
      !formResponses.some((response) => response.template_id === template.id)
  );

  function handleComplete() {
    onComplete({
      diagnosis,
      medications: withValidQuantities(medications),
      soldAtPharmacy,
      formResponses,
      vaccination:
        vaccineName && vaccineDate
          ? { vaccine_name: vaccineName, date_administered: vaccineDate }
          : undefined,
    });
  }

  async function handleSaveRecord() {
    const saved = await onSaveRecord({
      diagnosis,
      medications: withValidQuantities(medications),
      soldAtPharmacy,
    });

    if (saved) setIsEditingRecord(false);
  }

  function cancelEditRecord() {
    setDiagnosis(consultation.diagnosis ?? '');
    setMedications(seedMedications(consultation));
    setSoldAtPharmacy(consultation.sold_at_pharmacy ?? false);
    setIsEditingRecord(false);
  }

  /** Prints the saved prescription. The sheet's letterhead (branch, vet) and
   * the pet/owner names come from the same per-pet prescription history the
   * customer's own Print button uses, so both print the identical sheet. */
  async function handlePrintPrescription() {
    setPrintError(null);

    const result = await listPetPrescriptions(consultation.pet_id, accessToken);
    const entry = result.data?.find(
      (candidate) => candidate.consultation_id === consultation.id
    );

    if (!entry) {
      setPrintError(
        result.error ?? 'Could not load this prescription for printing.'
      );
      return;
    }

    // The sheet has to be in the page before the print dialog opens.
    flushSync(() => setPrinting(entry));
    window.print();
  }

  const bookingStatus = consultation.booking?.status;
  const isCompleted = bookingStatus
    ? FINISHED_BOOKING_STATUSES.includes(bookingStatus)
    : false;
  // Diagnosis + the top-level Prescription: open while the visit is, and
  // again while the vet who handled a Completed one is editing its record.
  // Every other section stays locked once Completed.
  const recordEditable = canWrite && (!isCompleted || isEditingRecord);
  // Once the medicine transaction has been paid (fully or partly) the bill
  // is fixed - an edit then only changes the medical record.
  const medicinePaid =
    consultation.medication_transaction != null &&
    consultation.medication_transaction.payment_status !== 'Pending';
  const hasSavedPrescription = (consultation.medications ?? []).length > 0;

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
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.petName}>{petName}</h2>
          <span className={styles.subtitle}>Owner: {ownerName}</span>
        </div>
        {bookingStatus ? <BookingStatusBadge status={bookingStatus} /> : null}
      </div>

      <div className={styles.form}>
        <p className={styles.reason}>Reason: {consultation.reason_for_visit}</p>

        {!canWrite ? (
          <p className={styles.reason}>
            View only — only a Veterinarian can update this consultation.
          </p>
        ) : null}

        {bookingStatus === 'Pending' ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSaving || !canWrite}
            onClick={onStart}
          >
            Start Consultation
          </button>
        ) : (
          <>
            <HealthConditionsField
              petId={consultation.pet_id}
              accessToken={accessToken}
              disabled={isCompleted || !canWrite}
            />

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Diagnosis</span>
              <textarea
                className={styles.input}
                rows={3}
                value={diagnosis}
                disabled={!recordEditable}
                onChange={(event) => setDiagnosis(event.target.value)}
              />
            </label>

            <div className={styles.listSection}>
              <span className={styles.fieldLabel}>Prescription</span>
              {medications.map((medication, index) => (
                <div key={index} className={styles.medicationRow}>
                  <div className={styles.medicationRowFields}>
                    <span className={styles.readOnlyField}>
                      {medication.name}
                    </span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Quantity"
                      aria-label={`Quantity of ${medication.name}`}
                      value={medication.quantity ?? ''}
                      disabled={!recordEditable}
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
                      placeholder="Dose"
                      value={medication.dose}
                      disabled={!recordEditable}
                      onChange={(event) =>
                        updateMedication(index, { dose: event.target.value })
                      }
                    />
                    <input
                      className={styles.input}
                      list="medicine-type-options"
                      placeholder="Medicine type"
                      value={medication.medicine_type ?? ''}
                      disabled={!recordEditable}
                      onChange={(event) =>
                        updateMedication(index, {
                          medicine_type: event.target.value,
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      list="frequency-options"
                      placeholder="Frequency"
                      value={medication.frequency ?? ''}
                      disabled={!recordEditable}
                      onChange={(event) =>
                        updateMedication(index, {
                          frequency: event.target.value,
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Duration"
                      value={medication.duration ?? ''}
                      disabled={!recordEditable}
                      onChange={(event) =>
                        updateMedication(index, {
                          duration: event.target.value,
                        })
                      }
                    />
                    {showsPrices ? (
                      <span className={styles.readOnlyField}>
                        {listPriceOf(medication) !== null
                          ? `${formatCurrency(listPriceOf(medication) ?? 0)} each`
                          : 'No price set'}
                      </span>
                    ) : null}
                  </div>
                  {recordEditable ? (
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
              <datalist id="medicine-type-options">
                {MEDICINE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <datalist id="frequency-options">
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {recordEditable ? (
                <div className={styles.addMedicineRow}>
                  <input
                    className={styles.input}
                    list="medicine-name-options"
                    aria-label="Medicine name"
                    placeholder="Type a medicine name"
                    value={newMedicineName}
                    onChange={(event) => setNewMedicineName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addMedicine();
                      }
                    }}
                  />
                  <datalist id="medicine-name-options">
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
                      name={`pharmacy-${consultation.id}`}
                      checked={!soldAtPharmacy}
                      disabled={!recordEditable || medicinePaid}
                      onChange={() => setSoldAtPharmacy(false)}
                    />
                    Buying from another pharmacy
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="radio"
                      name={`pharmacy-${consultation.id}`}
                      checked={soldAtPharmacy}
                      disabled={!recordEditable || medicinePaid}
                      onChange={() => setSoldAtPharmacy(true)}
                    />
                    Buying from our pharmacy
                  </label>
                  {soldAtPharmacy ? (
                    <p className={styles.reason}>
                      {showsPrices
                        ? `Medicine total: ${formatCurrency(medicineTotal)}. `
                        : ''}
                      Billed to the customer as its own transaction, which the
                      cashier collects.
                    </p>
                  ) : (
                    <p className={styles.reason}>
                      Nothing is charged for the medicine. The prescription can
                      be printed for the customer.
                    </p>
                  )}
                  {showsPrices &&
                  recordEditable &&
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
                  {isEditingRecord && medicinePaid ? (
                    <p className={styles.reason}>
                      The medicine for this visit has already been paid. Changes
                      here update the medical record only, not the bill.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}
            </div>

            <div className={styles.listSection}>
              <span className={styles.fieldLabel}>Results</span>
              {formResponses.map((response, responseIndex) => (
                <div
                  key={response.template_id ?? responseIndex}
                  className={styles.resultCard}
                  onDragOver={
                    !isCompleted && canWrite
                      ? handleResponseDragOver
                      : undefined
                  }
                  onDrop={
                    !isCompleted && canWrite
                      ? handleResponseDrop(responseIndex)
                      : undefined
                  }
                >
                  <div className={styles.resultCardHeader}>
                    <span className={styles.resultCardTitle}>
                      {!isCompleted && canWrite && formResponses.length > 1 ? (
                        <span
                          className={styles.dragHandle}
                          draggable
                          onDragStart={handleResponseDragStart(responseIndex)}
                          onDragEnd={() => setDraggedResponseIndex(null)}
                          aria-label={`Reorder ${response.template_name}`}
                          role="button"
                          tabIndex={-1}
                        >
                          <GripVertical size={16} aria-hidden="true" />
                        </span>
                      ) : null}
                      <span className={styles.itemName}>
                        {response.template_name}
                      </span>
                    </span>
                    {!isCompleted && canWrite ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => removeResponse(responseIndex)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {response.fields.map((field, fieldIndex) =>
                    field.type === 'prescription' ? (
                      <div key={field.field_id} className={styles.field}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        {asMedicationList(field.value).map(
                          (medication, medIndex) => (
                            <div
                              key={medIndex}
                              className={styles.medicationRow}
                            >
                              <div className={styles.medicationRowFields}>
                                <span className={styles.readOnlyField}>
                                  {medication.name}
                                </span>
                                <input
                                  className={styles.input}
                                  placeholder="Dose"
                                  value={medication.dose}
                                  disabled={isCompleted || !canWrite}
                                  onChange={(event) =>
                                    updateFieldMedication(
                                      responseIndex,
                                      fieldIndex,
                                      medIndex,
                                      { dose: event.target.value }
                                    )
                                  }
                                />
                                <input
                                  className={styles.input}
                                  list="medicine-type-options"
                                  placeholder="Medicine type"
                                  value={medication.medicine_type ?? ''}
                                  disabled={isCompleted || !canWrite}
                                  onChange={(event) =>
                                    updateFieldMedication(
                                      responseIndex,
                                      fieldIndex,
                                      medIndex,
                                      { medicine_type: event.target.value }
                                    )
                                  }
                                />
                                <input
                                  className={styles.input}
                                  list="frequency-options"
                                  placeholder="Frequency"
                                  value={medication.frequency ?? ''}
                                  disabled={isCompleted || !canWrite}
                                  onChange={(event) =>
                                    updateFieldMedication(
                                      responseIndex,
                                      fieldIndex,
                                      medIndex,
                                      { frequency: event.target.value }
                                    )
                                  }
                                />
                                <input
                                  className={styles.input}
                                  placeholder="Duration"
                                  value={medication.duration ?? ''}
                                  disabled={isCompleted || !canWrite}
                                  onChange={(event) =>
                                    updateFieldMedication(
                                      responseIndex,
                                      fieldIndex,
                                      medIndex,
                                      { duration: event.target.value }
                                    )
                                  }
                                />
                              </div>
                              {!isCompleted && canWrite ? (
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() =>
                                    removeFieldMedication(
                                      responseIndex,
                                      fieldIndex,
                                      medIndex
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          )
                        )}
                        {!isCompleted && canWrite ? (
                          <div className={styles.medicationRowFields}>
                            {prescriptionTemplates.length > 0 ? (
                              <select
                                className={styles.catalogSelect}
                                aria-label={`Add from a saved prescription to ${field.label}`}
                                value=""
                                onChange={(event) => {
                                  if (event.target.value) {
                                    addPrescriptionTemplateToField(
                                      responseIndex,
                                      fieldIndex,
                                      event.target.value
                                    );
                                  }
                                }}
                              >
                                <option value="">
                                  Add from a saved prescription...
                                </option>
                                {prescriptionTemplates.map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name} ({template.items.length})
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {medicationCatalog.length > 0 ? (
                              <select
                                className={styles.catalogSelect}
                                aria-label={`Add medication from your catalog to ${field.label}`}
                                value=""
                                onChange={(event) => {
                                  if (event.target.value) {
                                    addCatalogMedicationToField(
                                      responseIndex,
                                      fieldIndex,
                                      event.target.value
                                    );
                                  }
                                }}
                              >
                                <option value="">
                                  Add medication from your catalog...
                                </option>
                                {medicationCatalog.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <label key={field.field_id} className={styles.field}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        {field.type === 'textarea' ? (
                          <textarea
                            className={styles.input}
                            value={String(field.value ?? '')}
                            disabled={isCompleted || !canWrite}
                            onChange={(event) =>
                              updateResponseFieldValue(
                                responseIndex,
                                fieldIndex,
                                event.target.value
                              )
                            }
                          />
                        ) : field.type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={Boolean(field.value)}
                            disabled={isCompleted || !canWrite}
                            onChange={(event) =>
                              updateResponseFieldValue(
                                responseIndex,
                                fieldIndex,
                                event.target.checked
                              )
                            }
                          />
                        ) : (
                          <input
                            className={styles.input}
                            type={
                              field.type === 'number'
                                ? 'number'
                                : field.type === 'date'
                                  ? 'date'
                                  : 'text'
                            }
                            value={String(field.value ?? '')}
                            disabled={isCompleted || !canWrite}
                            onChange={(event) =>
                              updateResponseFieldValue(
                                responseIndex,
                                fieldIndex,
                                field.type === 'number'
                                  ? Number(event.target.value)
                                  : event.target.value
                              )
                            }
                          />
                        )}
                      </label>
                    )
                  )}
                </div>
              ))}
              {!isCompleted && canWrite ? (
                formTemplates.length === 0 ? (
                  <p className={styles.reason}>
                    No forms in your catalog yet. Add some from My Catalog.
                  </p>
                ) : availableFormTemplates.length === 0 ? (
                  <p className={styles.reason}>
                    Every saved form has already been added to this visit.
                  </p>
                ) : (
                  <FormTemplatePicker
                    templates={availableFormTemplates}
                    onSelect={addResponseFromTemplate}
                  />
                )
              ) : null}
            </div>

            <div className={styles.listSection}>
              <span className={styles.fieldLabel}>
                Vaccination administered (optional)
              </span>
              <div className={styles.listRow}>
                <input
                  className={styles.input}
                  placeholder="Vaccine name"
                  value={vaccineName}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setVaccineName(event.target.value)}
                />
                <input
                  className={styles.input}
                  type="date"
                  value={vaccineDate}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setVaccineDate(event.target.value)}
                />
              </div>
            </div>

            {saveError ? (
              <p className={styles.errorBanner} role="alert">
                {saveError}
              </p>
            ) : null}

            {!isCompleted ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isSaving || !canWrite}
                onClick={handleComplete}
              >
                {isSaving ? 'Completing...' : 'Complete Consultation'}
              </button>
            ) : null}

            {isCompleted && isEditingRecord ? (
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={isSaving}
                  onClick={() => void handleSaveRecord()}
                >
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={isSaving}
                  onClick={cancelEditRecord}
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {isCompleted &&
            !isEditingRecord &&
            (canEditRecord || hasSavedPrescription) ? (
              <div className={styles.formActions}>
                {canEditRecord ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setIsEditingRecord(true)}
                  >
                    Edit record
                  </button>
                ) : null}
                {canEditRecord && !consultation.follow_up_booking_id ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={onScheduleFollowUp}
                  >
                    Schedule follow-up
                  </button>
                ) : null}
                {hasSavedPrescription ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handlePrintPrescription()}
                  >
                    Print prescription
                  </button>
                ) : null}
              </div>
            ) : null}

            {printError ? (
              <p className={styles.errorBanner} role="alert">
                {printError}
              </p>
            ) : null}

            {consultation.follow_up_booking_id ? (
              <div className={styles.followUpSection}>
                <span className={styles.followUpIndicator}>
                  Follow-up scheduled
                  {consultation.follow_up_date
                    ? ` for ${consultation.follow_up_date}`
                    : ''}
                  {consultation.follow_up_reason
                    ? `: ${consultation.follow_up_reason}`
                    : ''}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {printing ? (
        <PrescriptionPrintout
          branchName={printing.branch_name}
          branchAddress={printing.branch_address}
          veterinarianName={printing.veterinarian_name}
          petName={printing.pet_name ?? petName}
          ownerName={printing.owner_name ?? ownerName}
          date={printing.date}
          medications={printing.medications}
          onDone={() => setPrinting(null)}
        />
      ) : null}
    </div>
  );
}
