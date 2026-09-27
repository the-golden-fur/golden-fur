import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Columns3, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listCustomers } from '../../../customers/api/customer.api';
import {
  deleteMiscSale,
  listMiscSales,
  updateMiscSale,
} from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
import { useUnsavedChanges } from '../../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { PaymentStatusBadge } from '../../../booking/components/shared/PaymentStatusBadge/PaymentStatusBadge';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { MiscellaneousSaleForm } from '../../components/MiscellaneousSaleForm/MiscellaneousSaleForm';
import {
  applyMiscSaleFilters,
  buildMiscSaleFilterFields,
  buildMiscSaleGroupByAxes,
  deriveMiscSaleSortKey,
  matchesMiscSaleQuery,
  MISC_SALE_COMPARATORS,
  MISC_SALE_SORT_FIELDS,
} from './miscSaleBrowserFields';
import styles from './MiscSaleManagementPage.module.css';

type ViewMode = 'table' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/** Session 115: promoted from an Admin/Superadmin-only page under Settings
 * to the one shared list every money-handling role reaches from their own
 * sidebar (Cashier's "Miscellaneous Sales" tile) - view/create matches the
 * server's BILLING_STAFF_ROLES; Admin/Superadmin additionally get
 * Edit/Delete (BILLING_ADMIN_ROLES, mirrored by the RLS on transactions/
 * transaction_line_items, migration 20260731068/069). */
const ALLOWED_VIEWER_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
]);
const ADMIN_ROLES = new Set(['Admin', 'Superadmin']);

export function MiscSaleManagementPage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [sales, setSales] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<
    { id: string; full_name: string }[]
  >([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [editingAmount, setEditingAmount] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState('status');

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

  useEffect(() => {
    if (!accessToken) return;

    void listMiscSales(accessToken).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load miscellaneous sales.');
        return;
      }

      setSales(result.data);
    });
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    void listCustomers(accessToken).then((result) => {
      if (result.data) {
        setCustomers(
          result.data.map((customer) => ({
            id: customer.id,
            full_name: customer.full_name,
          }))
        );
      }
    });
  }, [accessToken]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  const isAdmin = viewerRole !== null && ADMIN_ROLES.has(viewerRole);

  function customerName(customerId: string): string {
    return (
      customers.find((customer) => customer.id === customerId)?.full_name ??
      'Unknown customer'
    );
  }

  async function handleSaveEdit(saleId: string) {
    if (!accessToken) {
      return;
    }

    const amount = Number(editingAmount);

    if (!editingDescription.trim() || Number.isNaN(amount) || amount <= 0) {
      const message = 'Description and a positive amount are required.';
      setRowError(message);
      throw new Error(message);
    }

    setRowError(null);

    const result = await updateMiscSale(
      saleId,
      { description: editingDescription.trim(), amount },
      accessToken
    );

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not update this sale.';
      setRowError(message);
      throw new Error(message);
    }

    setSales((prev) =>
      prev.map((sale) => (sale.id === saleId ? result.data!.transaction : sale))
    );
    setEditingId(null);
  }

  const editingSale = sales.find((sale) => sale.id === editingId) ?? null;

  const handleDiscardEdit = useCallback(() => {
    setEditingId(null);
    setRowError(null);
  }, []);

  // handleSaveEdit is a plain function (redefined every render), so this
  // wrapper must list every piece of state it reads as its own deps -
  // otherwise an unmemoized onSave identity re-triggers useUnsavedChanges'
  // registration effect on every render, changing the provider's context
  // value, re-rendering this component, creating another fresh onSave... an
  // infinite loop with no user action needed to sustain it.
  const handleUnsavedSave = useCallback(
    () => (editingId !== null ? handleSaveEdit(editingId) : Promise.resolve()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, accessToken, editingAmount, editingDescription]
  );

  // Only one row mid-edit at a time (editingId), so this is the
  // "per-in-progress-edit" shape of the pattern - a stable id with entering
  // edit mode itself as the dirty signal, same as AdminCagesPage's cage-edit
  // registration.
  useUnsavedChanges({
    id: 'misc-sale-edit',
    label: editingSale
      ? `Sale: ${editingSale.misc_sale_description}`
      : 'Miscellaneous sale',
    isDirty: editingId !== null,
    onSave: handleUnsavedSave,
    onDiscard: handleDiscardEdit,
  });

  function startEditing(sale: Transaction) {
    setEditingId(sale.id);
    setEditingDescription(sale.misc_sale_description ?? '');
    setEditingAmount(String(sale.total_amount));
    setRowError(null);
  }

  async function handleDelete(saleId: string) {
    if (!accessToken) return;
    setRowError(null);

    const result = await deleteMiscSale(saleId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setSales((prev) => prev.filter((sale) => sale.id !== saleId));
  }

  function handleCreated(response: { transaction: Transaction }) {
    setSales((prev) => [response.transaction, ...prev]);
    setIsCreateModalOpen(false);
  }

  const filterFields = useMemo(
    () => buildMiscSaleFilterFields(customers),
    [customers]
  );
  const groupByAxes = useMemo(() => buildMiscSaleGroupByAxes(), []);

  const visibleSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? sales.filter((sale) => matchesMiscSaleQuery(sale, query))
      : sales;
    const filtered = applyMiscSaleFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      MISC_SALE_COMPARATORS[deriveMiscSaleSortKey(sortTile)]
    );
  }, [sales, search, filterTiles, sortTile]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedSales = useGroupBy(
    visibleSales,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((entry) => entry.id === fieldId);
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

  function renderRowActions(sale: Transaction) {
    const menuItems: MoreOptionsMenuItem[] = [
      {
        label: 'View in Transactions',
        onSelect: () => navigate('/staff/reports/transaction-history'),
      },
    ];

    if (editingId === sale.id) {
      return (
        <>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() =>
              void handleSaveEdit(sale.id).catch(() => {
                // rowError is already set and shown below - nothing else to do.
              })
            }
          >
            Save
          </button>
          <button
            type="button"
            className={styles.smallButtonSecondary}
            onClick={handleDiscardEdit}
          >
            Cancel
          </button>
        </>
      );
    }

    return (
      <>
        {isAdmin ? (
          <>
            <button
              type="button"
              className={styles.smallButtonSecondary}
              onClick={() => startEditing(sale)}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.smallButtonSecondary}
              onClick={() => void handleDelete(sale.id)}
            >
              Delete
            </button>
          </>
        ) : null}
        <MoreOptionsMenu
          label={`Options for ${sale.misc_sale_description ?? 'this sale'}`}
          items={menuItems}
        />
      </>
    );
  }

  const columns: DataTableColumn<Transaction>[] = [
    {
      id: 'date',
      header: 'Date',
      render: (sale) => new Date(sale.created_at).toLocaleDateString(),
    },
    {
      id: 'customer',
      header: 'Customer',
      render: (sale) => customerName(sale.customer_id),
    },
    {
      id: 'description',
      header: 'Description',
      render: (sale) =>
        editingId === sale.id ? (
          <input
            className={styles.input}
            value={editingDescription}
            onChange={(event) => setEditingDescription(event.target.value)}
          />
        ) : (
          sale.misc_sale_description
        ),
    },
    {
      id: 'paymentMethod',
      header: 'Payment method',
      render: (sale) => sale.payment_method,
    },
    {
      id: 'status',
      header: 'Status',
      render: (sale) => (
        <PaymentStatusBadge status={sale.payment_status} context="billing" />
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'end',
      render: (sale) =>
        editingId === sale.id ? (
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            value={editingAmount}
            onChange={(event) => setEditingAmount(event.target.value)}
          />
        ) : (
          formatCurrency(sale.total_amount)
        ),
    },
  ];

  function renderSaleCard(sale: Transaction) {
    return (
      <div className={styles.rowMain}>
        <span className={styles.itemName}>
          {editingId === sale.id ? (
            <input
              className={styles.input}
              value={editingDescription}
              onChange={(event) => setEditingDescription(event.target.value)}
            />
          ) : (
            sale.misc_sale_description
          )}
        </span>
        <span className={styles.copy}>{customerName(sale.customer_id)}</span>
        <span className={styles.copy}>{sale.payment_method}</span>
        {editingId === sale.id ? (
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            value={editingAmount}
            onChange={(event) => setEditingAmount(event.target.value)}
          />
        ) : (
          <span className={styles.itemPrice}>
            {formatCurrency(sale.total_amount)}
          </span>
        )}
        {renderRowActions(sale)}
      </div>
    );
  }

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Miscellaneous Sales</h1>
          <button
            type="button"
            className={styles.button}
            onClick={() => setIsCreateModalOpen(true)}
          >
            New Misc Sale
          </button>
        </div>

        {isLoading ? (
          <p className={styles.copy}>Loading...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <FilterSortBar
              filterFields={filterFields}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={MISC_SALE_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by description, method, status..."
            >
              <div className={styles.toolbar}>
                <ViewSwitcher
                  ariaLabel="Miscellaneous Sales view"
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                />
                {view === 'board' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Group by</span>
                    <select
                      className={styles.input}
                      value={groupAxisId}
                      onChange={(event) => setGroupAxisId(event.target.value)}
                      aria-label="Group by"
                    >
                      {groupByAxes.map((axis) => (
                        <option key={axis.id} value={axis.id}>
                          {axis.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </FilterSortBar>

            {view === 'table' ? (
              <DataTable
                columns={columns}
                rows={visibleSales}
                getRowKey={(sale) => sale.id}
                renderRowActions={renderRowActions}
                emptyMessage="No miscellaneous sales match this filter."
              />
            ) : (
              <DataBoard
                groups={groupedSales}
                getRowKey={(sale) => sale.id}
                renderCard={renderSaleCard}
                emptyColumnMessage="No sales here."
              />
            )}
          </>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title="New Miscellaneous Sale"
        onClose={() => setIsCreateModalOpen(false)}
        closeOnBackdropClick={false}
      >
        <MiscellaneousSaleForm
          accessToken={accessToken}
          onCreated={handleCreated}
        />
      </Modal>
    </main>
  );
}
