import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { BookingStatus } from '../../../booking/booking.types';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  getPetConsultationHistory,
  listConsultationQueue,
  scheduleFollowUp,
  updateConsultation,
} from '../../api/veterinary.api';
import type {
  Consultation,
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

// Booking-status revision: the queue endpoint only ever returns
// consultations whose booking hasn't finished yet (bookings.status IN
// Pending/In Progress - see consultation.service.ts's merged
// listConsultationQueue), so those are the only two meaningful values to
// group/filter by here (mirrors GroomerDashboardPage's own
// GROOMING_STATUSES). The old separate "Unconfirmed (awaiting payment)"
// option is gone along with the server's now-merged two-function split.
const STATUS_GROUPS: BookingStatus[] = ['Pending', 'In Progress'];
type StatusFilter = BookingStatus | 'All';
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  ...STATUS_GROUPS.map((status) => ({ value: status, label: status })),
];

type SortKey = 'time' | 'pet-name';
const SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: 'time', label: 'Sort: Scheduled time (earliest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

// Issue #70 AC-1/AC-4: no WebSocket/realtime infra exists anywhere in this
// codebase yet (same gap noted in GroomerDashboardPage's own #68 dev note),
// so the queue and the "follow-up scheduled" state both refresh via polling.
const REFRESH_INTERVAL_MS = 15_000;

export function VeterinaryConsolePage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [staffRole, setStaffRole] = useState<string | null>(null);

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
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

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setStaffRole(result.data.role);
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
      setConsultations(result.data.consultations);
      setIsLoading(false);

      const petIds = new Set<string>();
      const customerIds = new Set<string>();

      for (const consultation of result.data.consultations) {
        if (consultation.booking) {
          petIds.add(consultation.booking.pet_id);
          customerIds.add(consultation.booking.customer_id);
        }
      }

      void Promise.all(Array.from(petIds).map((id) => getPet(id, token))).then(
        (petResults) => {
          if (!isMounted) return;
          setPets((prev) => {
            const next = { ...prev };
            for (const petResult of petResults) {
              if (petResult.data) next[petResult.data.id] = petResult.data;
            }
            return next;
          });
        }
      );

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

    const queueDateRange = {
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    };

    void listConsultationQueue(token, queueDateRange).then(handleQueueResult);

    const interval = setInterval(() => {
      void listConsultationQueue(token, queueDateRange).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roleStatus, accessToken, dateRange.from, dateRange.to]);

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

  type QueueRow = (typeof rows)[number];

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'All') return rows;
    return rows.filter(
      (row) => row.consultation.booking?.status === statusFilter
    );
  }, [rows, statusFilter]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleRows,
  } = useSearchAndSort<QueueRow, SortKey>({
    items: statusFiltered,
    matchesQuery: (row, query) =>
      row.petName.toLowerCase().includes(query) ||
      row.ownerName.toLowerCase().includes(query),
    comparators: {
      time: (a, b) =>
        new Date(a.scheduledStart).getTime() -
        new Date(b.scheduledStart).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'time',
  });

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (dateRangePreset !== 'today') {
      chips.push({
        id: 'date',
        label: `Date: ${dateRangePresetLabel(dateRangePreset)}`,
        onClear: () => setDateRangePreset('today'),
      });
    }
    if (statusFilter !== 'All') {
      chips.push({
        id: 'status',
        label: `Status: ${statusFilter}`,
        onClear: () => setStatusFilter('All'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'time') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('time'),
      });
    }

    return chips;
  }, [dateRangePreset, statusFilter, search, sortKey, setSearch, setSortKey]);

  const selectedRow = rows.find((row) => row.consultation.id === selectedId);

  // Mirrors the server's VETERINARY_WRITE_ROLES (veterinary.types.ts) - Admin
  // /Supervisor/Superadmin can view the console but any write PATCH/POST
  // gets a 403, so those controls must be disabled here too.
  const canWrite = staffRole === 'Veterinarian';

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

    const result = await updateConsultation(
      selectedRow.consultation.id,
      accessToken,
      {
        status: 'Ongoing',
      }
    );

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not start this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
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

    const result = await updateConsultation(
      selectedRow.consultation.id,
      accessToken,
      {
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
      }
    );

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not complete this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
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
        consultation.id === updated.id ? updated : consultation
      )
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the veterinary console.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Veterinary Console</h1>

        <QueueFilterBar
          dateRangePreset={dateRangePreset}
          onDateRangePresetChange={setDateRangePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          statusValue={statusFilter}
          onStatusChange={(value) => setStatusFilter(value as StatusFilter)}
          statusOptions={STATUS_OPTIONS}
        >
          <SearchSortBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by pet or owner..."
            sortValue={sortKey}
            onSortChange={setSortKey}
            sortOptions={SORT_OPTIONS}
          />
        </QueueFilterBar>

        <ActiveFilterChips chips={filterChips} />

        {isLoading ? (
          <p className={styles.copy}>Loading consultations...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <div className={styles.layout}>
            <div className={styles.queue}>
              {visibleRows.length === 0 ? (
                <p className={styles.copy}>
                  No consultations match these filters.
                </p>
              ) : (
                <ul className={styles.rowList}>
                  {visibleRows.map((row) => (
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
                        <span className={styles.rowPetName}>{row.petName}</span>
                        <span className={styles.rowMeta}>{row.ownerName}</span>
                        {row.consultation.booking?.status ? (
                          <BookingStatusBadge
                            status={row.consultation.booking.status}
                          />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.detail}>
              {selectedRow ? (
                <ConsultationDetailPanel
                  key={selectedRow.consultation.id}
                  consultation={selectedRow.consultation}
                  petName={selectedRow.petName}
                  ownerName={selectedRow.ownerName}
                  accessToken={accessToken}
                  canWrite={canWrite}
                  isSaving={isSaving}
                  saveError={saveError}
                  onStart={() => void handleStart()}
                  onComplete={(fields) => void handleComplete(fields)}
                  petHistory={petHistory}
                  isPetHistoryLoading={isPetHistoryLoading}
                  petHistoryError={petHistoryError}
                  onOpenPetHistory={handleOpenPetHistory}
                  onScheduleFollowUp={(date) =>
                    void handleScheduleFollowUp(date)
                  }
                  isSchedulingFollowUp={isSchedulingFollowUp}
                  followUpError={followUpError}
                />
              ) : (
                <p className={styles.copy}>Select a consultation to begin.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
