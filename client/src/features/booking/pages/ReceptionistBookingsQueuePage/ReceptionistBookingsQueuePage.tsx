import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
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
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BookingStatusBadge } from '../../components/shared/BookingStatusBadge/BookingStatusBadge';
import { PaymentStageBadge } from '../../components/shared/PaymentStageBadge/PaymentStageBadge';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import {
  cancelBooking,
  listBookings,
  rescheduleBooking,
} from '../../api/booking.api';
import {
  listPolicyConfigurations,
  resolveEffectivePolicy,
} from '../../api/policy.api';
import {
  BOOKING_STATUSES,
  CANCELLABLE_BOOKING_STATUSES,
  RESCHEDULABLE_BOOKING_STATUSES,
  SERVICE_CATEGORIES,
  type Booking,
  type BookingStatus,
  type PolicyConfiguration,
  type ServiceCategory,
  type StaffPreferenceInput,
} from '../../booking.types';
import styles from './ReceptionistBookingsQueuePage.module.css';

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

type ViewMode = 'list' | 'calendar';
type CalendarGranularity = 'week' | 'month';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const STATUS_CHIP_CLASS: Record<BookingStatus, keyof typeof styles> = {
  Pending: 'chipPending',
  'In Progress': 'chipInProgress',
  Completed: 'chipCompleted',
  Cancelled: 'chipCancelled',
  'No-show': 'chipNoshow',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** YYYY-MM-DD in local calendar terms - matches how the day cells below and
 * formatDateTime/formatTime already read a booking's scheduled_start in the
 * viewer's own timezone. */
function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dateKeyFromIso(iso: string): string {
  const date = new Date(iso);
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Parses a plain YYYY-MM-DD (as returned by resolveDateRangePreset) into a
 * local-midnight Date - avoids the classic `new Date('2026-08-03')` pitfall
 * of parsing as UTC midnight, which can land on the previous calendar day
 * once converted to a timezone behind UTC. */
function parseIsoDateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

type ActiveAction = {
  bookingId: string;
  type: 'reschedule' | 'cancel';
};

/**
 * Issue #60: branch-wide daily/filtered booking queue for Receptionist/
 * Admin/Supervisor/Superadmin (branch filter additionally shown for
 * Superadmin, AC-2). Reschedule/cancel call the same #54 endpoints a
 * customer would, with the requesting staff_id recorded server-side from
 * the JWT - no separate receptionist-only endpoint (dev notes).
 *
 * Custom change (bookings-queue-readonly-and-sidebar-reorg): Start/Complete,
 * the Admin/Superadmin status-override dropdown, and both payment_stage
 * actions (Mark as Paid / payment-stage override) were removed from here -
 * every service category now advances status through its own dedicated
 * queue (Hotel/Daycare check-in-out, Grooming queue, Veterinary console),
 * and payment actions (plus the Misc-category start/complete that has no
 * dedicated queue of its own) moved to PaymentsQueuePage. This page is left
 * with only the actions that are genuinely a receptionist's own job: view
 * details, reschedule, cancel, and create a new booking.
 */
export function ReceptionistBookingsQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const nowMs = useNowMs();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyConfiguration[]>([]);
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

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [view, setView] = useState<ViewMode>('list');
  const [calendarGranularity, setCalendarGranularity] =
    useState<CalendarGranularity>('month');
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  // Tracks the last dateRange.from the calendar synced to, so the block
  // below can tell "the Date filter changed" apart from "the user clicked
  // Prev/Next" without an effect - adjusting state during render (React's
  // own recommended pattern for this) instead of useEffect+setState avoids
  // an extra cascading render on every filter change.
  const [syncedDateFrom, setSyncedDateFrom] = useState(dateRange.from);

  if (dateRange.from !== syncedDateFrom) {
    setSyncedDateFrom(dateRange.from);
    if (dateRange.from) {
      setCalendarAnchor(parseIsoDateLocal(dateRange.from));
    }
  }

  const calendarYear = calendarAnchor.getFullYear();
  const calendarMonth = calendarAnchor.getMonth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [rescheduleStaffPreference, setRescheduleStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker once StaffPickerList mounts -
  // see StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Viewer role/branch via the requester's own row in GET /staff, same
  // recipe as every other admin-adjacent staff page (the JWT's user.role is
  // just Postgres "authenticated" - the app role only lives in staff_profiles).
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

  useEffect(() => {
    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, []);

  // Reschedule button gate (below) needs the same policy_configurations rows
  // the Policies admin page reads - all-staff read, no role gate needed here.
  useEffect(() => {
    if (!accessToken) return;

    void listPolicyConfigurations(accessToken).then((result) => {
      if (result.data) setPolicies(result.data);
    });
  }, [accessToken]);

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
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the bookings queue.');
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
  ]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  // Search/sort mirror HotelBookingPicker's own useSearchAndSort usage
  // (client-side, over the already date/status/category-filtered `bookings`
  // fetched above) so the two queues offer a consistent search/sort
  // vocabulary via the same shared hook/UI.
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
    isSuperadmin,
    branchFilter,
    branchNameById,
    search,
    sortKey,
    setSearch,
    setSortKey,
  ]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of filteredAndSorted) {
      const key = dateKeyFromIso(booking.scheduled_start);
      const bucket = map.get(key) ?? [];
      bucket.push(booking);
      map.set(key, bucket);
    }
    return map;
  }, [filteredAndSorted]);

  const monthCells = useMemo(() => {
    const leadingBlanks = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDays = daysInMonth(calendarYear, calendarMonth);
    return [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from(
        { length: totalDays },
        (_, index) => new Date(calendarYear, calendarMonth, index + 1)
      ),
    ] as Array<Date | null>;
  }, [calendarYear, calendarMonth]);

  const weekCells = useMemo(() => {
    const start = startOfWeek(calendarAnchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [calendarAnchor]);

  const visibleCells = calendarGranularity === 'week' ? weekCells : monthCells;

  const calendarLabel = useMemo(() => {
    if (calendarGranularity === 'month') {
      return `${MONTH_LABELS[calendarMonth]} ${calendarYear}`;
    }
    const start = weekCells[0];
    const end = weekCells[6];
    const startLabel = `${MONTH_LABELS[start.getMonth()].slice(0, 3)} ${start.getDate()}`;
    const endLabel =
      start.getMonth() === end.getMonth()
        ? `${end.getDate()}`
        : `${MONTH_LABELS[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
    return `${startLabel} - ${endLabel}, ${end.getFullYear()}`;
  }, [calendarGranularity, calendarMonth, calendarYear, weekCells]);

  function goToPrev() {
    setCalendarAnchor((current) =>
      calendarGranularity === 'week' ? addDays(current, -7) : addMonths(current, -1)
    );
  }

  function goToNext() {
    setCalendarAnchor((current) =>
      calendarGranularity === 'week' ? addDays(current, 7) : addMonths(current, 1)
    );
  }

  function replaceBooking(updated: Booking) {
    setBookings((prev) =>
      prev.map((booking) => (booking.id === updated.id ? updated : booking))
    );
  }

  function openReschedule(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'reschedule' });
    setRescheduleSlot(null);
    setRescheduleStaffPreference(null);
    setStaffPickerUnavailable(false);
    setActionError(null);
  }

  function openCancel(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'cancel' });
    setCancellationReason('');
    setActionError(null);
  }

  function closeAction() {
    setActiveAction(null);
  }

  async function confirmReschedule(booking: Booking) {
    if (!accessToken || !rescheduleSlot) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await rescheduleBooking(booking.id, accessToken, {
      scheduled_start: rescheduleSlot.start,
      scheduled_end: rescheduleSlot.end,
      ...(rescheduleStaffPreference
        ? { staff_preference: rescheduleStaffPreference }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not reschedule this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    setActiveAction(null);
  }

  async function confirmCancel(booking: Booking) {
    if (!accessToken) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await cancelBooking(booking.id, accessToken, {
      ...(cancellationReason.trim()
        ? { cancellation_reason: cancellationReason.trim() }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not cancel this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    setActiveAction(null);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the bookings queue.
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

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bookings queue</h1>
          {viewerRole !== 'Cashier' ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate('/staff/bookings/new')}
            >
              New booking
            </button>
          ) : null}
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

        <div
          className={styles.viewToggle}
          role="group"
          aria-label="Bookings view"
        >
          <button
            type="button"
            className={
              view === 'list' ? styles.viewToggleButtonActive : styles.viewToggleButton
            }
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            type="button"
            className={
              view === 'calendar'
                ? styles.viewToggleButtonActive
                : styles.viewToggleButton
            }
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
        </div>

        {isLoading ? <p className={styles.copy}>Loading bookings...</p> : null}

        {loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : null}

        {!isLoading &&
        !loadError &&
        view === 'list' &&
        filteredAndSorted.length === 0 ? (
          <p className={styles.copy}>No bookings match these filters.</p>
        ) : null}

        {!isLoading && !loadError && view === 'calendar' ? (
          <div className={styles.calendarPanel}>
            <div className={styles.monthNav}>
              <button
                type="button"
                className={styles.navButton}
                onClick={goToPrev}
                aria-label={
                  calendarGranularity === 'week' ? 'Previous week' : 'Previous month'
                }
              >
                &larr;
              </button>
              <span className={styles.monthLabel}>{calendarLabel}</span>
              <button
                type="button"
                className={styles.navButton}
                onClick={goToNext}
                aria-label={
                  calendarGranularity === 'week' ? 'Next week' : 'Next month'
                }
              >
                &rarr;
              </button>
              <div
                className={styles.viewToggle}
                role="group"
                aria-label="Calendar granularity"
              >
                <button
                  type="button"
                  className={
                    calendarGranularity === 'week'
                      ? styles.viewToggleButtonActive
                      : styles.viewToggleButton
                  }
                  onClick={() => setCalendarGranularity('week')}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={
                    calendarGranularity === 'month'
                      ? styles.viewToggleButtonActive
                      : styles.viewToggleButton
                  }
                  onClick={() => setCalendarGranularity('month')}
                >
                  Month
                </button>
              </div>
            </div>
            <p className={styles.copy}>
              Showing bookings that match the filters above - set Date to
              &quot;This month&quot; to see a full month at once.
            </p>
            <div className={styles.calendar}>
              {WEEKDAY_HEADERS.map((label) => (
                <div key={label} className={styles.weekdayHeader}>
                  {label}
                </div>
              ))}
              {visibleCells.map((cellDate, index) => {
                if (cellDate === null) {
                  return (
                    <div
                      key={`blank-${index}`}
                      className={styles.dayCellBlank}
                    />
                  );
                }

                const key = dateKey(
                  cellDate.getFullYear(),
                  cellDate.getMonth(),
                  cellDate.getDate()
                );
                const dayBookings = bookingsByDate.get(key) ?? [];

                return (
                  <div
                    key={key}
                    className={
                      calendarGranularity === 'week'
                        ? `${styles.dayCell} ${styles.dayCellWeek}`
                        : styles.dayCell
                    }
                  >
                    <div className={styles.dayCellHeader}>
                      <span>
                        {calendarGranularity === 'week'
                          ? `${MONTH_LABELS[cellDate.getMonth()].slice(0, 3)} ${cellDate.getDate()}`
                          : cellDate.getDate()}
                      </span>
                    </div>
                    <div className={styles.dayChips}>
                      {dayBookings.map((booking) => (
                        <button
                          type="button"
                          key={booking.id}
                          className={`${styles.chip} ${
                            styles[STATUS_CHIP_CLASS[booking.status]]
                          }`}
                          onClick={() =>
                            navigate(`/staff/bookings/${booking.id}`)
                          }
                        >
                          {formatTime(booking.scheduled_start)} -{' '}
                          {pets[booking.pet_id]?.name ?? 'Pet'} (
                          {booking.service_category})
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!isLoading && !loadError && view === 'list' && filteredAndSorted.length > 0 ? (
          <ul className={styles.bookingList}>
            {filteredAndSorted.map((booking) => {
              // Reschedule additionally requires the appointment itself to
              // still be ahead of us - a Pending booking whose own time has
              // already passed is effectively a no-show waiting for the
              // server's lazy transition, not something to move to a new
              // slot (matches reschedule.service.ts's own past-due guard).
              const isPastDue =
                new Date(booking.scheduled_start).getTime() <= nowMs;
              // Mirrors reschedule.service.ts's evaluateNoticePeriod/Strict
              // block exactly, so the button never promises something the
              // server would then reject: enforcement off, Soft mode (the
              // server lets it through with a policy_violation flag, so
              // hiding the button here would contradict that deliberate
              // escape hatch), or the notice window is still satisfied.
              const bookingPolicy = resolveEffectivePolicy(
                policies,
                booking.branch_id
              );
              const noticeMet =
                !bookingPolicy?.notice_enforcement_enabled ||
                bookingPolicy.notice_enforcement_mode === 'Soft' ||
                new Date(booking.scheduled_start).getTime() - nowMs >=
                  bookingPolicy.notice_period_days * 24 * 60 * 60 * 1000;
              const canReschedule =
                RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status) &&
                !isPastDue &&
                noticeMet;
              const canCancel = CANCELLABLE_BOOKING_STATUSES.includes(
                booking.status
              );
              const isRescheduling =
                activeAction?.bookingId === booking.id &&
                activeAction.type === 'reschedule';
              const isCancelling =
                activeAction?.bookingId === booking.id &&
                activeAction.type === 'cancel';

              const durationMinutes = Math.round(
                (new Date(booking.scheduled_end).getTime() -
                  new Date(booking.scheduled_start).getTime()) /
                  60000
              );
              const showStaffPicker =
                (booking.service_category === 'Grooming' ||
                  booking.service_category === 'Veterinary') &&
                rescheduleSlot !== null &&
                !staffPickerUnavailable;

              return (
                <li key={booking.id} className={styles.bookingRow}>
                  <div className={styles.bookingHeader}>
                    <span className={styles.bookingTitle}>
                      {booking.service_category}
                    </span>
                    <div className={styles.bookingBadges}>
                      <BookingStatusBadge status={booking.status} />
                      <PaymentStageBadge stage={booking.payment_stage} />
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

                  {!isRescheduling && !isCancelling ? (
                    <div className={styles.bookingControls}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          navigate(`/staff/bookings/${booking.id}`)
                        }
                      >
                        View details
                      </button>
                      {canReschedule ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => openReschedule(booking)}
                        >
                          Reschedule
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => openCancel(booking)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {isRescheduling ? (
                    <div className={styles.actionPanel}>
                      <SlotPicker
                        accessToken={accessToken}
                        branchId={booking.branch_id}
                        serviceCategory={booking.service_category}
                        slotDurationMinutes={durationMinutes}
                        viewerMode="staff"
                        selectedSlot={rescheduleSlot}
                        onSelect={setRescheduleSlot}
                      />

                      {showStaffPicker && rescheduleSlot ? (
                        <StaffPickerList
                          accessToken={accessToken}
                          branchId={booking.branch_id}
                          serviceCategory={
                            booking.service_category as
                              | 'Grooming'
                              | 'Veterinary'
                          }
                          scheduledStart={rescheduleSlot.start}
                          scheduledEnd={rescheduleSlot.end}
                          selected={rescheduleStaffPreference}
                          onSelect={setRescheduleStaffPreference}
                          onUnavailable={() => setStaffPickerUnavailable(true)}
                        />
                      ) : null}

                      {actionError ? (
                        <p className={styles.errorBanner} role="alert">
                          {actionError}
                        </p>
                      ) : null}

                      <div className={styles.bookingControls}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={!rescheduleSlot || isSubmittingAction}
                          onClick={() => void confirmReschedule(booking)}
                        >
                          {isSubmittingAction
                            ? 'Rescheduling...'
                            : 'Confirm new time'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={closeAction}
                        >
                          Cancel reschedule
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isCancelling ? (
                    <div className={styles.actionPanel}>
                      <p className={styles.copy} role="alert">
                        Cancel this booking on the customer's behalf? This
                        cannot be undone.
                      </p>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          Reason (optional)
                        </span>
                        <textarea
                          className={styles.input}
                          value={cancellationReason}
                          onChange={(event) =>
                            setCancellationReason(event.target.value)
                          }
                        />
                      </label>

                      {actionError ? (
                        <p className={styles.errorBanner} role="alert">
                          {actionError}
                        </p>
                      ) : null}

                      <div className={styles.bookingControls}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={isSubmittingAction}
                          onClick={() => void confirmCancel(booking)}
                        >
                          {isSubmittingAction
                            ? 'Cancelling...'
                            : 'Yes, cancel booking'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={closeAction}
                        >
                          Keep booking
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
