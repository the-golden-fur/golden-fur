import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { listBookings } from '../../../booking/api/booking.api';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import {
  BOOKING_STATUSES,
  type Booking,
  type BookingStatus,
} from '../../../booking/booking.types';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  listPackages,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import { listHotelStays } from '../../api/hotel.api';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import styles from './HotelBookingPicker.module.css';

type SortKey = 'soonest' | 'latest' | 'pet-name' | 'owner-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Check-in date (soonest)' },
  { value: 'latest', label: 'Sort: Check-in date (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'owner-name', label: 'Sort: Owner name (A-Z)' },
];

const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'All', label: 'All statuses' },
  ...BOOKING_STATUSES.filter((status) => status !== 'Pending').map(
    (status) => ({ value: status, label: status })
  ),
];

interface EnrichedBooking {
  booking: Booking;
  petName: string;
  weightClass: string;
  ownerName: string;
  ownerContact: string;
  serviceLabel: string;
  /** hotel_stays.id for this booking, if a stay already exists (booking-
   * status revision - a stay only ever exists once a booking has been
   * physically checked in, and hotel_stays no longer carries its own status
   * column; whether that stay is still in progress or already checked out
   * is read off the booking's own status below, not a separate stay
   * status). */
  existingStayId: string | null;
}

interface HotelBookingPickerProps {
  accessToken: string;
  branchId: string;
  onSelect: (booking: Booking) => void;
  selectedBookingId?: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Issue #79 revision: a detailed search/filter/sort picker over Hotel
 * bookings, mirroring the QueueFilterBar (date-range preset + status)
 * already shared by GroomerDashboardPage/VeterinaryConsolePage/
 * ReceptionistBookingsQueuePage - the original version of this step only
 * ever queried today's date, so a booking made for any other day (or found
 * via a slightly different "today" boundary) was simply invisible with no
 * way to widen the search. Only Pending bookings are selectable (matches
 * the server's check-in gate - a Hotel booking becomes checkinable once
 * booked and stops being checkinable the moment it's checked in, since
 * check-in itself advances bookings.status to 'In Progress'); other
 * statuses are shown (when the status filter is widened) so a receptionist
 * can see *why* a booking isn't checkinable yet, or that it already was.
 */
export function HotelBookingPicker({
  accessToken,
  branchId,
  onSelect,
  selectedBookingId,
}: HotelBookingPickerProps) {
  const navigate = useNavigate();
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>(
    'Pending'
  );

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [stayByBookingId, setStayByBookingId] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listServices(accessToken, { category: 'Hotel' }).then((result) => {
      if (!result.data) return;
      setServiceNames((prev) => {
        const next = { ...prev };
        for (const service of result.data!) next[service.id] = service.name;
        return next;
      });
    });

    void listPackages(accessToken).then((result) => {
      if (!result.data) return;
      setServiceNames((prev) => {
        const next = { ...prev };
        for (const pkg of result.data!) next[pkg.id] = pkg.name;
        return next;
      });
    });
  }, [accessToken]);

  // Cross-references every branch stay (regardless of its booking's status)
  // against booking_id, so a booking that already has a hotel_stays row -
  // whatever stage its stay has reached - can show "Go to checkout" (still
  // In Progress) or "Checked out" (Completed/Paid) instead of offering
  // check-in again.
  useEffect(() => {
    void listHotelStays(accessToken).then((result) => {
      if (!result.data) return;

      const map: Record<string, string> = {};
      for (const stay of result.data) {
        // Every Hotel stay always has a booking_id (booking_id is only ever
        // null for a Daycare walk-in) - listHotelStays only ever returns
        // Hotel-type stays.
        if (stay.booking_id) map[stay.booking_id] = stay.id;
      }
      setStayByBookingId(map);
    });
  }, [accessToken, branchId]);

  useEffect(() => {
    const token = accessToken;
    let isMounted = true;

    void listBookings(token, {
      branchId,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
      serviceCategory: 'Hotel',
      status: statusFilter === 'All' ? undefined : statusFilter,
      excludeUnpaidDownpayment: true,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load Hotel bookings.');
        return;
      }

      setError(null);
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
  }, [accessToken, branchId, dateRange.from, dateRange.to, statusFilter]);

  const enriched = useMemo<EnrichedBooking[]>(
    () =>
      bookings.map((booking) => {
        const pet = pets[booking.pet_id];
        const owner = owners[booking.customer_id];
        const itemNames = (booking.booking_items ?? [])
          .map((item) => serviceNames[item.service_id ?? item.package_id ?? ''])
          .filter((name): name is string => Boolean(name));

        return {
          booking,
          petName: pet?.name ?? 'Unknown pet',
          weightClass: pet?.weight_class ?? '—',
          ownerName: owner?.full_name ?? 'Unknown owner',
          ownerContact: owner?.contact_number ?? owner?.account_email ?? '—',
          serviceLabel:
            itemNames.length > 0 ? itemNames.join(', ') : 'Hotel stay',
          existingStayId: stayByBookingId[booking.id] ?? null,
        };
      }),
    [bookings, pets, owners, serviceNames, stayByBookingId]
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredAndSorted,
  } = useSearchAndSort<EnrichedBooking, SortKey>({
    items: enriched,
    matchesQuery: (item, query) =>
      item.petName.toLowerCase().includes(query) ||
      item.ownerName.toLowerCase().includes(query) ||
      item.weightClass.toLowerCase().includes(query),
    comparators: {
      soonest: (a, b) =>
        new Date(a.booking.scheduled_start).getTime() -
        new Date(b.booking.scheduled_start).getTime(),
      latest: (a, b) =>
        new Date(b.booking.scheduled_start).getTime() -
        new Date(a.booking.scheduled_start).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
      'owner-name': (a, b) => a.ownerName.localeCompare(b.ownerName),
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
    if (statusFilter !== 'Pending') {
      chips.push({
        id: 'status',
        label: `Status: ${
          STATUS_OPTIONS.find((option) => option.value === statusFilter)
            ?.label ?? statusFilter
        }`,
        onClear: () => setStatusFilter('Pending'),
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

  return (
    <div className={styles.wrapper}>
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
          searchPlaceholder="Search by pet, owner, or cage size..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </QueueFilterBar>

      <ActiveFilterChips chips={filterChips} />

      <p className={styles.resultCount}>
        {isLoading
          ? 'Loading bookings...'
          : `${filteredAndSorted.length} booking${filteredAndSorted.length === 1 ? '' : 's'}`}
      </p>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && filteredAndSorted.length === 0 ? (
        <p className={styles.copy}>
          No Hotel bookings match these filters. Try widening the date range or
          status above.
        </p>
      ) : null}

      {!isLoading && filteredAndSorted.length > 0 ? (
        <ul className={styles.list}>
          {filteredAndSorted.map((item) => {
            // A Pending booking has, by definition, never been checked in
            // (check-in advances bookings.status to 'In Progress'), so no
            // separate existingStayId check is needed here.
            const isCheckinable = item.booking.status === 'Pending';
            // Still checked in (has a stay, and that stay's booking hasn't
            // reached Completed/Paid yet) - offer the checkout shortcut.
            const isCheckedIn =
              item.booking.status === 'In Progress' &&
              item.existingStayId !== null;

            return (
              <li key={item.booking.id}>
                <div
                  className={`${styles.card} ${
                    selectedBookingId === item.booking.id ? styles.selected : ''
                  } ${!isCheckinable ? styles.disabledCard : ''}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.petName}>{item.petName}</span>
                    <span className={styles.weightBadge}>
                      {item.weightClass}
                    </span>
                    {isCheckedIn ? (
                      <span className={styles.checkedInBadge}>
                        Already checked in
                      </span>
                    ) : !isCheckinable ? (
                      <BookingStatusBadge status={item.booking.status} />
                    ) : null}
                    <span className={styles.menuSlot}>
                      <MoreOptionsMenu
                        label={`More options for ${item.petName}`}
                        items={[
                          {
                            label: 'View booking details',
                            onSelect: () =>
                              navigate(`/staff/bookings/${item.booking.id}`),
                          },
                        ]}
                      />
                    </span>
                  </div>
                  <span className={styles.metaLine}>
                    Owner: {item.ownerName} ({item.ownerContact})
                  </span>
                  <span className={styles.metaLine}>{item.serviceLabel}</span>
                  <span className={styles.metaLine}>
                    Check-in: {formatDateTime(item.booking.scheduled_start)}
                  </span>
                  <span className={styles.metaLine}>
                    Checkout: {formatDate(item.booking.scheduled_end)}
                  </span>
                  {item.booking.downpayment_amount != null ? (
                    <span className={styles.metaLine}>
                      Downpayment: PHP{' '}
                      {item.booking.downpayment_amount.toFixed(2)}
                    </span>
                  ) : null}
                  {item.booking.special_instructions ? (
                    <span className={styles.notes}>
                      {item.booking.special_instructions}
                    </span>
                  ) : null}
                  <div className={styles.cardControls}>
                    {isCheckinable ? (
                      <button
                        type="button"
                        className={styles.checkInButton}
                        onClick={() => onSelect(item.booking)}
                      >
                        Check in
                      </button>
                    ) : null}
                    {isCheckedIn && item.existingStayId ? (
                      <Link
                        className={styles.checkoutLink}
                        to={`/staff/hotel/checkout/${item.existingStayId}`}
                      >
                        Go to checkout &rarr;
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
