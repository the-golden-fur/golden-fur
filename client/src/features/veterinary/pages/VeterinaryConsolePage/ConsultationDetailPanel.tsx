import { useState } from 'react';
import { ConsultationStatusBadge } from '../../components/ConsultationStatusBadge/ConsultationStatusBadge';
import { PetHistoryTab } from '../../components/PetHistoryTab/PetHistoryTab';
import type {
  Consultation,
  MedicationInput,
  ProcedureInput,
} from '../../veterinary.types';
import { PROCEDURE_TYPES } from '../../veterinary.types';
import styles from './ConsultationDetailPanel.module.css';

export interface ConsultationDetailPanelProps {
  consultation: Consultation;
  petName: string;
  ownerName: string;
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
  petHistory: Consultation[];
  isPetHistoryLoading: boolean;
  petHistoryError: string | null;
  onOpenPetHistory: () => void;
  onScheduleFollowUp: (followUpDate: string) => void;
  isSchedulingFollowUp: boolean;
  followUpError: string | null;
}

type PanelTab = 'consultation' | 'history';

/**
 * Issue #70: consultation form (vitals/diagnosis/medications/procedures +
 * vaccination sub-section), Pet History tab, and follow-up scheduling, all
 * reachable from one console screen per the flow diagram ("the whole visit
 * fits in a single screen").
 */
export function ConsultationDetailPanel({
  consultation,
  petName,
  ownerName,
  isSaving,
  saveError,
  onStart,
  onComplete,
  petHistory,
  isPetHistoryLoading,
  petHistoryError,
  onOpenPetHistory,
  onScheduleFollowUp,
  isSchedulingFollowUp,
  followUpError,
}: ConsultationDetailPanelProps) {
  // Lazy initial state seeded from the selected consultation. The parent
  // renders this component with key={consultation.id} (VeterinaryConsolePage),
  // so React remounts - and re-seeds all of this state fresh - whenever a
  // different consultation is selected, with no synchronizing effect needed.
  const [tab, setTab] = useState<PanelTab>('consultation');
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

  function handleTabChange(nextTab: PanelTab) {
    setTab(nextTab);
    if (nextTab === 'history') {
      onOpenPetHistory();
    }
  }

  function addMedication() {
    setMedications((prev) => [...prev, { name: '', dose: '', notes: '' }]);
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

  function addProcedure() {
    setProcedures((prev) => [
      ...prev,
      { procedure_type: PROCEDURE_TYPES[0], description: '', amount: 0 },
    ]);
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

  const isCompleted = consultation.status === 'Completed';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.petName}>{petName}</h2>
          <span className={styles.subtitle}>Owner: {ownerName}</span>
        </div>
        <ConsultationStatusBadge status={consultation.status} />
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'consultation'}
          className={tab === 'consultation' ? styles.tabActive : styles.tab}
          onClick={() => handleTabChange('consultation')}
        >
          Consultation
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? styles.tabActive : styles.tab}
          onClick={() => handleTabChange('history')}
        >
          Pet History
        </button>
      </div>

      {tab === 'history' ? (
        <PetHistoryTab
          consultations={petHistory}
          isLoading={isPetHistoryLoading}
          error={petHistoryError}
        />
      ) : (
        <div className={styles.form}>
          <p className={styles.reason}>
            Reason: {consultation.reason_for_visit}
          </p>

          {consultation.status === 'Pending' ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isSaving}
              onClick={onStart}
            >
              {isSaving ? 'Starting...' : 'Start Consultation'}
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
                    disabled={isCompleted}
                    onChange={(event) => setTemperature(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Weight</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={weight}
                    disabled={isCompleted}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Heart Rate</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={heartRate}
                    disabled={isCompleted}
                    onChange={(event) => setHeartRate(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Respiratory Rate</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={respiratoryRate}
                    disabled={isCompleted}
                    onChange={(event) => setRespiratoryRate(event.target.value)}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Diagnosis</span>
                <textarea
                  className={styles.input}
                  value={diagnosis}
                  disabled={isCompleted}
                  onChange={(event) => setDiagnosis(event.target.value)}
                />
              </label>

              <div className={styles.listSection}>
                <span className={styles.fieldLabel}>Medications</span>
                {medications.map((medication, index) => (
                  <div key={index} className={styles.listRow}>
                    <input
                      className={styles.input}
                      placeholder="Name"
                      value={medication.name}
                      disabled={isCompleted}
                      onChange={(event) =>
                        updateMedication(index, { name: event.target.value })
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Dose"
                      value={medication.dose}
                      disabled={isCompleted}
                      onChange={(event) =>
                        updateMedication(index, { dose: event.target.value })
                      }
                    />
                    <input
                      className={styles.input}
                      type="number"
                      placeholder="Amount (₱)"
                      value={medication.amount ?? ''}
                      disabled={isCompleted}
                      onChange={(event) =>
                        updateMedication(index, {
                          amount: Number(event.target.value),
                        })
                      }
                    />
                    {!isCompleted ? (
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
                {!isCompleted ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={addMedication}
                  >
                    Add medication
                  </button>
                ) : null}
              </div>

              <div className={styles.listSection}>
                <span className={styles.fieldLabel}>Procedures</span>
                {procedures.map((procedure, index) => (
                  <div key={index} className={styles.listRow}>
                    <select
                      className={styles.input}
                      value={procedure.procedure_type}
                      onChange={(event) =>
                        updateProcedure(index, {
                          procedure_type: event.target
                            .value as ProcedureInput['procedure_type'],
                        })
                      }
                    >
                      {PROCEDURE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <input
                      className={styles.input}
                      placeholder="Description"
                      value={procedure.description}
                      onChange={(event) =>
                        updateProcedure(index, {
                          description: event.target.value,
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      type="number"
                      placeholder="Amount (₱)"
                      value={procedure.amount}
                      onChange={(event) =>
                        updateProcedure(index, {
                          amount: Number(event.target.value),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeProcedure(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={addProcedure}
                >
                  Add procedure
                </button>
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
                    disabled={isCompleted}
                    onChange={(event) => setVaccineName(event.target.value)}
                  />
                  <input
                    className={styles.input}
                    type="date"
                    value={vaccineDate}
                    disabled={isCompleted}
                    onChange={(event) => setVaccineDate(event.target.value)}
                  />
                </div>
              </div>

              {!isCompleted ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Professional Fee (₱)
                  </span>
                  <input
                    className={styles.input}
                    type="number"
                    value={professionalFee}
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
                  disabled={isSaving}
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
                ) : consultation.status === 'Completed' ||
                  consultation.status === 'Ongoing' ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Follow-up date</span>
                      <input
                        className={styles.input}
                        type="date"
                        value={followUpDate}
                        onChange={(event) =>
                          setFollowUpDate(event.target.value)
                        }
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
                      disabled={!followUpDate || isSchedulingFollowUp}
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
      )}
    </div>
  );
}
