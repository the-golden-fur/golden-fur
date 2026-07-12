import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../api/staff.api';
import { listCustomers } from '../../../customers/api/customer.api';
import { PetCard } from '../../../customers/components/cards/PetCard/PetCard';
import { PetForm } from '../../../customers/components/forms/PetForm/PetForm';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { NewWalkInCustomerForm } from '../../components/forms/NewWalkInCustomerForm/NewWalkInCustomerForm';
import styles from './AdminCustomerListPage.module.css';

/**
 * Deliberately the exact same role list as the customer_profiles/pets staff
 * RLS policies added by Issues #31/#32, so the UI guard and the database's
 * actual permission boundary agree by construction (Issue #35 dev notes).
 */
const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

export function AdminCustomerListPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(
    null
  );
  const [petsByCustomer, setPetsByCustomer] = useState<Record<string, Pet[]>>(
    {}
  );
  const [message, setMessage] = useState<string | null>(null);

  // Same trick as AdminStaffListPage: the viewer's app-level role isn't on
  // the Supabase session, so it's read off their own row in the staff list
  // (GET /staff always includes the requester's own row).
  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listCustomers(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load customers.');
        return;
      }

      setCustomers(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const handleCustomerSaved = (customer: CustomerProfile) => {
    setCustomers((prev) => {
      const exists = prev.some((existing) => existing.id === customer.id);
      return exists
        ? prev.map((existing) =>
            existing.id === customer.id ? customer : existing
          )
        : [...prev, customer];
    });
    setExpandedCustomerId(customer.id);
    setMessage('Customer saved. Add a pet below if needed.');
  };

  const handlePetCreated = (customerId: string, pet: Pet) => {
    setPetsByCustomer((prev) => ({
      ...prev,
      [customerId]: [...(prev[customerId] ?? []), pet],
    }));
    setMessage('Pet added.');
  };

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  // Decided only once role resolution finishes, so an allowed viewer never
  // flashes through this redirect (mirrors AdminStaffListPage).
  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Customer Directory</h1>

      {message ? <p className={styles.successBanner}>{message}</p> : null}

      <section className={styles.panel} aria-labelledby="new-walkin-title">
        <h2 className={styles.sectionTitle} id="new-walkin-title">
          New walk-in customer
        </h2>
        {accessToken ? (
          <NewWalkInCustomerForm
            accessToken={accessToken}
            onSaved={handleCustomerSaved}
          />
        ) : null}
      </section>

      {isLoading ? (
        <p className={styles.copy}>Loading customers...</p>
      ) : loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : customers.length === 0 ? (
        <p className={styles.copy}>No customers on file yet.</p>
      ) : (
        <ul className={styles.list}>
          {customers.map((customer) => (
            <li className={styles.listItem} key={customer.id}>
              <div className={styles.customerRow}>
                <span className={styles.customerName}>
                  {customer.full_name}
                </span>
                <span className={styles.customerEmail}>
                  {customer.account_email}
                </span>
                <button
                  type="button"
                  className={styles.manageButton}
                  onClick={() =>
                    setExpandedCustomerId((current) =>
                      current === customer.id ? null : customer.id
                    )
                  }
                >
                  {expandedCustomerId === customer.id ? 'Close' : 'Add pet'}
                </button>
              </div>

              {(petsByCustomer[customer.id] ?? []).length > 0 ? (
                <div className={styles.petsGrid}>
                  {(petsByCustomer[customer.id] ?? []).map((pet) => (
                    <PetCard key={pet.id} pet={pet} />
                  ))}
                </div>
              ) : null}

              {expandedCustomerId === customer.id && accessToken ? (
                <PetForm
                  customerId={customer.id}
                  accessToken={accessToken}
                  onCreated={(pet) => handlePetCreated(customer.id, pet)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
