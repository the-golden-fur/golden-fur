import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { listBookings } from '../../../booking/api/booking.api';
import type { Booking, BookingStatus } from '../../../booking/booking.types';
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
import type { HotelStayStatus } from '../../hotel.types';
import styles from './HotelBookingPicker.module.css';

type SortKey = 'soonest' | 'latest' | 'pet-name' | 'owner-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Check-in date (soonest)' },
  { value: 'latest', label: 'Sort: Check-in date (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'owner-name', label: 'Sort: Owner name (A-Z)' },
];

const BOOKING_STATUSES: BookingStatus[] = [
  'Confirmed',
  'Pending',
  'Completed',
  'Cancelled',
  'No-show',
];
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'Confirmed', label: 'Confirmed (checkinable)' },
  { value: 'All', label: 'All statuses' },
  ...BOOKING_STATUSES.filter((status) => status !== 'Confirmed').map(
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
  existingStay: { stayId: string; status: HotelStayStatus } | null;
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
 * way to widen the search. Only Confirmed bookings are selectable; other
 * statuses are shown (when the status filter is widened) so a receptionist
 * can see *why* a booking isn't checkinable yet (e.g. still Pending
 * payment) instead of it just not existing on screen.
 */
export function HotelBookingPicker({
  accessToken,
  branchId,
  onSelect,
  selectedBookingId,
}: HotelBookingPickerProps) {
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>(
    'Confirmed'
  );
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('soonest');

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [stayByBookingId, setStayByBookingId] = useState<
    Record<string, { stayId: string; status: HotelStayStatus }>
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

  // #79 revision: cross-references every branch stay (any status) against
  // booking_id, so a booking that already has a check-in never shows as
  // checkinable again just because bookings.status stays 'Confirmed'
  // forever (check-in only ever writes hotel_stays, never touches the
  // booking's own status) - a real gap surfaced by manual testing.
  useEffect(() => {
    void listHotelStays(accessToken).then((result) => {
      if (!result.data) return;

      const map: Record<string, { stayId: string; status: HotelStayStatus }> =
        {};
      for (const stay of result.data) {
        map[stay.booking_id] = { stayId: stay.id, status: stay.status };
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
        const serviceId = booking.service_id ?? booking.package_id ?? null;

        return {
          booking,
          petName: pet?.name ?? 'Unknown pet',
          weightClass: pet?.weight_class ?? '—',
          ownerName: owner?.full_name ?? 'Unknown owner',
          ownerContact: owner?.contact_number ?? owner?.account_email ?? '—',
          serviceLabel: serviceId
            ? (serviceNames[serviceId] ?? 'Hotel stay')
            : 'Hotel stay',
          existingStay: stayByBookingId[booking.id] ?? null,
        };
      }),
    [bookings, pets, owners, serviceNames, stayByBookingId]
  );

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matches = enriched.filter((item) => {
      if (!query) return true;
      return (
        item.petName.toLowerCase().includes(query) ||
        item.ownerName.toLowerCase().includes(query) ||
        item.weightClass.toLowerCase().includes(query)
      );
    });

    return [...matches].sort((a, b) => {
      switch (sortKey) {
        case 'soonest':
          return (
            new Date(a.booking.scheduled_start).getTime() -
            new Date(b.booking.scheduled_start).getTime()
          );
        case 'latest':
          return (
            new Date(b.booking.scheduled_start).getTime() -
            new Date(a.booking.scheduled_start).getTime()
          );
        case 'pet-name':
          return a.petName.localeCompare(b.petName);
        case 'owner-name':
          return a.ownerName.localeCompare(b.ownerName);
        default:
          return 0;
      }
    });
  }, [enriched, search, sortKey]);

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
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by pet, owner, or cage size..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </QueueFilterBar>

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
            const isCheckinable =
              item.booking.status === 'Confirmed' && !item.existingStay;

            return (
              <li key={item.booking.id}>
                <div
                  className={`${styles.card} ${
                    selectedBookingId === item.booking.id ? styles.selected : ''
                  } ${!isCheckinable ? styles.disabledCard : ''}`}
                  role={isCheckinable ? 'button' : undefined}
                  tabIndex={isCheckinable ? 0 : undefined}
                  onClick={
                    isCheckinable ? () => onSelect(item.booking) : undefined
                  }
                  onKeyDown={
                    isCheckinable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            onSelect(item.booking);
                          }
                        }
                      : undefined
                  }
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.petName}>{item.petName}</span>
                    <span className={styles.weightBadge}>
                      {item.weightClass}
                    </span>
                    {!item.existingStay &&
                    item.booking.status !== 'Confirmed' ? (
                      <span className={styles.statusBadge}>
                        {item.booking.status}
                      </span>
                    ) : null}
                    {item.existingStay?.status === 'Active' ? (
                      <span className={styles.checkedInBadge}>
                        Already checked in
                      </span>
                    ) : null}
                    {item.existingStay?.status === 'Completed' ? (
                      <span className={styles.statusBadge}>Checked out</span>
                    ) : null}
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
                  {item.existingStay?.status === 'Active' ? (
                    <Link
                      className={styles.checkoutLink}
                      to={`/staff/hotel/checkout/${item.existingStay.stayId}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      Go to checkout &rarr;
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
