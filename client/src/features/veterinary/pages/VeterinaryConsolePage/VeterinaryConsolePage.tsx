import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { getCustomerProfile, getPet } from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  getPetConsultationHistory,
  listConsultationQueue,
  scheduleFollowUp,
  updateConsultation,
} from '../../api/veterinary.api';
import { ConsultationStatusBadge } from '../../components/ConsultationStatusBadge/ConsultationStatusBadge';
import type {
  Consultation,
  ConsultationStatus,
  MedicationInput,
  ProcedureInput,
} from '../../veterinary.types';
import { ConsultationDetailPanel } from './ConsultationDetailPanel';
import styles from './VeterinaryConsolePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

const STATUS_GROUPS: ConsultationStatus[] = ['Pending', 'Ongoing', 'Completed'];

// Issue #70 AC-1/AC-4: no WebSocket/realtime infra exists anywhere in this
// codebase yet (same gap noted in GroomerDashboardPage's own #68 dev note),
// so the queue and the "follow-up scheduled" state both refresh via polling.
const REFRESH_INTERVAL_MS = 15_000;

export function VeterinaryConsolePage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [petHistory, setPetHistory] = useState<Consultation[]>([]);
  const [isPetHistoryLoading, setIsPetHistoryLoading] = useState(false);
  const [petHistoryError, setPetHistoryError] = useState<string | null>(null);

  const [isSchedulingFollowUp, setIsSchedulingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    // Narrowed once here since a nested function declaration (unlike an
    // inline callback) loses the enclosing `!accessToken` narrowing.
    const token = accessToken;
    let isMounted = true;

    function handleQueueResult(
      result: Awaited<ReturnType<typeof listConsultationQueue>>
    ) {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load the consultation queue.');
        return;
      }

      setLoadError(null);
      setConsultations(result.data);
      setIsLoading(false);

      const petIds = new Set<string>();
      const customerIds = new Set<string>();

      for (const consultation of result.data) {
        if (consultation.booking) {
          petIds.add(consultation.booking.pet_id);
          customerIds.add(consultation.booking.customer_id);
        }
      }

      void Promise.all(
        Array.from(petIds).map((id) => getPet(id, token))
      ).then((petResults) => {
        if (!isMounted) return;
        setPets((prev) => {
          const next = { ...prev };
          for (const petResult of petResults) {
            if (petResult.data) next[petResult.data.id] = petResult.data;
          }
          return next;
        });
      });

      void Promise.all(
        Array.from(customerIds).map((id) => getCustomerProfile(id, token))
      ).then((ownerResults) => {
        if (!isMounted) return;
        setOwners((prev) => {
          const next = { ...prev };
          for (const ownerResult of ownerResults) {
            if (ownerResult.data) next[ownerResult.data.id] = ownerResult.data;
          }
          return next;
        });
      });
    }

    void listConsultationQueue(token).then(handleQueueResult);

    const interval = setInterval(() => {
      void listConsultationQueue(token).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roleStatus, accessToken]);

  const rows = useMemo(() => {
    return consultations.map((consultation) => {
      const booking = consultation.booking;
      const pet = booking ? pets[booking.pet_id] : undefined;
      const owner = booking ? owners[booking.customer_id] : undefined;

      return {
        consultation,
        petName: pet?.name ?? 'Unknown pet',
        ownerName: owner?.full_name ?? 'Unknown owner',
        scheduledStart: booking?.scheduled_start ?? consultation.created_at,
      };
    });
  }, [consultations, pets, owners]);

  const grouped = useMemo(() => {
    const map = new Map<ConsultationStatus, typeof rows>();
    for (const status of STATUS_GROUPS) map.set(status, []);
    for (const row of rows) {
      map.get(row.consultation.status)!.push(row);
    }
    for (const group of map.values()) {
      group.sort(
        (a, b) =>
          new Date(a.scheduledStart).getTime() -
          new Date(b.scheduledStart).getTime()
      );
    }
    return map;
  }, [rows]);

  const selectedRow = rows.find((row) => row.consultation.id === selectedId);

  function selectConsultation(id: string) {
    setSelectedId(id);
    setSaveError(null);
    setPetHistory([]);
    setPetHistoryError(null);
    setFollowUpError(null);
  }

  async function handleStart() {
    if (!accessToken || !selectedRow) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(selectedRow.consultation.id, accessToken, {
      status: 'Ongoing',
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not start this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id
          ? { ...updated, booking: consultation.booking }
          : consultation
      )
    );
  }

  async function handleComplete(fields: {
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
  }) {
    if (!accessToken || !selectedRow) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(selectedRow.consultation.id, accessToken, {
      status: 'Completed',
      temperature: fields.temperature,
      weight: fields.weight,
      heart_rate: fields.heart_rate,
      respiratory_rate: fields.respiratory_rate,
      diagnosis: fields.diagnosis,
      medications: fields.medications,
      procedures: fields.procedures,
      professional_fee: fields.professionalFee,
      vaccination: fields.vaccination,
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not complete this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id
          ? { ...updated, booking: consultation.booking }
          : consultation
      )
    );
  }

  function handleOpenPetHistory() {
    if (!accessToken || !selectedRow) return;

    setIsPetHistoryLoading(true);
    setPetHistoryError(null);

    void getPetConsultationHistory(
      selectedRow.consultation.pet_id,
      accessToken
    ).then((result) => {
      setIsPetHistoryLoading(false);

      if (result.error || !result.data) {
        setPetHistoryError(result.error ?? 'Could not load pet history.');
        return;
      }

      setPetHistory(result.data);
    });
  }

  async function handleScheduleFollowUp(followUpDate: string) {
    if (!accessToken || !selectedRow) return;

    setIsSchedulingFollowUp(true);
    setFollowUpError(null);

    const result = await scheduleFollowUp(
      selectedRow.consultation.id,
      accessToken,
      followUpDate
    );

    setIsSchedulingFollowUp(false);

    if (result.error || !result.data) {
      setFollowUpError(result.error ?? 'Could not schedule the follow-up.');
      return;
    }

    const updated = result.data.consultation;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id
          ? { ...updated, booking: consultation.booking }
          : consultation
      )
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the veterinary console.
        </p>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/profile" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Veterinary Console</h1>

      {isLoading ? (
        <p className={styles.copy}>Loading today's consultations...</p>
      ) : loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.queue}>
            {STATUS_GROUPS.map((status) => (
              <section key={status} className={styles.statusGroup}>
                <h2 className={styles.statusGroupTitle}>
                  <ConsultationStatusBadge status={status} />
                </h2>
                {grouped.get(status)!.length === 0 ? (
                  <p className={styles.copy}>None</p>
                ) : (
                  <ul className={styles.rowList}>
                    {grouped.get(status)!.map((row) => (
                      <li key={row.consultation.id}>
                        <button
                          type="button"
                          className={
                            row.consultation.id === selectedId
                              ? styles.rowButtonActive
                              : styles.rowButton
                          }
                          onClick={() => selectConsultation(row.consultation.id)}
                        >
                          <span className={styles.rowPetName}>
                            {row.petName}
                          </span>
                          <span className={styles.rowMeta}>
                            {row.ownerName}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className={styles.detail}>
            {selectedRow ? (
              <ConsultationDetailPanel
                key={selectedRow.consultation.id}
                consultation={selectedRow.consultation}
                petName={selectedRow.petName}
                ownerName={selectedRow.ownerName}
                isSaving={isSaving}
                saveError={saveError}
                onStart={() => void handleStart()}
                onComplete={(fields) => void handleComplete(fields)}
                petHistory={petHistory}
                isPetHistoryLoading={isPetHistoryLoading}
                petHistoryError={petHistoryError}
                onOpenPetHistory={handleOpenPetHistory}
                onScheduleFollowUp={(date) => void handleScheduleFollowUp(date)}
                isSchedulingFollowUp={isSchedulingFollowUp}
                followUpError={followUpError}
              />
            ) : (
              <p className={styles.copy}>Select a consultation to begin.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
