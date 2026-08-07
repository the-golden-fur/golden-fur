import { useEffect, useMemo, useState } from 'react';
import { listHotelStays } from '../../api/hotel.api';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
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
 * GET /hotel/stays endpoint. Only ever lists In Progress stays (booking-
 * status revision) - a Completed/Paid one has nothing left to check out.
 */
export function HotelStayPicker({
  accessToken,
  onSelect,
  selectedStayId,
}: HotelStayPickerProps) {
  const [stays, setStays] = useState<HotelStayWithCage[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = accessToken;
    let isMounted = true;

    void listHotelStays(token, 'In Progress').then((result) => {
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
  }, [accessToken]);

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

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <SearchSortBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by pet, owner, or cage..."
          sortValue={sortKey}
          onSortChange={setSortKey}
          sortOptions={SORT_OPTIONS}
        />
      </div>

      <p className={styles.resultCount}>
        {isLoading
          ? 'Loading active stays...'
          : `${filteredAndSorted.length} active stay${filteredAndSorted.length === 1 ? '' : 's'}`}
      </p>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && filteredAndSorted.length === 0 ? (
        <p className={styles.copy}>
          {stays.length === 0
            ? 'No pets are currently checked in. A pet must be checked in before it can be checked out.'
            : 'No active stays match your search - try clearing it.'}
        </p>
      ) : null}

      {!isLoading && filteredAndSorted.length > 0 ? (
        <ul className={styles.list}>
          {filteredAndSorted.map((item) => (
            <li key={item.stay.id}>
              <button
                type="button"
                className={`${styles.card} ${
                  selectedStayId === item.stay.id ? styles.selected : ''
                }`}
                onClick={() => onSelect(item.stay)}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.petName}>{item.petName}</span>
                  <span className={styles.cageBadge}>
                    {item.stay.cage_label}
                  </span>
                  {isOverdue(item.stay.scheduled_check_out_date!) ? (
                    <span className={styles.overdueBadge}>Overdue</span>
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
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
