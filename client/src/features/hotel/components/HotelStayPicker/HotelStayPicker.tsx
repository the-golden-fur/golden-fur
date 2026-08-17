import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  listHotelStays,
  type HotelStayFilterStatus,
} from '../../api/hotel.api';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type { HotelStayWithCage } from '../../hotel.types';
import styles from './HotelStayPicker.module.css';

type SortKey =
  | 'checkout-soonest'
  | 'checkin-soonest'
  | 'pet-name'
  | 'owner-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'checkout-soonest', label: 'Sort: Checkout due (soonest)' },
  { value: 'checkin-soonest', label: 'Sort: Checked in (earliest)' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
  { value: 'owner-name', label: 'Sort: Owner name (A-Z)' },
];

/** A hotel_stays row only exists once its booking has been checked in, so
 * "Pending"/"Cancelled"/"No-show" (which never reach that point) aren't
 * meaningful filter values here - mirrors the server's
 * listHotelStaysQueryValidator. */
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'In Progress', label: 'In Progress' },
  { value: 'All', label: 'All statuses' },
  { value: 'Completed', label: 'Completed' },
];

interface EnrichedStay {
  stay: HotelStayWithCage;
  petName: string;
  ownerName: string;
  ownerContact: string;
}

interface HotelStayPickerProps {
  accessToken: string;
  onSelect: (stay: HotelStayWithCage) => void;
  selectedStayId?: string | null;
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

function isOverdue(scheduledCheckOutDate: string): boolean {
  return new Date(`${scheduledCheckOutDate}T23:59:59`) < new Date();
}

/**
 * Checkout's own search/filter/sort picker (#79 revision) - replaces a raw
 * "paste the stay id" text field with the same detailed-card pattern
 * HotelBookingPicker already established, sourced from the same
 * GET /hotel/stays endpoint. Defaults to In Progress stays - a
 * Completed/Paid one has nothing left to check out - but (Custom change:
 * hotel queue checkout list parity) now offers the same QueueFilterBar
 * (date range + status) HotelBookingPicker's check-in list has, so staff can
 * widen the list to review already-checked-out stays too. The date filter
 * defaults to "All dates" rather than "Today" (unlike check-in) so an
 * overdue stay - scheduled to check out days ago - stays visible by
 * default; check-in's own "Today" default doesn't carry over here.
 */
export function HotelStayPicker({
  accessToken,
  onSelect,
  selectedStayId,
}: HotelStayPickerProps) {
  const navigate = useNavigate();
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('all');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<
    HotelStayFilterStatus | 'All'
  >('In Progress');

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [stays, setStays] = useState<HotelStayWithCage[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = accessToken;
    let isMounted = true;

    void listHotelStays(token, {
      status: statusFilter === 'All' ? undefined : statusFilter,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load active Hotel stays.');
        return;
      }

      setError(null);
      setStays(result.data);

      const petIds = new Set(result.data.map((stay) => stay.pet_id));

      void Promise.all(Array.from(petIds).map((id) => getPet(id, token))).then(
        (petResults) => {
          if (!isMounted) return;

          const petMap: Record<string, Pet> = {};
          for (const petResult of petResults) {
            if (petResult.data) petMap[petResult.data.id] = petResult.data;
          }
          setPets(petMap);

          const customerIds = new Set(
            Object.values(petMap).map((pet) => pet.customer_id)
          );

          void Promise.all(
            Array.from(customerIds).map((id) => getCustomerProfile(id, token))
          ).then((ownerResults) => {
            if (!isMounted) return;
            setOwners((prev) => {
              const next = { ...prev };
              for (const ownerResult of ownerResults) {
                if (ownerResult.data) {
                  next[ownerResult.data.id] = ownerResult.data;
                }
              }
              return next;
            });
          });
        }
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, dateRange.from, dateRange.to, statusFilter]);

  const enriched = useMemo<EnrichedStay[]>(
    () =>
      stays.map((stay) => {
        const pet = pets[stay.pet_id];
        const owner = pet ? owners[pet.customer_id] : undefined;

        return {
          stay,
          petName: pet?.name ?? 'Unknown pet',
          ownerName: owner?.full_name ?? 'Unknown owner',
          ownerContact: owner?.contact_number ?? owner?.account_email ?? '—',
        };
      }),
    [stays, pets, owners]
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredAndSorted,
  } = useSearchAndSort<EnrichedStay, SortKey>({
    items: enriched,
    matchesQuery: (item, query) =>
      item.petName.toLowerCase().includes(query) ||
      item.ownerName.toLowerCase().includes(query) ||
      item.stay.cage_label.toLowerCase().includes(query),
    comparators: {
      // scheduled_check_out_date/downpayment_amount are only ever null for a
      // Daycare stay - this picker only ever lists Hotel stays.
      'checkout-soonest': (a, b) =>
        new Date(a.stay.scheduled_check_out_date!).getTime() -
        new Date(b.stay.scheduled_check_out_date!).getTime(),
      'checkin-soonest': (a, b) =>
        new Date(a.stay.check_in_at ?? 0).getTime() -
        new Date(b.stay.check_in_at ?? 0).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
      'owner-name': (a, b) => a.ownerName.localeCompare(b.ownerName),
    },
    initialSortKey: 'checkout-soonest',
  });

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (dateRangePreset !== 'all') {
      chips.push({
        id: 'date',
        label: `Date: ${dateRangePresetLabel(dateRangePreset)}`,
        onClear: () => setDateRangePreset('all'),
      });
    }
    if (statusFilter !== 'In Progress') {
      chips.push({
        id: 'status',
        label: `Status: ${
          STATUS_OPTIONS.find((option) => option.value === statusFilter)
            ?.label ?? statusFilter
        }`,
        onClear: () => setStatusFilter('In Progress'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'checkout-soonest') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('checkout-soonest'),
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
          setStatusFilter(value as HotelStayFilterStatus | 'All')
        }
        statusOptions={STATUS_OPTIONS}
      >
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by pet, owner, or cage..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </QueueFilterBar>

      <ActiveFilterChips chips={filterChips} />

      <p className={styles.resultCount}>
        {isLoading
          ? 'Loading stays...'
          : `${filteredAndSorted.length} stay${filteredAndSorted.length === 1 ? '' : 's'}`}
      </p>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && filteredAndSorted.length === 0 ? (
        <p className={styles.copy}>
          {stays.length === 0 &&
          dateRangePreset === 'all' &&
          statusFilter === 'In Progress'
            ? 'No pets are currently checked in. A pet must be checked in before it can be checked out.'
            : 'No stays match these filters. Try widening the date range or status above.'}
        </p>
      ) : null}

      {!isLoading && filteredAndSorted.length > 0 ? (
        <ul className={styles.list}>
          {filteredAndSorted.map((item) => {
            const isCheckoutable = item.stay.status === 'Active';

            return (
              <li key={item.stay.id}>
                <div
                  className={`${styles.card} ${
                    selectedStayId === item.stay.id ? styles.selected : ''
                  } ${!isCheckoutable ? styles.disabledCard : ''}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.petName}>{item.petName}</span>
                    <span className={styles.cageBadge}>
                      {item.stay.cage_label}
                    </span>
                    {!isCheckoutable ? (
                      <span className={styles.checkedOutBadge}>
                        Already checked out
                      </span>
                    ) : isOverdue(item.stay.scheduled_check_out_date!) ? (
                      <span className={styles.overdueBadge}>Overdue</span>
                    ) : null}
                    {item.stay.booking_id ? (
                      <span className={styles.menuSlot}>
                        <MoreOptionsMenu
                          label={`More options for ${item.petName}`}
                          items={[
                            {
                              label: 'View booking details',
                              onSelect: () =>
                                navigate(
                                  `/staff/bookings/${item.stay.booking_id}`
                                ),
                            },
                          ]}
                        />
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.metaLine}>
                    Owner: {item.ownerName} ({item.ownerContact})
                  </span>
                  {item.stay.check_in_at ? (
                    <span className={styles.metaLine}>
                      Checked in: {formatDateTime(item.stay.check_in_at)}
                    </span>
                  ) : null}
                  <span className={styles.metaLine}>
                    Checkout due:{' '}
                    {formatDate(item.stay.scheduled_check_out_date!)}
                  </span>
                  <span className={styles.metaLine}>
                    Downpayment: PHP {item.stay.downpayment_amount!.toFixed(2)}
                  </span>
                  {isCheckoutable ? (
                    <div className={styles.cardControls}>
                      <button
                        type="button"
                        className={styles.checkOutButton}
                        onClick={() => onSelect(item.stay)}
                      >
                        Check out
                      </button>
                    </div>
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
