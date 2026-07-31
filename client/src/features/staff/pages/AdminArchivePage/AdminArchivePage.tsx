import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  hardDeleteProduct,
  listArchivedProducts,
  restoreProduct,
} from '../../../catalog/api/catalog.api';
import {
  hardDeletePet,
  listArchivedCustomers,
  listArchivedPets,
  hardDeleteCustomer,
  restoreCustomer,
  restorePet,
} from '../../../customers/api/customer.api';
import {
  hardDeleteDiscount,
  listArchivedDiscounts,
  restoreDiscount,
} from '../../../discounts/api/discounts.api';
import {
  hardDeletePackage,
  hardDeletePromo,
  listArchivedPackages,
  listArchivedPromos,
  restorePackage,
  restorePromo,
} from '../../../maintenance/api/maintenance.api';
import {
  hardDeleteStaffAccount,
  listArchivedStaff,
  restoreStaffAccount,
} from '../../api/staff.api';
import { listStaff } from '../../api/staff.api';
import { ArchiveList } from '../../components/ArchiveList/ArchiveList';
import styles from './AdminArchivePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ArchiveTab =
  | 'products'
  | 'staff'
  | 'customers'
  | 'discounts'
  | 'promos'
  | 'packages';

const TABS: { key: ArchiveTab; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'staff', label: 'Staff' },
  { key: 'customers', label: 'Customers & Pets' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'promos', label: 'Promos' },
  { key: 'packages', label: 'Packages' },
];

/**
 * Final-decision view for the archive workflow: an admin lands here to
 * Restore or permanently Delete a record that was already soft-archived
 * from its own admin page (Product Catalog / Staff Management / Customer
 * Management). One page with tabs rather than three embedded panels, since
 * all three entities share identical restore/hard-delete mechanics.
 */
export function AdminArchivePage() {
  const { user, accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

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

  const activeTab: ArchiveTab =
    (searchParams.get('tab') as ArchiveTab | null) &&
    TABS.some((tab) => tab.key === searchParams.get('tab'))
      ? (searchParams.get('tab') as ArchiveTab)
      : 'products';

  if (isRoleLoading) {
    return <p className={styles.copy}>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Archive</h1>
        <p className={styles.copy}>
          Records archived from their own admin page end up here - restore
          them, or permanently delete them once you're sure.
        </p>

        <div className={styles.tabs} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={
                activeTab === tab.key ? styles.tabActive : styles.tab
              }
              onClick={() => setSearchParams({ tab: tab.key })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'products' ? (
          <ArchiveList
            entityLabel="products"
            accessToken={accessToken}
            fetchArchived={listArchivedProducts}
            restoreItem={restoreProduct}
            hardDeleteItem={hardDeleteProduct}
            renderLabel={(item) => `${item.name} (${item.category})`}
          />
        ) : null}

        {activeTab === 'staff' ? (
          <ArchiveList
            entityLabel="staff accounts"
            accessToken={accessToken}
            fetchArchived={listArchivedStaff}
            restoreItem={restoreStaffAccount}
            hardDeleteItem={hardDeleteStaffAccount}
            renderLabel={(item) => `${item.display_name} (${item.role})`}
          />
        ) : null}

        {activeTab === 'customers' ? (
          <div className={styles.customerTabs}>
            <section>
              <h2 className={styles.sectionTitle}>Customers</h2>
              <ArchiveList
                entityLabel="customers"
                accessToken={accessToken}
                fetchArchived={listArchivedCustomers}
                restoreItem={restoreCustomer}
                hardDeleteItem={hardDeleteCustomer}
                renderLabel={(item) => `${item.full_name} (${item.account_email})`}
              />
            </section>
            <section>
              <h2 className={styles.sectionTitle}>Pets</h2>
              <ArchiveList
                entityLabel="pets"
                accessToken={accessToken}
                fetchArchived={(token) => listArchivedPets(token)}
                restoreItem={restorePet}
                hardDeleteItem={hardDeletePet}
                renderLabel={(item) => item.name}
              />
            </section>
          </div>
        ) : null}

        {activeTab === 'discounts' ? (
          <ArchiveList
            entityLabel="discounts"
            accessToken={accessToken}
            fetchArchived={listArchivedDiscounts}
            restoreItem={restoreDiscount}
            hardDeleteItem={hardDeleteDiscount}
            renderLabel={(item) => item.name}
          />
        ) : null}

        {activeTab === 'promos' ? (
          <ArchiveList
            entityLabel="promos"
            accessToken={accessToken}
            fetchArchived={listArchivedPromos}
            restoreItem={restorePromo}
            hardDeleteItem={hardDeletePromo}
            renderLabel={(item) => item.name}
          />
        ) : null}

        {activeTab === 'packages' ? (
          <ArchiveList
            entityLabel="packages"
            accessToken={accessToken}
            fetchArchived={listArchivedPackages}
            restoreItem={restorePackage}
            hardDeleteItem={hardDeletePackage}
            renderLabel={(item) => `${item.name} (PHP ${item.bundled_price.toFixed(2)})`}
          />
        ) : null}
      </div>
    </main>
  );
}
