import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
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
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import { PaymentStatusBadge } from '../../../booking/components/shared/PaymentStatusBadge/PaymentStatusBadge';
import { listBookings } from '../../../booking/api/booking.api';
import type { Booking, BookingStatus } from '../../../booking/booking.types';
import { DAYCARE_QUEUE_VIEWER_ROLES } from './daycareQueueRoles';
import styles from './DaycareQueuePage.module.css';

type StatusFilter = BookingStatus | 'All';
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'Checked in' },
  { value: 'Completed', label: 'Checked out' },
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Daycare Queue redesign: replaces the former Check In/Check Out tab panels
 * (DaycareCheckInPanel/DaycareCheckoutPanel picking their own booking/
 * session) with a single status-driven list, mirroring AssessmentQueuePage's
 * "one category, one list" shape rather than HotelQueuePage's tabbed one -
 * there is deliberately no per-row action button here (custom change: "remove
 * checkin/checkout buttons on each list item"). What clicking a row does
 * depends entirely on its status:
 *   - Pending: opens DaycareCheckInFormPage to finalize the cage + care
 *     instructions before checking in (the same page a Hotel queue row's
 *     "..." menu opens, just reached directly here since there's no other
 *     action competing for the click).
 *   - In Progress (checked in): opens the shared Boarding Checklist
 *     (/staff/hotel/care-log?petId=...), scoped to just this pet's tasks -
 *     that page also gained the actual "Check out" action (custom change),
 *     since removing this row's own Check Out button meant checkout needed
 *     a new home.
 *   - Completed/Cancelled/No-show: nothing to do from here - a plain "View
 *     details" link (the generic BookingDetailsPage) is offered instead.
 */
export function DaycareQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [branchId, setBranchId] = useState<string | null>(null);

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

  const showCheckedInBanner = searchParams.get('checkedIn') === 'success';

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          DAYCARE_QUEUE_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setBranchId(result.data.branch_id);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken || !branchId) return;

    const token = accessToken;
    let isMounted = true;

    void listBookings(token, {
      branchId,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
      serviceCategory: 'Daycare',
      status: statusFilter === 'All' ? undefined : statusFilter,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the Daycare queue.');
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
    roleStatus,
    accessToken,
    branchId,
    dateRange.from,
    dateRange.to,
    statusFilter,
  ]);

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
  }, [dateRangePreset, statusFilter, search, sortKey, setSearch, setSortKey]);

  function handleRowClick(booking: Booking) {
    if (booking.status === 'Pending') {
      navigate(`/staff/daycare/queue/check-in/${booking.id}`);
    } else if (booking.status === 'In Progress') {
      navigate(
        `/staff/hotel/care-log?petId=${encodeURIComponent(booking.pet_id)}`
      );
    }
    // Completed/Cancelled/No-show: nothing to do from here.
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Daycare queue.
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
        <h1 className={styles.title}>Daycare Queue</h1>

        {showCheckedInBanner ? (
          <p className={styles.successBanner} role="status">
            Pet checked in successfully.
          </p>
        ) : null}

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
            No Daycare bookings match these filters.
          </p>
        ) : null}

        {!isLoading && !loadError && filteredAndSorted.length > 0 ? (
          <ul className={styles.bookingList}>
            {filteredAndSorted.map((booking) => {
              const isClickable =
                booking.status === 'Pending' ||
                booking.status === 'In Progress';

              const summary = (
                <>
                  <div className={styles.bookingHeader}>
                    <span className={styles.bookingTitle}>
                      {pets[booking.pet_id]?.name ?? 'Unknown pet'}
                    </span>
                    <div className={styles.bookingBadges}>
                      <BookingStatusBadge status={booking.status} />
                      <PaymentStatusBadge status={booking.payment_status} />
                    </div>
                  </div>
                  <span className={styles.bookingMeta}>
                    {formatDateTime(booking.scheduled_start)}
                  </span>
                  <span className={styles.bookingMeta}>
                    Owner {owners[booking.customer_id]?.full_name ?? 'Unknown'}
                  </span>
                  {booking.status === 'Pending' ? (
                    <span className={styles.actionHint}>
                      Click to finalize the cage and care instructions
                    </span>
                  ) : null}
                  {booking.status === 'In Progress' ? (
                    <span className={styles.actionHint}>
                      Click to view this pet&apos;s boarding checklist
                    </span>
                  ) : null}
                </>
              );

              return (
                <li key={booking.id} className={styles.bookingRow}>
                  {isClickable ? (
                    <button
                      type="button"
                      className={styles.rowSummaryButton}
                      onClick={() => handleRowClick(booking)}
                    >
                      {summary}
                    </button>
                  ) : (
                    <div className={styles.rowSummary}>
                      {summary}
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          navigate(`/staff/bookings/${booking.id}`)
                        }
                      >
                        View details
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
