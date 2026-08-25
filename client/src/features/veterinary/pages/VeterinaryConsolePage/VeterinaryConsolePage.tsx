import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  FINISHED_BOOKING_STATUSES,
  type BookingStatus,
} from '../../../booking/booking.types';
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
  listConsultationQueue,
  updateConsultation,
} from '../../api/veterinary.api';
import type {
  Consultation,
  MedicationInput,
  ProcedureInput,
} from '../../veterinary.types';
import { ConsultationDetailPanel } from './ConsultationDetailPanel';
import { ScheduleFollowUpModal } from '../../components/ScheduleFollowUpModal/ScheduleFollowUpModal';
import styles from './VeterinaryConsolePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

// Booking-status revision: the queue endpoint returns the day's actionable
// consultations (bookings.status Pending/In Progress) plus its Completed
// ones (read-only) - see consultation.service.ts's listConsultationQueue.
// Cancelled/No-show are omitted since those bookings frequently never had a
// consultation row to begin with (see LIST_BOOKING_STATUSES server-side).
const STATUS_GROUPS: BookingStatus[] = ['Pending', 'In Progress', 'Completed'];
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

function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

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
  const [pendingStartId, setPendingStartId] = useState<string | null>(null);
  const [followUpTargetId, setFollowUpTargetId] = useState<string | null>(
    null
  );
  const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

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
  const pendingStartRow = rows.find(
    (row) => row.consultation.id === pendingStartId
  );
  const followUpTargetRow = rows.find(
    (row) => row.consultation.id === followUpTargetId
  );
  const viewDetailsRow = rows.find(
    (row) => row.consultation.id === viewDetailsId
  );

  // Mirrors the server's VETERINARY_WRITE_ROLES (veterinary.types.ts) - Admin
  // /Supervisor/Superadmin can view the console but any write PATCH/POST
  // gets a 403, so those controls must be disabled here too.
  const canWrite = staffRole === 'Veterinarian';

  function selectConsultation(id: string) {
    setSelectedId(id);
    setSaveError(null);
  }

  // Both the queue row's own quick-start button and the detail panel's
  // "Start Consultation" button route through here, so there's exactly one
  // confirmation modal regardless of which one was clicked.
  function requestStart(consultationId: string) {
    selectConsultation(consultationId);
    setPendingStartId(consultationId);
  }

  async function handleStart(consultationId: string) {
    if (!accessToken) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(consultationId, accessToken, {
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

  function handleFollowUpLinked(updated: Consultation) {
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
                  {visibleRows.map((row) => {
                    const rowBookingStatus = row.consultation.booking?.status;
                    const isRowCompleted = rowBookingStatus
                      ? FINISHED_BOOKING_STATUSES.includes(rowBookingStatus)
                      : false;
                    const canScheduleFollowUp =
                      canWrite &&
                      isRowCompleted &&
                      !row.consultation.follow_up_booking_id;

                    const rowMenuItems: MoreOptionsMenuItem[] = [
                      {
                        label: 'View Details',
                        onSelect: () => setViewDetailsId(row.consultation.id),
                      },
                    ];
                    if (canScheduleFollowUp) {
                      rowMenuItems.push({
                        label: 'Schedule Follow-up',
                        onSelect: () => {
                          selectConsultation(row.consultation.id);
                          setFollowUpTargetId(row.consultation.id);
                        },
                      });
                    }

                    return (
                      <li
                        key={row.consultation.id}
                        className={
                          row.consultation.id === selectedId
                            ? styles.rowItemActive
                            : styles.rowItem
                        }
                      >
                        <button
                          type="button"
                          className={styles.rowButton}
                          onClick={() => selectConsultation(row.consultation.id)}
                        >
                          <div className={styles.rowHeader}>
                            <span className={styles.rowPetName}>
                              {row.petName}
                            </span>
                            {rowBookingStatus ? (
                              <BookingStatusBadge status={rowBookingStatus} />
                            ) : null}
                          </div>
                          <span className={styles.rowMeta}>
                            Owner: {row.ownerName}
                          </span>
                          <span className={styles.rowMeta}>
                            {formatScheduledTime(row.scheduledStart)}
                          </span>
                        </button>
                        {canWrite && rowBookingStatus === 'Pending' ? (
                          <button
                            type="button"
                            className={styles.startButton}
                            disabled={isSaving}
                            onClick={() => requestStart(row.consultation.id)}
                          >
                            Start Consultation
                          </button>
                        ) : null}
                        <MoreOptionsMenu
                          label={`Options for ${row.petName}`}
                          items={rowMenuItems}
                        />
                      </li>
                    );
                  })}
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
                  onStart={() => requestStart(selectedRow.consultation.id)}
                  onComplete={(fields) => void handleComplete(fields)}
                />
              ) : (
                <p className={styles.copy}>Select a consultation to begin.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={pendingStartId !== null}
        title="Start Consultation"
        onClose={() => setPendingStartId(null)}
      >
        <p className={styles.copy}>
          Start this consultation for {pendingStartRow?.petName ?? 'this pet'}?
          This moves the booking to In Progress.
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.startButton}
            disabled={isSaving}
            onClick={() => {
              if (!pendingStartId) return;
              const id = pendingStartId;
              setPendingStartId(null);
              void handleStart(id);
            }}
          >
            {isSaving ? 'Starting...' : 'Start Consultation'}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => setPendingStartId(null)}
          >
            Cancel
          </button>
        </div>
      </Modal>

      {followUpTargetRow?.consultation.booking ? (
        <ScheduleFollowUpModal
          accessToken={accessToken}
          consultationId={followUpTargetRow.consultation.id}
          petId={followUpTargetRow.consultation.pet_id}
          petName={followUpTargetRow.petName}
          customerId={followUpTargetRow.consultation.booking.customer_id}
          ownerName={followUpTargetRow.ownerName}
          branchId={followUpTargetRow.consultation.booking.branch_id}
          originalSpecialInstructions={
            followUpTargetRow.consultation.booking.special_instructions
          }
          onClose={() => setFollowUpTargetId(null)}
          onLinked={handleFollowUpLinked}
        />
      ) : null}

      <Modal
        isOpen={viewDetailsRow !== undefined}
        title="Consultation Details"
        onClose={() => setViewDetailsId(null)}
      >
        {viewDetailsRow ? (
          <div className={styles.viewDetailsBody}>
            <div className={styles.viewDetailsHeader}>
              <div>
                <h3 className={styles.viewDetailsName}>
                  {viewDetailsRow.petName}
                </h3>
                <span className={styles.copy}>
                  Owner: {viewDetailsRow.ownerName}
                </span>
              </div>
              {viewDetailsRow.consultation.booking?.status ? (
                <BookingStatusBadge
                  status={viewDetailsRow.consultation.booking.status}
                />
              ) : null}
            </div>

            <p className={styles.copy}>
              Reason: {viewDetailsRow.consultation.reason_for_visit}
            </p>

            <div className={styles.viewDetailsGrid}>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Temperature</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.temperature ?? '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Weight</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.weight ?? '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Heart Rate</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.heart_rate ?? '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Respiratory Rate</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.respiratory_rate ?? '—'}
                </span>
              </div>
            </div>

            <div className={styles.detailField}>
              <span className={styles.detailLabel}>Diagnosis</span>
              <span className={styles.detailValue}>
                {viewDetailsRow.consultation.diagnosis || '—'}
              </span>
            </div>

            <div className={styles.detailField}>
              <span className={styles.detailLabel}>Medications</span>
              {viewDetailsRow.consultation.medications &&
              viewDetailsRow.consultation.medications.length > 0 ? (
                <ul className={styles.medicationList}>
                  {viewDetailsRow.consultation.medications.map(
                    (medication, index) => (
                      <li key={index} className={styles.detailValue}>
                        {medication.name} — {medication.dose}
                        {medication.notes ? ` (${medication.notes})` : ''}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <span className={styles.detailValue}>
                  No medications recorded.
                </span>
              )}
            </div>

            {viewDetailsRow.consultation.follow_up_booking_id ? (
              <span className={styles.followUpIndicator}>
                Follow-up scheduled
                {viewDetailsRow.consultation.follow_up_date
                  ? ` for ${viewDetailsRow.consultation.follow_up_date}`
                  : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
