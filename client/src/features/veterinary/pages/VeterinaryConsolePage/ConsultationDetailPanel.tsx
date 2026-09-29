import { useEffect, useState, type DragEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import { FINISHED_BOOKING_STATUSES } from '../../../booking/booking.types';
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
    medications: MedicationInput[];
    formResponses: ConsultationFormResponse[];
    professionalFee: number;
    vaccination?: {
      vaccine_name: string;
      date_administered: string;
      next_due_date?: string;
      notes?: string;
    };
  }) => void;
  /** Custom change: page-level state (VeterinaryConsolePage) tracking which
   * consultations have already had the "choose a form" prompt resolved
   * (started or skipped) during this session, so it only ever auto-shows
   * once per consultation - reopening "View Details" afterward doesn't nag
   * again. Adding another form later happens through the Results section's
   * own "Add result from a form template..." control. */
  hasSeenFormsPrompt: boolean;
  /** Called once the picker is dismissed any way (Add, Skip/Cancel, close) -
   * marks hasSeenFormsPrompt true. */
  onFormsPromptResolved: () => void;
}

/** #117: build a fresh, empty ConsultationFormResponse from a saved template
 * - one field per template field, all values start empty/false/null
 * depending on the field's type. Custom change: a 'prescription' field
 * starts as an empty medication list, filled in the same way as the
 * top-level Prescription section (add from catalog / bulk-add from a
 * saved prescription template). */
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
 * default template seeded in My Catalog > Forms). The first time a fresh
 * consultation (no form_responses yet) is opened, this panel prompts the
 * vet to choose which of their saved form templates to start with
 * (defaulting to whichever one is marked "default").
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
  hasSeenFormsPrompt,
  onFormsPromptResolved,
}: ConsultationDetailPanelProps) {
  // Lazy initial state seeded from the selected consultation. The parent
  // renders this component with key={consultation.id} (VeterinaryConsolePage),
  // so React remounts - and re-seeds all of this state fresh - whenever a
  // different consultation is selected, with no synchronizing effect needed.
  const [medications, setMedications] = useState<MedicationInput[]>(() =>
    (consultation.medications ?? []).map((medication) => ({
      name: medication.name,
      dose: medication.dose,
      notes: medication.notes ?? '',
      medicine_type: medication.medicine_type ?? '',
      frequency: medication.frequency ?? '',
      duration: medication.duration ?? '',
    }))
  );
  const [formResponses, setFormResponses] = useState<
    ConsultationFormResponse[]
  >(() => consultation.form_responses ?? []);
  const [draggedResponseIndex, setDraggedResponseIndex] = useState<
    number | null
  >(null);
  const [professionalFee, setProfessionalFee] = useState('');
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

  const [chosenTemplateIds, setChosenTemplateIds] = useState<Set<string>>(
    new Set()
  );

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
      if (templateResult.data) {
        setFormTemplates(templateResult.data);
        setChosenTemplateIds(
          new Set(
            templateResult.data
              .filter((template) => template.is_default)
              .map((template) => template.id)
          )
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, canWrite]);

  function addMedicationFromCatalog(itemId: string) {
    const item = medicationCatalog.find((entry) => entry.id === itemId);
    if (!item) return;

    setMedications((prev) => [
      ...prev,
      {
        name: item.name,
        dose: '',
        notes: '',
        medicine_type: item.default_medicine_type ?? '',
        frequency: '',
        duration: '',
        amount: item.default_price ?? undefined,
      },
    ]);
  }

  /** Custom change: bulk-adds every line of a saved prescription template
   * at once (each already carrying its own dose/frequency/duration),
   * instead of adding one medication at a time. */
  function addMedicationsFromPrescriptionTemplate(templateId: string) {
    const template = prescriptionTemplates.find(
      (entry) => entry.id === templateId
    );
    if (!template) return;

    setMedications((prev) => [
      ...prev,
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

  function toggleChosenTemplate(templateId: string) {
    setChosenTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  // Custom change: exclude form templates already added to this visit's
  // results, so reopening the picker later (the row's "..." > "Choose Form
  // Template", for adding more/different forms after the initial prompt)
  // can't add the same template's results twice.
  const availableFormTemplates = formTemplates.filter(
    (template) =>
      !formResponses.some((response) => response.template_id === template.id)
  );

  function confirmChooseForms() {
    const chosen = availableFormTemplates.filter((template) =>
      chosenTemplateIds.has(template.id)
    );
    setFormResponses((prev) => [...prev, ...chosen.map(buildEmptyResponse)]);
    onFormsPromptResolved();
  }

  function skipChooseForms() {
    onFormsPromptResolved();
  }

  function handleComplete() {
    onComplete({
      medications: medications.map((medication) => ({
        ...medication,
        amount: medication.amount ?? 0,
      })),
      formResponses,
      professionalFee: Number(professionalFee || 0),
      vaccination:
        vaccineName && vaccineDate
          ? { vaccine_name: vaccineName, date_administered: vaccineDate }
          : undefined,
    });
  }

  const bookingStatus = consultation.booking?.status;
  const isCompleted = bookingStatus
    ? FINISHED_BOOKING_STATUSES.includes(bookingStatus)
    : false;
  const isStarted = bookingStatus !== undefined && bookingStatus !== 'Pending';
  // Custom change: "only appear once" - alreadyResolved covers both a
  // genuinely already-started visit (consultation.form_responses has
  // entries, from a prior session) and this session's own prior
  // Add/Skip/close (hasSeenFormsPrompt, from the parent page). Adding
  // another form later happens through the Results section's own "Add
  // result from a form template..." control, not by reshowing this.
  const alreadyResolved =
    (consultation.form_responses ?? []).length > 0 || hasSeenFormsPrompt;
  const showChooseFormsPrompt =
    canWrite &&
    isStarted &&
    !isCompleted &&
    availableFormTemplates.length > 0 &&
    !alreadyResolved;

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
                      placeholder="Dose"
                      value={medication.dose}
                      disabled={isCompleted || !canWrite}
                      onChange={(event) =>
                        updateMedication(index, { dose: event.target.value })
                      }
                    />
                    <input
                      className={styles.input}
                      list="medicine-type-options"
                      placeholder="Medicine type"
                      value={medication.medicine_type ?? ''}
                      disabled={isCompleted || !canWrite}
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
                      disabled={isCompleted || !canWrite}
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
                      disabled={isCompleted || !canWrite}
                      onChange={(event) =>
                        updateMedication(index, {
                          duration: event.target.value,
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      type="number"
                      placeholder="Amount (₱)"
                      value={medication.amount ?? ''}
                      disabled={isCompleted || !canWrite}
                      onChange={(event) =>
                        updateMedication(index, {
                          amount: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  {!isCompleted && canWrite ? (
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
              {!isCompleted && canWrite ? (
                <div className={styles.medicationRowFields}>
                  {prescriptionTemplates.length > 0 ? (
                    <select
                      className={styles.catalogSelect}
                      aria-label="Add from a saved prescription"
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          addMedicationsFromPrescriptionTemplate(
                            event.target.value
                          );
                        }
                      }}
                    >
                      <option value="">Add from a saved prescription...</option>
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
                      aria-label="Add medication from your catalog"
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          addMedicationFromCatalog(event.target.value);
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
              {!isCompleted &&
              canWrite &&
              medicationCatalog.length === 0 &&
              prescriptionTemplates.length === 0 ? (
                <p className={styles.reason}>
                  No medications or prescriptions in your catalog yet. Add some
                  from My Catalog.
                </p>
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

            {!isCompleted ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Professional Fee (₱)</span>
                <input
                  className={styles.input}
                  type="number"
                  value={professionalFee}
                  disabled={!canWrite}
                  onChange={(event) => setProfessionalFee(event.target.value)}
                />
              </label>
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

            {consultation.follow_up_booking_id ? (
              <div className={styles.followUpSection}>
                <span className={styles.followUpIndicator}>
                  Follow-up scheduled
                  {consultation.follow_up_date
                    ? ` for ${consultation.follow_up_date}`
                    : ''}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Modal
        isOpen={showChooseFormsPrompt}
        title="Choose consultation form(s)"
        onClose={skipChooseForms}
      >
        <p className={styles.reason}>
          Pick which of your saved consultation forms to fill in for this visit.
          Your default form is pre-selected.
        </p>
        <div className={styles.listSection}>
          {availableFormTemplates.map((template) => (
            <label key={template.id} className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={chosenTemplateIds.has(template.id)}
                onChange={() => toggleChosenTemplate(template.id)}
              />
              {template.name}
              {template.is_default ? ' (Default)' : ''}
            </label>
          ))}
        </div>
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={confirmChooseForms}
          >
            Add
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={skipChooseForms}
          >
            Skip
          </button>
        </div>
      </Modal>
    </div>
  );
}
