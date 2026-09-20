import { useEffect, useMemo, useState } from 'react';
import { Columns3, LayoutGrid, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import { DataTable, type DataTableColumn } from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import type { MoreOptionsMenuItem } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ViewSwitcher, type ViewSwitcherOption } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import {
  GROUP_SORT_MODE_OPTIONS,
  sortGroupByAxis,
  useGroupBy,
  type GroupSortMode,
} from '../../../../shared/hooks/useGroupBy/useGroupBy';
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
import {
  applyCustomerFilters,
  CUSTOMER_COMPARATORS,
  CUSTOMER_FILTER_FIELDS,
  CUSTOMER_GROUP_BY_AXES,
  CUSTOMER_SORT_FIELDS,
  deriveCustomerSortKey,
  matchesCustomerQuery,
} from './customerBrowserFields';
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

type CustomerViewMode = 'gallery' | 'table' | 'list' | 'board';

const CUSTOMER_VIEW_OPTIONS: ViewSwitcherOption<CustomerViewMode>[] = [
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

const SIGN_IN_METHOD_LABELS: Record<
  CustomerProfile['primary_auth_provider'],
  string
> = {
  email: 'Email',
  google: 'Google',
  facebook: 'Facebook',
};

const PANEL_TITLES: Record<'checkProfile' | 'viewPets' | 'addPet', string> = {
  checkProfile: 'Profile',
  viewPets: 'Pets',
  addPet: 'Add a pet',
};

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

  // 'deactivate'/'archive' are immediate actions (see handleSelectAction)
  // and never land here - only the three modal-opening actions do.
  const [activePanel, setActivePanel] = useState<{
    customerId: string;
    action: 'checkProfile' | 'viewPets' | 'addPet';
  } | null>(null);
  const [petsByCustomer, setPetsByCustomer] = useState<Record<string, Pet[]>>(
    {}
  );
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [petsLoadError, setPetsLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [view, setView] = useState<CustomerViewMode>('gallery');
  const [groupAxisId, setGroupAxisId] = useState('status');
  const [groupSortMode, setGroupSortMode] = useState<GroupSortMode>('manual');

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
    // The detail Modal is no longer keyed per-row, so it must be explicitly
    // closed here - an archived customer no longer exists in the list for
    // it to reopen against.
    setActivePanel((current) =>
      current?.customerId === customerId ? null : current
    );
    setMessage('Customer archived.');
  }

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? customers.filter((customer) => matchesCustomerQuery(customer, query))
      : customers;
    const filtered = applyCustomerFilters(searched, filterTiles);

    // No sort tile means "keep fetch order" rather than imposing a default.
    if (!sortTile) return filtered;
    return [...filtered].sort(
      CUSTOMER_COMPARATORS[deriveCustomerSortKey(sortTile)]
    );
  }, [customers, search, filterTiles, sortTile]);

  const activeGroupAxis =
    CUSTOMER_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const sortedGroupAxis = activeGroupAxis
    ? sortGroupByAxis(activeGroupAxis, groupSortMode)
    : null;
  const groupedCustomers = useGroupBy(
    visibleCustomers,
    view === 'board' ? sortedGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = CUSTOMER_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  function renderCustomerActions(customer: CustomerProfile) {
    return (
      <CustomerRowActionMenu
        onSelect={(action) => handleSelectAction(customer.id, action)}
        canArchive={viewerRole === 'Admin' || viewerRole === 'Superadmin'}
        isActive={customer.is_active}
      />
    );
  }

  // Board/Gallery: mirrors CustomerRowActionMenu's own conditional item
  // logic (Check Profile/View Pets/Add Pet always; Deactivate/Reactivate
  // for Admin+; Archive for Admin+ once already inactive), but as plain
  // MoreOptionsMenuItem[] so it can go through CardContextMenu instead of
  // the always-visible "..." trigger CustomerRowActionMenu renders.
  function buildCustomerActionItems(customer: CustomerProfile): MoreOptionsMenuItem[] {
    const canArchive = viewerRole === 'Admin' || viewerRole === 'Superadmin';
    const items: MoreOptionsMenuItem[] = [
      { label: 'Check Profile', onSelect: () => handleSelectAction(customer.id, 'checkProfile') },
      { label: 'View Pets', onSelect: () => handleSelectAction(customer.id, 'viewPets') },
      { label: 'Add Pet', onSelect: () => handleSelectAction(customer.id, 'addPet') },
    ];
    if (canArchive) {
      items.push({
        label: customer.is_active ? 'Deactivate' : 'Reactivate',
        onSelect: () => handleSelectAction(customer.id, 'deactivate'),
      });
    }
    if (canArchive && !customer.is_active) {
      items.push({
        label: 'Archive',
        onSelect: () => handleSelectAction(customer.id, 'archive'),
      });
    }
    return items;
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

    setMessage(null);
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

  const activePanelCustomer = customers.find(
    (customer) => customer.id === activePanel?.customerId
  );

  function renderPanelContent(customer: CustomerProfile) {
    if (activePanel?.action === 'checkProfile') {
      return (
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
            <dt className={styles.detailLabel}>Preferred communication</dt>
            <dd className={styles.detailValue}>
              {customer.preferred_communication_channel ?? '—'}
            </dd>
          </div>
        </dl>
      );
    }

    if (activePanel?.action === 'viewPets') {
      if (isPetsLoading) return <p className={styles.copy}>Loading pets...</p>;
      if (petsLoadError) {
        return (
          <p className={styles.errorBanner} role="alert">
            {petsLoadError}
          </p>
        );
      }
      if ((petsByCustomer[customer.id] ?? []).length === 0) {
        return <p className={styles.copy}>No pets on file yet.</p>;
      }
      return (
        <div className={styles.petsGrid}>
          {(petsByCustomer[customer.id] ?? []).map((pet) => (
            <PetCard key={pet.id} pet={pet} linkBasePath="/staff/pets" />
          ))}
        </div>
      );
    }

    if (activePanel?.action === 'addPet' && accessToken) {
      return (
        <PetForm
          customerId={customer.id}
          accessToken={accessToken}
          onCreated={(pet) => handlePetCreated(customer.id, pet)}
          isStaff
        />
      );
    }

    return null;
  }

  const customerTableColumns: DataTableColumn<CustomerProfile>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (customer) => (
        <span className={styles.customerName}>{customer.full_name}</span>
      ),
    },
    { id: 'email', header: 'Email', render: (customer) => customer.account_email },
    {
      id: 'signInMethod',
      header: 'Sign-in method',
      render: (customer) =>
        SIGN_IN_METHOD_LABELS[customer.primary_auth_provider],
    },
    {
      id: 'status',
      header: 'Status',
      render: (customer) => <StatusBadge isActive={customer.is_active} />,
    },
  ];

  function renderCustomerCard(customer: CustomerProfile) {
    return (
      <CardContextMenu
        items={buildCustomerActionItems(customer)}
        label={`Actions for ${customer.full_name}`}
      >
        <div className={styles.customerCard}>
          <div className={styles.cardHeader}>
            <span className={styles.customerName}>{customer.full_name}</span>
            <StatusBadge isActive={customer.is_active} />
          </div>
          <span className={styles.customerEmail}>{customer.account_email}</span>
          <span className={styles.signInBadge}>
            {SIGN_IN_METHOD_LABELS[customer.primary_auth_provider]}
          </span>
        </div>
      </CardContextMenu>
    );
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
          <>
            <FilterSortBar
              filterFields={CUSTOMER_FILTER_FIELDS}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={CUSTOMER_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search customers..."
            >
              <div className={styles.viewControls}>
                <ViewSwitcher
                  options={CUSTOMER_VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel="Customers view"
                />
                {view === 'board' ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Group by</span>
                      <select
                        className={styles.input}
                        value={groupAxisId}
                        onChange={(event) => setGroupAxisId(event.target.value)}
                        aria-label="Group by"
                      >
                        {CUSTOMER_GROUP_BY_AXES.map((axis) => (
                          <option key={axis.id} value={axis.id}>
                            {axis.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Sort groups</span>
                      <select
                        className={styles.input}
                        value={groupSortMode}
                        onChange={(event) =>
                          setGroupSortMode(event.target.value as GroupSortMode)
                        }
                        aria-label="Sort groups"
                      >
                        {GROUP_SORT_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            </FilterSortBar>

            {visibleCustomers.length === 0 ? (
              <p className={styles.copy}>No customers match your search/filter.</p>
            ) : view === 'table' ? (
              <DataTable
                columns={customerTableColumns}
                rows={visibleCustomers}
                getRowKey={(customer) => customer.id}
                renderRowActions={renderCustomerActions}
              />
            ) : view === 'list' ? (
              <DataList
                items={visibleCustomers}
                getRowKey={(customer) => customer.id}
                renderItem={(customer) => (
                  <div className={styles.customerRow}>
                    <span className={styles.customerName}>
                      {customer.full_name}
                    </span>
                    <span className={styles.customerEmail}>
                      {customer.account_email}
                    </span>
                    {renderCustomerActions(customer)}
                  </div>
                )}
              />
            ) : view === 'board' ? (
              <DataBoard
                groups={groupedCustomers}
                getRowKey={(customer) => customer.id}
                renderCard={renderCustomerCard}
              />
            ) : (
              <div className={styles.grid}>
                {visibleCustomers.map((customer) => (
                  <div key={customer.id}>{renderCustomerCard(customer)}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={activePanel !== null && activePanelCustomer !== undefined}
        title={`${activePanel ? PANEL_TITLES[activePanel.action] : ''} - ${activePanelCustomer?.full_name ?? ''}`}
        onClose={() => setActivePanel(null)}
      >
        {activePanelCustomer ? renderPanelContent(activePanelCustomer) : null}
      </Modal>
    </main>
  );
}
