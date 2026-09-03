import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  listBranches,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import type {
  BranchSummary,
  Service,
} from '../../../maintenance/maintenance.types';
import {
  getCustomerProfile,
  getPet,
  updatePet,
} from '../../../customers/api/customer.api';
import type {
  CustomerProfile,
  Pet,
  PetCoatType,
  PetWeightClass,
} from '../../../customers/customer.types';
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
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BookingConfirmationBadge } from '../../components/shared/BookingConfirmationBadge/BookingConfirmationBadge';
import { PaymentStatusBadge } from '../../components/shared/PaymentStatusBadge/PaymentStatusBadge';
import { AssessmentModal } from '../../components/AssessmentModal/AssessmentModal';
import {
  completeBooking,
  listBookings,
  overrideBookingStatus,
  startBooking,
} from '../../api/booking.api';
import {
  BOOKING_STATUS_OVERRIDE_ROLES,
  OVERRIDABLE_BOOKING_STATUSES,
  type Booking,
  type BookingStatus,
} from '../../booking.types';
import {
  BOOKING_CONFIRMATION_HINT,
  deriveBookingConfirmationState,
} from '../../bookingConfirmation';
import styles from './AssessmentQueuePage.module.css';

// Everyone except Cashier - mirrors the viewerRole !== 'Cashier' gate this
// queue used when it was folded into ReceptionistBookingsQueuePage, just as
// a page-level redirect instead of per-row hiding.
const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Pet Assistant',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

type StatusFilter = BookingStatus | 'All';
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'No-show', label: 'No-show' },
];

type SortKey = 'soonest' | 'latest' | 'pet-name' | 'owner-name';
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Scheduled time (soonest)' },
  { value: 'latest', label: 'Sort: Scheduled time (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'owner-name', label: 'Sort: Owner name (A-Z)' },
];

// No WebSocket/realtime infra exists anywhere in this codebase - short
// interval polling instead, same recipe as GroomerDashboardPage.
const REFRESH_INTERVAL_MS = 15_000;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Dedicated queue for the "Assessment" service category (Initial Assessment
 * / Reassessment) - the one category that used to have no queue of its own
 * and was folded into ReceptionistBookingsQueuePage as a special case (see
 * that file's header comment history). This page now owns Start/Complete/
 * the Admin-Superadmin status-override dropdown, plus the pet-assessment
 * capture modal on Start, matching every other category's own dedicated
 * queue (Grooming, Hotel, Daycare, Veterinary). Assessment bookings still
 * also show up read-only on the general Bookings Queue for view details/
 * reschedule/cancel, same as every other category does there.
 */
export function AssessmentQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchFilter, setBranchFilter] = useState('All');
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Own in-flight/error state, scoped to the row being advanced - same
  // shape ReceptionistBookingsQueuePage used before this was extracted.
  const [assessmentServices, setAssessmentServices] = useState<Service[]>([]);
  const [advancingBookingId, setAdvancingBookingId] = useState<string | null>(
    null
  );
  const [advanceError, setAdvanceError] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);
  const [assessTargetBookingId, setAssessTargetBookingId] = useState<
    string | null
  >(null);
  const [assessWeightClass, setAssessWeightClass] = useState<
    PetWeightClass | ''
  >('');
  const [assessCoatType, setAssessCoatType] = useState<PetCoatType | ''>('');

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setViewerRole(result.data.role);
        setViewerBranchId(result.data.branch_id);
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

  const isSuperadmin = viewerRole === 'Superadmin';
  // Admin/Superadmin get one status dropdown (forward or backward) instead
  // of the one-directional Start/Complete buttons everyone else uses.
  const isStatusOverrideRole =
    viewerRole !== null && BOOKING_STATUS_OVERRIDE_ROLES.includes(viewerRole);

  useEffect(() => {
    if (roleStatus !== 'ok') return;

    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, [roleStatus]);

  // This queue only ever advances Assessment bookings, so only Assessment
  // services' captures_pet_assessment flag is worth fetching. includeInactive
  // covers a booking whose service was later deactivated.
  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    void listServices(accessToken, {
      category: 'Assessment',
      includeInactive: true,
    }).then((result) => {
      if (result.data) setAssessmentServices(result.data);
    });
  }, [roleStatus, accessToken]);

  const assessmentServiceIds = useMemo(
    () =>
      new Set(
        assessmentServices
          .filter((service) => service.captures_pet_assessment)
          .map((service) => service.id)
      ),
    [assessmentServices]
  );

  function bookingNeedsAssessment(booking: Booking): boolean {
    return (
      booking.booking_items?.some(
        (item) =>
          item.service_id !== null && assessmentServiceIds.has(item.service_id)
      ) ?? false
    );
  }

  const effectiveBranchId = isSuperadmin
    ? branchFilter === 'All'
      ? undefined
      : branchFilter
    : (viewerBranchId ?? undefined);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    const token = accessToken;
    let isMounted = true;

    function handleQueueResult(
      result: Awaited<ReturnType<typeof listBookings>>
    ) {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the assessment queue.');
        return;
      }

      setLoadError(null);
      setBookings(result.data);

      const petIds = new Set(result.data.map((booking) => booking.pet_id));
      const customerIds = new Set(
        result.data.map((booking) => booking.customer_id)
      );

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

    const query = {
      branchId: effectiveBranchId,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
      serviceCategory: 'Assessment' as const,
      status: statusFilter === 'All' ? undefined : statusFilter,
    };

    void listBookings(token, query).then(handleQueueResult);

    const interval = setInterval(() => {
      void listBookings(token, query).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [
    roleStatus,
    accessToken,
    effectiveBranchId,
    dateRange.from,
    dateRange.to,
    statusFilter,
  ]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredAndSorted,
  } = useSearchAndSort<Booking, SortKey>({
    items: bookings,
    matchesQuery: (booking, query) => {
      const petName = pets[booking.pet_id]?.name ?? '';
      const ownerName = owners[booking.customer_id]?.full_name ?? '';
      return (
        petName.toLowerCase().includes(query) ||
        ownerName.toLowerCase().includes(query)
      );
    },
    comparators: {
      soonest: (a, b) =>
        new Date(a.scheduled_start).getTime() -
        new Date(b.scheduled_start).getTime(),
      latest: (a, b) =>
        new Date(b.scheduled_start).getTime() -
        new Date(a.scheduled_start).getTime(),
      'pet-name': (a, b) =>
        (pets[a.pet_id]?.name ?? '').localeCompare(pets[b.pet_id]?.name ?? ''),
      'owner-name': (a, b) =>
        (owners[a.customer_id]?.full_name ?? '').localeCompare(
          owners[b.customer_id]?.full_name ?? ''
        ),
    },
    initialSortKey: 'soonest',
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
    if (isSuperadmin && branchFilter !== 'All') {
      chips.push({
        id: 'branch',
        label: `Branch: ${branchNameById.get(branchFilter) ?? branchFilter}`,
        onClear: () => setBranchFilter('All'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'soonest') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('soonest'),
      });
    }

    return chips;
  }, [
    dateRangePreset,
    statusFilter,
    isSuperadmin,
    branchFilter,
    branchNameById,
    search,
    sortKey,
    setSearch,
    setSortKey,
  ]);

  function replaceBooking(updated: Booking) {
    setBookings((prev) =>
      prev.map((booking) => (booking.id === updated.id ? updated : booking))
    );
  }

  async function runAdvanceAction(
    booking: Booking,
    action: (
      bookingId: string,
      accessToken: string
    ) => ReturnType<typeof startBooking>,
    failureMessage: string
  ): Promise<boolean> {
    if (!accessToken) return false;

    setAdvancingBookingId(booking.id);
    setAdvanceError(null);

    const result = await action(booking.id, accessToken);

    setAdvancingBookingId(null);

    if (result.error || !result.data) {
      setAdvanceError({
        bookingId: booking.id,
        message: result.error ?? failureMessage,
      });
      return false;
    }

    replaceBooking(result.data);
    return true;
  }

  function handleStart(booking: Booking) {
    return runAdvanceAction(
      booking,
      startBooking,
      'Could not start this booking.'
    );
  }

  function handleComplete(booking: Booking) {
    return runAdvanceAction(
      booking,
      completeBooking,
      'Could not complete this booking.'
    );
  }

  function handleOverrideStatus(booking: Booking, status: BookingStatus) {
    return runAdvanceAction(
      booking,
      (bookingId, token) => overrideBookingStatus(bookingId, status, token),
      'Could not update this booking’s status.'
    );
  }

  // Pre-filled from the pet's current values (if any) so Reassessment can
  // just confirm/adjust rather than starting blank.
  function openAssessment(booking: Booking) {
    const pet = pets[booking.pet_id];
    setAssessWeightClass(pet?.weight_class ?? '');
    setAssessCoatType(pet?.coat_type ?? '');
    setAdvanceError(null);
    setAssessTargetBookingId(booking.id);
  }

  // Saves the pet's assessment first, then starts the booking - only on a
  // successful save does it proceed to Start.
  async function confirmAssessment(booking: Booking) {
    if (!accessToken || !assessWeightClass || !assessCoatType) return;

    setAdvancingBookingId(booking.id);
    setAdvanceError(null);

    const petResult = await updatePet(booking.pet_id, accessToken, {
      weight_class: assessWeightClass,
      coat_type: assessCoatType,
    });

    if (petResult.error || !petResult.data) {
      setAdvancingBookingId(null);
      setAdvanceError({
        bookingId: booking.id,
        message: petResult.error ?? "Could not save this pet's assessment.",
      });
      return;
    }

    const savedPet = petResult.data;
    setPets((prev) => ({ ...prev, [savedPet.id]: savedPet }));

    const started = await handleStart(booking);
    if (started) setAssessTargetBookingId(null);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the assessment queue.
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

  const assessmentModalBooking = assessTargetBookingId
    ? bookings.find((booking) => booking.id === assessTargetBookingId)
    : undefined;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Assessment Queue</h1>

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
            searchPlaceholder="Search by pet or owner name..."
            sortValue={sortKey}
            onSortChange={setSortKey}
            sortOptions={SORT_OPTIONS}
          />

          {isSuperadmin ? (
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Branch</span>
              <select
                className={styles.filterSelect}
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
              >
                <option value="All">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </QueueFilterBar>

        <ActiveFilterChips chips={filterChips} />

        {isLoading ? <p className={styles.copy}>Loading bookings...</p> : null}

        {loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : null}

        {!isLoading && !loadError && filteredAndSorted.length === 0 ? (
          <p className={styles.copy}>
            No assessment bookings match these filters.
          </p>
        ) : null}

        {!isLoading && !loadError && filteredAndSorted.length > 0 ? (
          <ul className={styles.bookingList}>
            {filteredAndSorted.map((booking) => {
              const confirmationState = deriveBookingConfirmationState(booking);
              const canOverrideStatus =
                isStatusOverrideRole &&
                (OVERRIDABLE_BOOKING_STATUSES as readonly string[]).includes(
                  booking.status
                );
              const canAdvanceStatus =
                !isStatusOverrideRole &&
                (booking.status === 'Pending' ||
                  booking.status === 'In Progress');
              const isAdvancing = advancingBookingId === booking.id;

              return (
                <li key={booking.id} className={styles.bookingRow}>
                  <div className={styles.bookingHeader}>
                    <span className={styles.bookingTitle}>
                      {booking.service_category}
                    </span>
                    <div className={styles.bookingBadges}>
                      <BookingConfirmationBadge booking={booking} />
                      <PaymentStatusBadge status={booking.payment_status} />
                    </div>
                  </div>
                  <span className={styles.bookingMeta}>
                    {branchNameById.get(booking.branch_id) ?? 'Branch'} -{' '}
                    {formatDateTime(booking.scheduled_start)}
                  </span>
                  <span className={styles.bookingMeta}>
                    {pets[booking.pet_id]?.name ?? 'Unknown pet'} - Owner{' '}
                    {owners[booking.customer_id]?.full_name ?? 'Unknown owner'}
                  </span>

                  {confirmationState === 'Unconfirmed' ? (
                    <p className={styles.unconfirmedHint}>
                      {BOOKING_CONFIRMATION_HINT.Unconfirmed}
                      {booking.downpayment_due_at
                        ? ` Due ${formatDateTime(booking.downpayment_due_at)}.`
                        : ''}
                    </p>
                  ) : null}

                  <div className={styles.bookingControls}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => navigate(`/staff/bookings/${booking.id}`)}
                    >
                      View details
                    </button>
                    {canOverrideStatus ? (
                      <label className={styles.statusOverrideField}>
                        <span className={styles.filterLabel}>Status</span>
                        <select
                          className={styles.filterSelect}
                          value={booking.status}
                          disabled={isAdvancing}
                          onChange={(event) =>
                            void handleOverrideStatus(
                              booking,
                              event.target.value as BookingStatus
                            )
                          }
                        >
                          {OVERRIDABLE_BOOKING_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {canAdvanceStatus && booking.status === 'Pending' ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={
                          isAdvancing || confirmationState !== 'Confirmed'
                        }
                        onClick={() =>
                          bookingNeedsAssessment(booking)
                            ? openAssessment(booking)
                            : void handleStart(booking)
                        }
                      >
                        {isAdvancing ? 'Starting...' : 'Start'}
                      </button>
                    ) : null}
                    {canAdvanceStatus && booking.status === 'In Progress' ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isAdvancing}
                        onClick={() => void handleComplete(booking)}
                      >
                        {isAdvancing ? 'Completing...' : 'Complete'}
                      </button>
                    ) : null}
                  </div>

                  {advanceError?.bookingId === booking.id &&
                  assessTargetBookingId !== booking.id ? (
                    <p className={styles.errorBanner} role="alert">
                      {advanceError.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {assessmentModalBooking ? (
        <AssessmentModal
          pet={pets[assessmentModalBooking.pet_id]}
          weightClass={assessWeightClass}
          onWeightClassChange={setAssessWeightClass}
          coatType={assessCoatType}
          onCoatTypeChange={setAssessCoatType}
          isSaving={advancingBookingId === assessmentModalBooking.id}
          error={
            advanceError?.bookingId === assessmentModalBooking.id
              ? advanceError.message
              : null
          }
          onCancel={() => setAssessTargetBookingId(null)}
          onConfirm={() => void confirmAssessment(assessmentModalBooking)}
        />
      ) : null}
    </main>
  );
}
