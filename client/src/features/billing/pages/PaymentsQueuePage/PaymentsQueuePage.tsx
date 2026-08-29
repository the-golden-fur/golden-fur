import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
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
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import { PaymentStageBadge } from '../../../booking/components/shared/PaymentStageBadge/PaymentStageBadge';
import { listBookingTransactions } from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
import {
  advancePaymentStage,
  completeBooking,
  listBookings,
  overrideBookingStatus,
  overridePaymentStage,
  startBooking,
} from '../../../booking/api/booking.api';
import {
  BOOKING_STATUS_OVERRIDE_ROLES,
  BOOKING_STATUSES,
  OVERRIDABLE_BOOKING_STATUSES,
  OVERRIDABLE_PAYMENT_STAGES,
  PAYMENT_STAGES,
  SERVICE_CATEGORIES,
  type Booking,
  type BookingStatus,
  type PaymentStage,
  type ServiceCategory,
} from '../../../booking/booking.types';
import styles from './PaymentsQueuePage.module.css';

// Same option lists/labels as PetDetailPanel's own staff-only assessment
// fields - kept local rather than shared since PetDetailPanel's are scoped
// to that component too.
const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPE_OPTIONS: PetCoatType[] = ['SC', 'LC'];

const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  ...BOOKING_STATUSES.map((status) => ({ value: status, label: status })),
];

type SortKey = 'soonest' | 'latest' | 'pet-name' | 'owner-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Scheduled time (soonest)' },
  { value: 'latest', label: 'Sort: Scheduled time (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'owner-name', label: 'Sort: Owner name (A-Z)' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type ActiveAction =
  | {
      bookingId: string;
      type: 'advance-payment';
    }
  | {
      bookingId: string;
      // Custom change (payments-queue pet assessment capture): Starting a
      // booking on a captures_pet_assessment-flagged service (Initial
      // Assessment/Reassessment) prompts this instead of starting
      // immediately - see confirmAssessment below.
      type: 'assess-pet';
    };

/**
 * Custom change (bookings-queue-readonly-and-sidebar-reorg): the payment
 * side of the old ReceptionistBookingsQueuePage - Mark as Paid, the
 * Admin/Superadmin payment-stage override dropdown, and (since Misc-category
 * bookings have no dedicated queue of their own, unlike Hotel/Daycare/
 * Grooming/Veterinary) that category's Start/Complete/status-override too.
 * Filtering/search/sort/role-resolution intentionally mirror
 * ReceptionistBookingsQueuePage's own scaffold so the two queues stay
 * consistent for staff switching between them.
 */
export function PaymentsQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchFilter, setBranchFilter] = useState('All');
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'All'>(
    'All'
  );
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>(
    'All'
  );
  const [paymentStageFilter, setPaymentStageFilter] = useState<
    PaymentStage | 'All'
  >('All');

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);

  // §6 (down-payment slot gate): per-booking payment history, lazily
  // fetched the first time a row's "View payments" is opened.
  const [openPaymentsBookingId, setOpenPaymentsBookingId] = useState<
    string | null
  >(null);
  const [transactionsByBooking, setTransactionsByBooking] = useState<
    Record<string, Transaction[]>
  >({});
  const [transactionsLoadingId, setTransactionsLoadingId] = useState<
    string | null
  >(null);
  const [transactionsError, setTransactionsError] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);

  async function togglePayments(bookingId: string) {
    if (openPaymentsBookingId === bookingId) {
      setOpenPaymentsBookingId(null);
      return;
    }

    setOpenPaymentsBookingId(bookingId);
    setTransactionsError(null);

    if (transactionsByBooking[bookingId] || !accessToken) return;

    setTransactionsLoadingId(bookingId);
    const result = await listBookingTransactions(bookingId, accessToken);
    setTransactionsLoadingId(null);

    if (result.error || !result.data) {
      setTransactionsError({
        bookingId,
        message: result.error ?? 'Could not load the payment history.',
      });
      return;
    }

    setTransactionsByBooking((prev) => ({
      ...prev,
      [bookingId]: result.data as Transaction[],
    }));
  }

  // Viewer role/branch via the requester's own row in GET /staff, same
  // recipe as ReceptionistBookingsQueuePage.
  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
      setViewerBranchId(self?.branch_id ?? null);
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
    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, []);

  // Custom change (payments-queue pet assessment capture): Misc is the only
  // category this queue advances status for, so only Misc services' flags
  // are worth fetching. includeInactive covers a booking whose service was
  // later deactivated but still needs its Start button gated correctly.
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    if (!accessToken) return;

    void listServices(accessToken, {
      category: 'Misc',
      includeInactive: true,
    }).then((result) => {
      if (result.data) setServices(result.data);
    });
  }, [accessToken]);

  const assessmentServiceIds = useMemo(
    () =>
      new Set(
        services
          .filter((service) => service.captures_pet_assessment)
          .map((service) => service.id)
      ),
    [services]
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
    if (!accessToken || isRoleLoading) return;

    const token = accessToken;
    let isMounted = true;

    void listBookings(token, {
      branchId: effectiveBranchId,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
      serviceCategory: categoryFilter === 'All' ? undefined : categoryFilter,
      status: statusFilter === 'All' ? undefined : statusFilter,
      paymentStage:
        paymentStageFilter === 'All' ? undefined : paymentStageFilter,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the payments queue.');
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
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isRoleLoading,
    effectiveBranchId,
    dateRange.from,
    dateRange.to,
    categoryFilter,
    statusFilter,
    paymentStageFilter,
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
    if (categoryFilter !== 'All') {
      chips.push({
        id: 'category',
        label: `Service: ${categoryFilter}`,
        onClear: () => setCategoryFilter('All'),
      });
    }
    if (paymentStageFilter !== 'All') {
      chips.push({
        id: 'payment',
        label: `Payment: ${paymentStageFilter}`,
        onClear: () => setPaymentStageFilter('All'),
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
    categoryFilter,
    paymentStageFilter,
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

  // Error kept alongside the booking id it belongs to (mirrors
  // ReceptionistBookingsQueuePage's own advanceError) so it renders under
  // the right row after `advancingBookingId` itself has already cleared.
  const [advancingBookingId, setAdvancingBookingId] = useState<string | null>(
    null
  );
  const [advanceError, setAdvanceError] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);

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

  // Misc-category start/complete/status-override: every other service
  // category advances status through its own dedicated queue (Hotel/Daycare
  // check-in-out, Grooming queue, Veterinary console) - Misc (Initial
  // Assessment/Reassessment) has none, so it keeps the old generic actions
  // here rather than losing them entirely.
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

  // Custom change (payments-queue pet assessment capture): pre-filled from
  // the pet's current values (if any) so Reassessment can just confirm/
  // adjust rather than starting blank every time.
  const [assessWeightClass, setAssessWeightClass] = useState<
    PetWeightClass | ''
  >('');
  const [assessCoatType, setAssessCoatType] = useState<PetCoatType | ''>('');

  function openAssessment(booking: Booking) {
    const pet = pets[booking.pet_id];
    setAssessWeightClass(pet?.weight_class ?? '');
    setAssessCoatType(pet?.coat_type ?? '');
    setAdvanceError(null);
    setActiveAction({ bookingId: booking.id, type: 'assess-pet' });
  }

  // Saves the pet's assessment first, then starts the booking - only on a
  // successful save does it proceed to Start, so a rejected pet update
  // (e.g. a role without pet-edit rights) never leaves the booking started
  // with the assessment modal silently abandoned.
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
    if (started) {
      setActiveAction(null);
    }
  }

  function handleOverrideStatus(booking: Booking, status: BookingStatus) {
    return runAdvanceAction(
      booking,
      (bookingId, token) => overrideBookingStatus(bookingId, status, token),
      'Could not update this booking’s status.'
    );
  }

  // payment_stage "Mark as Paid" action - independent of the status actions
  // above (see PaymentStage's dev note in booking.types.ts). From Unpaid,
  // clicking it opens a modal (via `activeAction`, rendered once outside the
  // row list below) asking whether this is an advance payment or a normal
  // onsite one; from Paid in Advance there's only one possible next step, so
  // it advances straight to Paid with no modal.
  function handleAdvancePayment(
    booking: Booking,
    choice?: 'advance' | 'onsite'
  ) {
    return runAdvanceAction(
      booking,
      (bookingId, token) => advancePaymentStage(bookingId, token, choice),
      'Could not advance this booking’s payment stage.'
    );
  }

  function openAdvancePayment(booking: Booking) {
    if (booking.payment_stage === 'Paid in Advance') {
      void handleAdvancePayment(booking);
      return;
    }
    setActiveAction({ bookingId: booking.id, type: 'advance-payment' });
  }

  async function confirmAdvancePayment(
    booking: Booking,
    choice: 'advance' | 'onsite'
  ) {
    const succeeded = await handleAdvancePayment(booking, choice);
    if (succeeded) setActiveAction(null);
  }

  function handleOverridePaymentStage(booking: Booking, stage: PaymentStage) {
    return runAdvanceAction(
      booking,
      (bookingId, token) => overridePaymentStage(bookingId, stage, token),
      'Could not update this booking’s payment stage.'
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the payments queue.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  // Rendered once, outside the row list, as a modal - not per-row - since
  // only one booking can ever be mid-prompt at a time (activeAction is
  // single-valued).
  const paymentAdvanceModalBooking =
    activeAction?.type === 'advance-payment'
      ? (bookings.find((booking) => booking.id === activeAction.bookingId) ??
        null)
      : null;

  const assessmentModalBooking =
    activeAction?.type === 'assess-pet'
      ? (bookings.find((booking) => booking.id === activeAction.bookingId) ??
        null)
      : null;
  const assessmentModalPet = assessmentModalBooking
    ? (pets[assessmentModalBooking.pet_id] ?? null)
    : null;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Payments Queue</h1>
        </div>

        <QueueFilterBar
          dateRangePreset={dateRangePreset}
          onDateRangePresetChange={setDateRangePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          statusValue={statusFilter}
          onStatusChange={(value) =>
            setStatusFilter(value as BookingStatus | 'All')
          }
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

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Service type</span>
            <select
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as ServiceCategory | 'All')
              }
            >
              <option value="All">All service types</option>
              {SERVICE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Payment status</span>
            <select
              className={styles.filterSelect}
              value={paymentStageFilter}
              onChange={(event) =>
                setPaymentStageFilter(
                  event.target.value as PaymentStage | 'All'
                )
              }
            >
              <option value="All">All payment statuses</option>
              {PAYMENT_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>

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
          <p className={styles.copy}>No bookings match these filters.</p>
        ) : null}

        {!isLoading && !loadError && filteredAndSorted.length > 0 ? (
          <ul className={styles.bookingList}>
            {filteredAndSorted.map((booking) => {
              const isMisc = booking.service_category === 'Misc';
              const canOverrideStatus =
                isMisc &&
                isStatusOverrideRole &&
                (OVERRIDABLE_BOOKING_STATUSES as readonly string[]).includes(
                  booking.status
                );
              const canAdvanceStatus =
                isMisc &&
                !isStatusOverrideRole &&
                viewerRole !== 'Cashier' &&
                (booking.status === 'Pending' ||
                  booking.status === 'In Progress');
              const canOverridePaymentStage =
                isStatusOverrideRole &&
                (OVERRIDABLE_PAYMENT_STAGES as readonly string[]).includes(
                  booking.payment_stage
                );
              const canAdvancePayment =
                !isStatusOverrideRole && booking.payment_stage !== 'Paid';
              const isAdvancing = advancingBookingId === booking.id;

              return (
                <li key={booking.id} className={styles.bookingRow}>
                  <div className={styles.bookingHeader}>
                    <span className={styles.bookingTitle}>
                      {booking.service_category}
                    </span>
                    <div className={styles.bookingBadges}>
                      <BookingStatusBadge status={booking.status} />
                      <PaymentStageBadge stage={booking.payment_stage} />
                      <MoreOptionsMenu
                        label={`More options for this ${booking.service_category} booking`}
                        items={[
                          {
                            label: 'View details',
                            onSelect: () =>
                              navigate(`/staff/bookings/${booking.id}`),
                          },
                          {
                            label:
                              openPaymentsBookingId === booking.id
                                ? 'Hide payments'
                                : 'View payments',
                            onSelect: () => void togglePayments(booking.id),
                          },
                        ]}
                      />
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

                  <div className={styles.bookingControls}>
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
                        disabled={isAdvancing}
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
                    {canOverridePaymentStage ? (
                      <label className={styles.statusOverrideField}>
                        <span className={styles.filterLabel}>Payment</span>
                        <select
                          className={styles.filterSelect}
                          value={booking.payment_stage}
                          disabled={isAdvancing}
                          onChange={(event) =>
                            void handleOverridePaymentStage(
                              booking,
                              event.target.value as PaymentStage
                            )
                          }
                        >
                          {OVERRIDABLE_PAYMENT_STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {canAdvancePayment ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isAdvancing}
                        onClick={() => openAdvancePayment(booking)}
                      >
                        {isAdvancing ? 'Marking paid...' : 'Mark as Paid'}
                      </button>
                    ) : null}
                  </div>

                  {advanceError && advanceError.bookingId === booking.id ? (
                    <p className={styles.errorBanner} role="alert">
                      {advanceError.message}
                    </p>
                  ) : null}

                  {openPaymentsBookingId === booking.id ? (
                    <div className={styles.paymentsPanel}>
                      <p className={styles.paymentsPanelTitle}>
                        Payments for this booking
                      </p>
                      {transactionsLoadingId === booking.id ? (
                        <p className={styles.copy}>Loading payments...</p>
                      ) : null}
                      {transactionsError?.bookingId === booking.id ? (
                        <p className={styles.errorBanner} role="alert">
                          {transactionsError.message}
                        </p>
                      ) : null}
                      {transactionsLoadingId !== booking.id &&
                      transactionsError?.bookingId !== booking.id &&
                      transactionsByBooking[booking.id] !== undefined &&
                      transactionsByBooking[booking.id].length === 0 ? (
                        <p className={styles.copy}>
                          No payments recorded yet for this booking.
                        </p>
                      ) : null}
                      {(transactionsByBooking[booking.id] ?? []).length > 0 ? (
                        <ul className={styles.paymentsList}>
                          {transactionsByBooking[booking.id].map(
                            (transaction) => (
                              <li
                                key={transaction.id}
                                className={styles.paymentRow}
                              >
                                <span className={styles.paymentAmount}>
                                  PHP {transaction.total_amount.toFixed(2)}
                                </span>
                                <span className={styles.paymentMeta}>
                                  {transaction.payment_choice === 'downpayment'
                                    ? 'Down payment'
                                    : 'Full payment'}{' '}
                                  · {transaction.payment_method} ·{' '}
                                  {transaction.payment_status}
                                </span>
                                <span className={styles.paymentMeta}>
                                  {formatDateTime(transaction.created_at)}
                                  {transaction.payment_reference
                                    ? ` · Ref ${transaction.payment_reference}`
                                    : ''}
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {paymentAdvanceModalBooking ? (
          <div className={styles.modalBackdrop} role="presentation">
            <section
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mark-as-paid-title"
            >
              <h2 id="mark-as-paid-title" className={styles.modalTitle}>
                Mark as Paid
              </h2>
              <p className={styles.modalBody}>
                Was this payment collected in advance (before the service
                happens), or is this a normal onsite payment?
              </p>

              {advanceError &&
              advanceError.bookingId === paymentAdvanceModalBooking.id ? (
                <p className={styles.errorBanner} role="alert">
                  {advanceError.message}
                </p>
              ) : null}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setActiveAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    advancingBookingId === paymentAdvanceModalBooking.id
                  }
                  onClick={() =>
                    void confirmAdvancePayment(
                      paymentAdvanceModalBooking,
                      'onsite'
                    )
                  }
                >
                  {advancingBookingId === paymentAdvanceModalBooking.id
                    ? 'Marking paid...'
                    : 'Normal onsite payment'}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    advancingBookingId === paymentAdvanceModalBooking.id
                  }
                  onClick={() =>
                    void confirmAdvancePayment(
                      paymentAdvanceModalBooking,
                      'advance'
                    )
                  }
                >
                  {advancingBookingId === paymentAdvanceModalBooking.id
                    ? 'Marking paid...'
                    : 'Advance payment'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {assessmentModalBooking ? (
          <div className={styles.modalBackdrop} role="presentation">
            <section
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="assess-pet-title"
            >
              <h2 id="assess-pet-title" className={styles.modalTitle}>
                Record pet assessment
              </h2>
              <p className={styles.modalBody}>
                {assessmentModalPet?.name ?? 'This pet'}&apos;s weight class and
                coat type are recorded as part of starting this booking.
                Starting will save the assessment first.
              </p>

              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Weight class</span>
                <select
                  className={styles.filterSelect}
                  value={assessWeightClass}
                  onChange={(event) =>
                    setAssessWeightClass(
                      event.target.value as PetWeightClass | ''
                    )
                  }
                >
                  <option value="">Select weight class</option>
                  {WEIGHT_CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Coat type</span>
                <select
                  className={styles.filterSelect}
                  value={assessCoatType}
                  onChange={(event) =>
                    setAssessCoatType(event.target.value as PetCoatType | '')
                  }
                >
                  <option value="">Select coat type</option>
                  {COAT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              {advanceError &&
              advanceError.bookingId === assessmentModalBooking.id ? (
                <p className={styles.errorBanner} role="alert">
                  {advanceError.message}
                </p>
              ) : null}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setActiveAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    !assessWeightClass ||
                    !assessCoatType ||
                    advancingBookingId === assessmentModalBooking.id
                  }
                  onClick={() => void confirmAssessment(assessmentModalBooking)}
                >
                  {advancingBookingId === assessmentModalBooking.id
                    ? 'Saving...'
                    : 'Save & Start'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
