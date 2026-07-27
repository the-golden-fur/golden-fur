import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCustomers } from '../../../customers/api/customer.api';
import type {
  CommunicationChannel,
  CustomerProfile,
} from '../../../customers/customer.types';
import styles from './CustomerPicker.module.css';

type SortKey = 'name-asc' | 'name-desc' | 'newest' | 'oldest';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'name-asc', label: 'Sort: Name (A-Z)' },
  { value: 'name-desc', label: 'Sort: Name (Z-A)' },
  { value: 'newest', label: 'Sort: Newest first' },
  { value: 'oldest', label: 'Sort: Oldest first' },
];

const CHANNEL_FILTERS: Array<CommunicationChannel | 'All'> = [
  'All',
  'Call',
  'Text',
  'Viber',
  'Messenger',
];

interface CustomerPickerProps {
  accessToken: string;
  onSelect: (customer: CustomerProfile) => void;
  selectedCustomerId?: string | null;
}

/**
 * Booking flow's Customer step - a search/sort/filter picker over EXISTING
 * customers only. Deliberately does not reuse NewWalkInCustomerForm's
 * create-or-update flow here: CustomerManagementPage (/staff/admin/customers)
 * already owns walk-in customer creation, and silently updating a matched
 * customer's profile mid-booking (that form's M02 Process 2 behavior) is the
 * wrong side effect when the receptionist is just picking someone who
 * already exists. Customers not yet on file are created via that separate
 * page (linked below), then searchable here immediately after a refresh.
 */
export function CustomerPicker({
  accessToken,
  onSelect,
  selectedCustomerId,
}: CustomerPickerProps) {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [channelFilter, setChannelFilter] = useState<
    CommunicationChannel | 'All'
  >('All');

  const load = useCallback(() => {
    void listCustomers(accessToken).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load customers.');
        return;
      }

      setError(null);
      setCustomers(result.data);
    });
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matches = customers.filter((customer) => {
      if (
        channelFilter !== 'All' &&
        customer.preferred_communication_channel !== channelFilter
      ) {
        return false;
      }

      if (!query) return true;

      return (
        customer.full_name.toLowerCase().includes(query) ||
        customer.account_email.toLowerCase().includes(query) ||
        (customer.contact_number ?? '').toLowerCase().includes(query)
      );
    });

    return [...matches].sort((a, b) => {
      switch (sortKey) {
        case 'name-asc':
          return a.full_name.localeCompare(b.full_name);
        case 'name-desc':
          return b.full_name.localeCompare(a.full_name);
        case 'newest':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case 'oldest':
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        default:
          return 0;
      }
    });
  }, [customers, search, sortKey, channelFilter]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.select}
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={channelFilter}
          onChange={(event) =>
            setChannelFilter(event.target.value as CommunicationChannel | 'All')
          }
        >
          {CHANNEL_FILTERS.map((channel) => (
            <option key={channel} value={channel}>
              {channel === 'All' ? 'All communication channels' : channel}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={load}
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>

      <div className={styles.metaRow}>
        <p className={styles.resultCount}>
          {isLoading
            ? 'Loading customers...'
            : `${filteredCustomers.length} customer${filteredCustomers.length === 1 ? '' : 's'}`}
        </p>
        <a
          className={styles.createLink}
          href="/staff/admin/customers"
          target="_blank"
          rel="noreferrer"
        >
          Not on file? Create a new customer
        </a>
      </div>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && filteredCustomers.length === 0 ? (
        <p className={styles.copy}>No customers match your search.</p>
      ) : (
        <div className={styles.grid}>
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={`${styles.card} ${
                selectedCustomerId === customer.id ? styles.selected : ''
              }`}
              onClick={() => onSelect(customer)}
            >
              <span className={styles.avatarFallback} aria-hidden="true">
                {customer.full_name.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.identity}>
                <span className={styles.name}>{customer.full_name}</span>
                <span className={styles.email}>{customer.account_email}</span>
                {customer.contact_number ? (
                  <span className={styles.phone}>
                    {customer.contact_number}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
