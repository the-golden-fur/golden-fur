import { useEffect, useMemo, useState } from 'react';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { listBookings } from '../../../booking/api/booking.api';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import {
  BOOKING_STATUSES,
  type Booking,
  type BookingStatus,
} from '../../../booking/booking.types';
import { getPet } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import {
  listPackages,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import styles from './DaycareBookingPicker.module.css';

type SortKey = 'soonest' | 'latest' | 'pet-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'soonest', label: 'Sort: Time (soonest)' },
  { value: 'latest', label: 'Sort: Time (latest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'Pending', label: 'Pending (checkinable)' },
  { value: 'All', label: 'All statuses' },
  ...BOOKING_STATUSES.filter((status) => status !== 'Pending').map(
    (status) => ({ value: status, label: status })
  ),
];

interface EnrichedBooking {
  booking: Booking;
  petName: string;
  serviceLabel: string;
}

interface DaycareBookingPickerProps {
  accessToken: string;
  branchId: string;
  onSelect: (booking: Booking) => void;
  selectedBookingId?: string | null;
}

/**
 * Daycare Check-in's existing-booking picker, mirroring HotelBookingPicker's
 * search/filter/sort card layout so both check-in flows behave the same
 * way. Defaults to today's Pending bookings, same as the original hand-
 * rolled list it replaces, but widens via the same date-range preset +
 * status controls Hotel/Grooming/Veterinary already offer. Only Pending
 * bookings are selectable (matches the server's check-in gate).
 */
export function DaycareBookingPicker({
  accessToken,
  branchId,
  onSelect,
  selectedBookingId,
}: DaycareBookingPickerProps) {
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
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listServices(accessToken, { category: 'Daycare' }).then((result) => {
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

  useEffect(() => {
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
        setError(result.error ?? 'Could not load Daycare bookings.');
        return;
      }

      setError(null);
      setBookings(result.data);

      const petIds = new Set(result.data.map((booking) => booking.pet_id));

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
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId, dateRange.from, dateRange.to, statusFilter]);

  const enriched = useMemo<EnrichedBooking[]>(
    () =>
      bookings.map((booking) => {
        const pet = pets[booking.pet_id];
        const serviceId = booking.service_id ?? booking.package_id ?? null;

        return {
          booking,
          petName: pet?.name ?? 'Unknown pet',
          serviceLabel: serviceId
            ? (serviceNames[serviceId] ?? 'Daycare')
            : 'Daycare',
        };
      }),
    [bookings, pets, serviceNames]
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
      item.petName.toLowerCase().includes(query),
    comparators: {
      soonest: (a, b) =>
        new Date(a.booking.scheduled_start).getTime() -
        new Date(b.booking.scheduled_start).getTime(),
      latest: (a, b) =>
        new Date(b.booking.scheduled_start).getTime() -
        new Date(a.booking.scheduled_start).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'soonest',
  });

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
          searchPlaceholder="Search by pet name..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
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
          No Daycare bookings match these filters. Try widening the date
          range or status above.
        </p>
      ) : null}

      {!isLoading && filteredAndSorted.length > 0 ? (
        <ul className={styles.list}>
          {filteredAndSorted.map((item) => {
            const isCheckinable = item.booking.status === 'Pending';

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
                    <span className={styles.typeBadge}>Daycare</span>
                    {!isCheckinable ? (
                      <BookingStatusBadge status={item.booking.status} />
                    ) : null}
                  </div>
                  <span className={styles.metaLine}>{item.serviceLabel}</span>
                  <span className={styles.metaLine}>
                    {new Date(item.booking.scheduled_start).toLocaleString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
