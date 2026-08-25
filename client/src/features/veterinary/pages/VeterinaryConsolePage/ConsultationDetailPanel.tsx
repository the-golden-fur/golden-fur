import { useEffect, useState } from 'react';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import { FINISHED_BOOKING_STATUSES } from '../../../booking/booking.types';
import { HealthConditionsField } from '../../components/HealthConditionsField/HealthConditionsField';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  listMedicationCatalog,
  listProcedureCatalog,
} from '../../api/veterinary.api';
import type {
  Consultation,
  MedicationInput,
  ProcedureInput,
  VetMedicationCatalogItem,
  VetProcedureCatalogItem,
} from '../../veterinary.types';
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
    temperature?: number;
    weight?: number;
    heart_rate?: number;
    respiratory_rate?: number;
    diagnosis?: string;
    medications: MedicationInput[];
    procedures: ProcedureInput[];
    professionalFee: number;
    vaccination?: {
      vaccine_name: string;
      date_administered: string;
      next_due_date?: string;
      notes?: string;
    };
  }) => void;
  onScheduleFollowUp: (followUpDate: string) => void;
  isSchedulingFollowUp: boolean;
  followUpError: string | null;
}

/**
 * Issue #70: consultation form (vitals/diagnosis/medications/procedures +
 * vaccination sub-section) and follow-up scheduling. Pet History moved out
 * to the "My Patients" page (Revision Batch - each pet's history is now
 * reached from there via a "..." action, not from mid-consultation here).
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
  onScheduleFollowUp,
  isSchedulingFollowUp,
  followUpError,
}: ConsultationDetailPanelProps) {
  // Lazy initial state seeded from the selected consultation. The parent
  // renders this component with key={consultation.id} (VeterinaryConsolePage),
  // so React remounts - and re-seeds all of this state fresh - whenever a
  // different consultation is selected, with no synchronizing effect needed.
  const [temperature, setTemperature] = useState(
    () => consultation.temperature?.toString() ?? ''
  );
  const [weight, setWeight] = useState(
    () => consultation.weight?.toString() ?? ''
  );
  const [heartRate, setHeartRate] = useState(
    () => consultation.heart_rate?.toString() ?? ''
  );
  const [respiratoryRate, setRespiratoryRate] = useState(
    () => consultation.respiratory_rate?.toString() ?? ''
  );
  const [diagnosis, setDiagnosis] = useState(
    () => consultation.diagnosis ?? ''
  );
  const [medications, setMedications] = useState<MedicationInput[]>(() =>
    (consultation.medications ?? []).map((medication) => ({
      name: medication.name,
      dose: medication.dose,
      notes: medication.notes ?? '',
    }))
  );
  const [procedures, setProcedures] = useState<ProcedureInput[]>([]);
  const [professionalFee, setProfessionalFee] = useState('');
  const [vaccineName, setVaccineName] = useState('');
  const [vaccineDate, setVaccineDate] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  const [medicationCatalog, setMedicationCatalog] = useState<
    VetMedicationCatalogItem[]
  >([]);
  const [procedureCatalog, setProcedureCatalog] = useState<
    VetProcedureCatalogItem[]
  >([]);

  // The catalog read endpoints are Veterinarian-only (owner-scoped), same as
  // the write actions this whole form already gates on `canWrite` - a
  // non-Veterinarian viewer would just get a 403, so don't bother fetching.
  useEffect(() => {
    if (!canWrite) return;

    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(accessToken),
      listProcedureCatalog(accessToken),
    ]).then(([medicationResult, procedureResult]) => {
      if (!isMounted) return;
      if (medicationResult.data) setMedicationCatalog(medicationResult.data);
      if (procedureResult.data) setProcedureCatalog(procedureResult.data);
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
        dose: item.default_dose ?? '',
        notes: '',
        amount: item.default_price ?? undefined,
      },
    ]);
  }

  function addProcedureFromCatalog(itemId: string) {
    const item = procedureCatalog.find((entry) => entry.id === itemId);
    if (!item) return;

    setProcedures((prev) => [
      ...prev,
      {
        procedure_type: item.procedure_type,
        description: item.description,
        amount: item.default_price ?? 0,
      },
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

  function updateProcedure(index: number, patch: Partial<ProcedureInput>) {
    setProcedures((prev) =>
      prev.map((procedure, i) =>
        i === index ? { ...procedure, ...patch } : procedure
      )
    );
  }

  function removeProcedure(index: number) {
    setProcedures((prev) => prev.filter((_, i) => i !== index));
  }

  function handleComplete() {
    onComplete({
      temperature: temperature ? Number(temperature) : undefined,
      weight: weight ? Number(weight) : undefined,
      heart_rate: heartRate ? Number(heartRate) : undefined,
      respiratory_rate: respiratoryRate ? Number(respiratoryRate) : undefined,
      diagnosis: diagnosis || undefined,
      medications: medications.map((medication) => ({
        ...medication,
        amount: medication.amount ?? 0,
      })),
      procedures,
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
            onClick={() => setIsStartModalOpen(true)}
          >
            Start Consultation
          </button>
        ) : (
          <>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Temperature</span>
                <input
                  className={styles.input}
                  type="number"
                  value={temperature}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setTemperature(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Weight</span>
                <input
                  className={styles.input}
                  type="number"
                  value={weight}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setWeight(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Heart Rate</span>
                <input
                  className={styles.input}
                  type="number"
                  value={heartRate}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setHeartRate(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Respiratory Rate</span>
                <input
                  className={styles.input}
                  type="number"
                  value={respiratoryRate}
                  disabled={isCompleted || !canWrite}
                  onChange={(event) => setRespiratoryRate(event.target.value)}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Diagnosis</span>
              <textarea
                className={styles.input}
                value={diagnosis}
                disabled={isCompleted || !canWrite}
                onChange={(event) => setDiagnosis(event.target.value)}
              />
            </label>

            <HealthConditionsField
              petId={consultation.pet_id}
              accessToken={accessToken}
              disabled={isCompleted || !canWrite}
            />

            <div className={styles.listSection}>
              <span className={styles.fieldLabel}>Medications</span>
              {medications.map((medication, index) => (
                <div key={index} className={styles.listRow}>
                  <span className={styles.readOnlyField}>
                    {medication.name}
                  </span>
                  <span className={styles.readOnlyField}>
                    {medication.dose}
                  </span>
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
              {!isCompleted && canWrite ? (
                medicationCatalog.length > 0 ? (
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
                        {item.default_dose ? ` (${item.default_dose})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.reason}>
                    No medications in your catalog yet. Add some from My
                    Catalog.
                  </p>
                )
              ) : null}
            </div>

            <div className={styles.listSection}>
              <span className={styles.fieldLabel}>Procedures</span>
              {procedures.map((procedure, index) => (
                <div key={index} className={styles.listRow}>
                  <span className={styles.readOnlyField}>
                    {procedure.procedure_type}
                  </span>
                  <span className={styles.readOnlyField}>
                    {procedure.description}
                  </span>
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Amount (₱)"
                    value={procedure.amount}
                    disabled={!canWrite}
                    onChange={(event) =>
                      updateProcedure(index, {
                        amount: Number(event.target.value),
                      })
                    }
                  />
                  {canWrite ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeProcedure(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              {canWrite ? (
                procedureCatalog.length > 0 ? (
                  <select
                    className={styles.catalogSelect}
                    aria-label="Add procedure from your catalog"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        addProcedureFromCatalog(event.target.value);
                      }
                    }}
                  >
                    <option value="">Add procedure from your catalog...</option>
                    {procedureCatalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.procedure_type} — {item.description}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.reason}>
                    No procedures in your catalog yet. Add some from My Catalog.
                  </p>
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

            <div className={styles.followUpSection}>
              {consultation.follow_up_booking_id ? (
                <span className={styles.followUpIndicator}>
                  Follow-up scheduled
                  {consultation.follow_up_date
                    ? ` for ${consultation.follow_up_date}`
                    : ''}
                </span>
              ) : isCompleted ? (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Follow-up date</span>
                    <input
                      className={styles.input}
                      type="date"
                      value={followUpDate}
                      disabled={!canWrite}
                      onChange={(event) => setFollowUpDate(event.target.value)}
                    />
                  </label>
                  {followUpError ? (
                    <p className={styles.errorBanner} role="alert">
                      {followUpError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={
                      !followUpDate || isSchedulingFollowUp || !canWrite
                    }
                    onClick={() => onScheduleFollowUp(followUpDate)}
                  >
                    {isSchedulingFollowUp
                      ? 'Scheduling...'
                      : 'Schedule follow-up'}
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={isStartModalOpen}
        title="Start Consultation"
        onClose={() => setIsStartModalOpen(false)}
      >
        <p className={styles.reason}>
          Start this consultation for {petName}? This moves the booking to In
          Progress.
        </p>
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSaving}
            onClick={() => {
              setIsStartModalOpen(false);
              onStart();
            }}
          >
            {isSaving ? 'Starting...' : 'Start Consultation'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setIsStartModalOpen(false)}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
