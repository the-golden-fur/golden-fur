import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { getTransactionHistory } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import styles from './TransactionHistoryTable.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);

const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Misc',
];

/**
 * Issue #105: filterable transaction history - customer, pet, date range,
 * and service type (AC-2), all composable client-side form state driving
 * server-side query params against transactionHistory.service.ts (#102).
 */
export function TransactionHistoryTable() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPetId, setSelectedPetId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceCategory, setServiceCategory] = useState('');

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    void listCustomers(accessToken).then((result) => {
      if (isMounted && result.data) setCustomers(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !selectedCustomerId) return;

    let isMounted = true;

    void listCustomerPets(selectedCustomerId, accessToken).then((result) => {
      if (isMounted && result.data) setPets(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, selectedCustomerId]);

  // Clearing pets/selectedPetId lives in this handler (a synchronous UI
  // event), not in the effect above, alongside the customer change itself -
  // resetting derived state from an effect body triggers cascading renders.
  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedPetId('');
    setPets([]);
  }

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void getTransactionHistory(
      {
        customerId: selectedCustomerId || undefined,
        petId: selectedPetId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        serviceCategory: serviceCategory || undefined,
      },
      accessToken
    ).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setTransactions(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    selectedCustomerId,
    selectedPetId,
    dateFrom,
    dateTo,
    serviceCategory,
  ]);

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Transaction History</h1>

      <div className={styles.filters}>
        <label className={styles.field}>
          Customer
          <select
            className={styles.control}
            value={selectedCustomerId}
            onChange={(event) => handleCustomerChange(event.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Pet
          <select
            className={styles.control}
            value={selectedPetId}
            onChange={(event) => setSelectedPetId(event.target.value)}
            disabled={!selectedCustomerId}
          >
            <option value="">All pets</option>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          From
          <input
            className={styles.control}
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          To
          <input
            className={styles.control}
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          Service type
          <select
            className={styles.control}
            value={serviceCategory}
            onChange={(event) => setServiceCategory(event.target.value)}
          >
            <option value="">All services</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading transactions...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : transactions.length === 0 ? (
        <p className={styles.copy}>No transactions match these filters.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Service</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.created_at).toLocaleDateString()}</td>
                <td>
                  {transaction.transaction_type === 'miscellaneous_sale'
                    ? transaction.misc_sale_description
                    : 'Booking payment'}
                </td>
                <td>{transaction.bookings?.service_category ?? '-'}</td>
                <td>{transaction.payment_method}</td>
                <td>{transaction.payment_status}</td>
                <td>₱{transaction.total_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
