import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  activateCustomer,
  archiveCustomer,
  deactivateCustomer,
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import { PetCard } from '../../../customers/components/cards/PetCard/PetCard';
import { PetForm } from '../../../customers/components/forms/PetForm/PetForm';
import type { CustomerRowAction } from '../../../customers/components/menus/CustomerRowActionMenu/CustomerRowActionMenu';
import { CustomerRowActionMenu } from '../../../customers/components/menus/CustomerRowActionMenu/CustomerRowActionMenu';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { listStaff } from '../../api/staff.api';
import { NewWalkInCustomerForm } from '../../components/forms/NewWalkInCustomerForm/NewWalkInCustomerForm';
import styles from './CustomerManagementPage.module.css';

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

/**
 * Issue #76: renamed from AdminCustomerListPage/"Customer Directory" ->
 * CustomerManagementPage/"Customer Management" (label-only - no route or
 * permission change). Row expand no longer always opens the create-pet
 * form directly - it now opens a "…" action menu (CustomerRowActionMenu)
 * offering Check Profile / View Pets / Add Pet, with Add Pet now one option
 * among several rather than the only outcome of expanding a row.
 */
export function CustomerManagementPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<{
    customerId: string;
    action: CustomerRowAction;
  } | null>(null);
  const [petsByCustomer, setPetsByCustomer] = useState<Record<string, Pet[]>>(
    {}
  );
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [petsLoadError, setPetsLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Same trick as StaffManagementPage: the viewer's app-level role isn't on
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
    setActivePanel({ customerId: customer.id, action: 'addPet' });
    setMessage('Customer saved. Add a pet below if needed.');
  };

  const handlePetCreated = (customerId: string, pet: Pet) => {
    setPetsByCustomer((prev) => ({
      ...prev,
      [customerId]: [...(prev[customerId] ?? []), pet],
    }));
    setMessage('Pet added.');
  };

  async function handleToggleCustomerActive(customer: CustomerProfile) {
    if (!accessToken) return;

    setMessage(null);
    const result = customer.is_active
      ? await deactivateCustomer(customer.id, accessToken)
      : await activateCustomer(customer.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setCustomers((prev) =>
      prev.map((existing) =>
        existing.id === customer.id
          ? { ...existing, is_active: !customer.is_active }
          : existing
      )
    );
    setMessage(
      customer.is_active ? 'Customer deactivated.' : 'Customer reactivated.'
    );
  }

  async function handleArchiveCustomer(customerId: string) {
    if (!accessToken) return;

    setMessage(null);
    const result = await archiveCustomer(customerId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setCustomers((prev) =>
      prev.filter((existing) => existing.id !== customerId)
    );
    setMessage('Customer archived.');
  }

  function handleSelectAction(customerId: string, action: CustomerRowAction) {
    if (action === 'deactivate') {
      const customer = customers.find((existing) => existing.id === customerId);
      if (customer) void handleToggleCustomerActive(customer);
      return;
    }

    if (action === 'archive') {
      void handleArchiveCustomer(customerId);
      return;
    }

    const isSameSelection =
      activePanel?.customerId === customerId && activePanel.action === action;

    setMessage(null);

    if (isSameSelection) {
      setActivePanel(null);
      return;
    }

    setActivePanel({ customerId, action });

    if (action === 'viewPets' && accessToken && !petsByCustomer[customerId]) {
      setIsPetsLoading(true);
      setPetsLoadError(null);

      void listCustomerPets(customerId, accessToken).then((result) => {
        setIsPetsLoading(false);

        if (result.error || !result.data) {
          setPetsLoadError(result.error ?? 'Could not load pets.');
          return;
        }

        setPetsByCustomer((prev) => ({ ...prev, [customerId]: result.data! }));
      });
    }
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

  // Decided only once role resolution finishes, so an allowed viewer never
  // flashes through this redirect (mirrors StaffManagementPage).
  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Customer Management</h1>
          {viewerRole === 'Admin' || viewerRole === 'Superadmin' ? (
            <Link
              className={styles.archiveLink}
              to="/staff/admin/archive?tab=customers"
            >
              View archive
            </Link>
          ) : null}
        </div>

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
                  <CustomerRowActionMenu
                    onSelect={(action) =>
                      handleSelectAction(customer.id, action)
                    }
                    canArchive={
                      viewerRole === 'Admin' || viewerRole === 'Superadmin'
                    }
                    isActive={customer.is_active}
                  />
                </div>

                {activePanel?.customerId === customer.id &&
                activePanel.action === 'checkProfile' ? (
                  <dl className={styles.profileDetails}>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Contact number</dt>
                      <dd className={styles.detailValue}>
                        {customer.contact_number ?? '—'}
                      </dd>
                    </div>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Emergency contact</dt>
                      <dd className={styles.detailValue}>
                        {customer.emergency_contact_name ?? '—'}
                        {customer.emergency_contact_number
                          ? ` (${customer.emergency_contact_number})`
                          : ''}
                      </dd>
                    </div>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>
                        Preferred communication
                      </dt>
                      <dd className={styles.detailValue}>
                        {customer.preferred_communication_channel ?? '—'}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                {activePanel?.customerId === customer.id &&
                activePanel.action === 'viewPets' ? (
                  isPetsLoading ? (
                    <p className={styles.copy}>Loading pets...</p>
                  ) : petsLoadError ? (
                    <p className={styles.errorBanner} role="alert">
                      {petsLoadError}
                    </p>
                  ) : (petsByCustomer[customer.id] ?? []).length === 0 ? (
                    <p className={styles.copy}>No pets on file yet.</p>
                  ) : (
                    <div className={styles.petsGrid}>
                      {(petsByCustomer[customer.id] ?? []).map((pet) => (
                        <PetCard
                          key={pet.id}
                          pet={pet}
                          linkBasePath="/staff/pets"
                        />
                      ))}
                    </div>
                  )
                ) : null}

                {activePanel?.customerId === customer.id &&
                activePanel.action === 'addPet' &&
                accessToken ? (
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
      </div>
    </main>
  );
}
