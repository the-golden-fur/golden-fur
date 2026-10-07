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
import { PrescriptionEditor } from './PrescriptionEditor';
import {
  findMissingDosage,
  includePendingMedicine,
  seedMedications,
  withValidQuantities,
} from './prescriptionMedications';
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
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [printing, setPrinting] = useState<PetPrescriptionHistoryEntry | null>(
    null
  );
  const [printError, setPrintError] = useState<string | null>(null);
  // The name typed into the Prescription add box but not added yet.
  const [pendingMedicineName, setPendingMedicineName] = useState('');
  const [prescriptionProblem, setPrescriptionProblem] = useState<string | null>(
    null
  );
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

  /** The prescription as it should be saved, or null when it isn't ready -
   * a name typed into the add box but never added becomes a row (rather than
   * being lost), and a row with no dosage holds the save. */
  function readyPrescription(): MedicationInput[] | null {
    const all = includePendingMedicine(
      medications,
      pendingMedicineName,
      medicationCatalog
    );

    if (all.length !== medications.length) {
      setMedications(all);
      setPendingMedicineName('');
    }

    const missingDosage = findMissingDosage(all);
    if (missingDosage) {
      setPrescriptionProblem(`Enter a dosage for ${missingDosage.name}.`);
      return null;
    }

    setPrescriptionProblem(null);
    return withValidQuantities(all);
  }

  function handleComplete() {
    const readyMedications = readyPrescription();
    if (!readyMedications) return;

    onComplete({
      diagnosis,
      medications: readyMedications,
      soldAtPharmacy,
      formResponses,
      vaccination:
        vaccineName && vaccineDate
          ? { vaccine_name: vaccineName, date_administered: vaccineDate }
          : undefined,
    });
  }

  async function handleSaveRecord() {
    const readyMedications = readyPrescription();
    if (!readyMedications) return;

    const saved = await onSaveRecord({
      diagnosis,
      medications: readyMedications,
      soldAtPharmacy,
    });

    if (saved) setIsEditingRecord(false);
  }

  function cancelEditRecord() {
    setDiagnosis(consultation.diagnosis ?? '');
    setMedications(seedMedications(consultation));
    setSoldAtPharmacy(consultation.sold_at_pharmacy ?? false);
    setPendingMedicineName('');
    setPrescriptionProblem(null);
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
  // What the vet listed in the "Services done" pop-up when completing.
  const servicesDone = (consultation.line_items ?? []).filter(
    (item) => item.item_type === 'procedure'
  );
  const servicesDoneTotal = servicesDone.reduce(
    (sum, service) => sum + Number(service.amount),
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

            <PrescriptionEditor
              medications={medications}
              onMedicationsChange={setMedications}
              soldAtPharmacy={soldAtPharmacy}
              onSoldAtPharmacyChange={setSoldAtPharmacy}
              medicationCatalog={medicationCatalog}
              pendingName={pendingMedicineName}
              onPendingNameChange={setPendingMedicineName}
              editable={recordEditable}
              canWrite={canWrite}
              medicinePaid={medicinePaid}
              showPaidNote={isEditingRecord && medicinePaid}
            />
            {/* The Results section's own prescription fields below still
                suggest from these two lists. */}
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

            {isCompleted ? (
              <div className={styles.listSection}>
                <span className={styles.fieldLabel}>Services done</span>
                {servicesDone.length > 0 ? (
                  <>
                    <ul className={styles.servicesDoneList}>
                      {servicesDone.map((service, index) => (
                        <li key={index} className={styles.servicesDoneRow}>
                          <span>{service.description}</span>
                          <span>{formatCurrency(Number(service.amount))}</span>
                        </li>
                      ))}
                    </ul>
                    <p className={styles.servicesDoneTotal}>
                      <span>Total</span>
                      <span>{formatCurrency(servicesDoneTotal)}</span>
                    </p>
                  </>
                ) : (
                  <p className={styles.reason}>
                    No extra services were listed for this visit.
                  </p>
                )}
              </div>
            ) : null}

            {prescriptionProblem ? (
              <p className={styles.errorBanner} role="alert">
                {prescriptionProblem}
              </p>
            ) : null}

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
