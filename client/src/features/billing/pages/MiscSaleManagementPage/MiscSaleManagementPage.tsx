import { useEffect, useMemo, useState } from 'react';
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
import type { PaymentFields, Transaction } from '../../billing.types';
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
import { PaymentMethodForm } from '../../components/PaymentMethodForm/PaymentMethodForm';
import {
  applyMiscSaleFilters,
  buildMiscSaleFilterFields,
  buildMiscSaleGroupByAxes,
  deriveMiscSaleSortKey,
  matchesMiscSaleQuery,
  MISC_SALE_COMPARATORS,
  MISC_SALE_SORT_FIELDS,
} from './miscSaleBrowserFields';
import {
  MISC_SALE_VIEWER_ROLES,
  NEW_MISC_SALE_PATH,
} from '../../miscSaleAccess';
import styles from './MiscSaleManagementPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

type ViewMode = 'table' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/** Session 115: promoted from an Admin/Superadmin-only page under Settings
 * to the one shared list every money-handling role reaches from their own
 * sidebar (Cashier's "Miscellaneous Sales" tile) - view/create is
 * MISC_SALE_VIEWER_ROLES; Admin/Superadmin additionally get
 * Edit/Delete (BILLING_ADMIN_ROLES, mirrored by the RLS on transactions/
 * transaction_line_items, migration 20260731068/069). */
const ADMIN_ROLES = new Set(['Admin', 'Superadmin']);

/** Code-review fix (session 115): mirrors TransactionHistoryTable's own
 * ALLOWED_VIEWER_ROLES literal - Receptionist can view this page but is NOT
 * allowed on the Transactions page (server's TRANSACTION_HISTORY_READ_ROLES
 * excludes it), so "View in Transactions" must not be offered to them; it
 * would otherwise 403 once clicked. */
const TRANSACTION_HISTORY_ROLES = new Set([
  'Superadmin',
  'Admin',
  'Supervisor',
  'Cashier',
  'Front Desk',
]);

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
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentFields>({
    payment_method: 'Cash',
  });
  const [rowError, setRowError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
      if (result.error || !result.data) {
        // Code-review fix (session 115): surface the failure instead of
        // silently leaving every row's customer column reading "Unknown
        // customer" with no indication anything went wrong.
        setCustomersError(
          result.error ?? 'Could not load customers for this branch.'
        );
        return;
      }

      setCustomersError(null);
      setCustomers(
        result.data.map((customer) => ({
          id: customer.id,
          full_name: customer.full_name,
        }))
      );
    });
  }, [accessToken]);

  const isAllowedViewer =
    viewerRole !== null && MISC_SALE_VIEWER_ROLES.has(viewerRole);
  const isAdmin = viewerRole !== null && ADMIN_ROLES.has(viewerRole);
  const canViewTransactions =
    viewerRole !== null && TRANSACTION_HISTORY_ROLES.has(viewerRole);

  function customerName(customerId: string): string {
    return (
      customers.find((customer) => customer.id === customerId)?.full_name ??
      'Unknown customer'
    );
  }

  function startEditing(sale: Transaction) {
    setEditingSaleId(sale.id);
    setEditingPayment({
      payment_method: sale.payment_method,
      bank_name: sale.bank_name ?? undefined,
      payment_reference: sale.payment_reference ?? undefined,
    });
    setRowError(null);
  }

  function closeEditModal() {
    setEditingSaleId(null);
    setRowError(null);
  }

  async function handleSaveEdit() {
    if (!accessToken || !editingSaleId) return;

    setIsSavingEdit(true);
    setRowError(null);

    const result = await updateMiscSale(
      editingSaleId,
      {
        payment_method: editingPayment.payment_method,
        bank_name: editingPayment.bank_name,
        payment_reference: editingPayment.payment_reference,
      },
      accessToken
    );

    setIsSavingEdit(false);

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update this sale.');
      return;
    }

    setSales((prev) =>
      prev.map((sale) =>
        sale.id === editingSaleId ? result.data!.transaction : sale
      )
    );
    setEditingSaleId(null);
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
    const menuItems: MoreOptionsMenuItem[] = canViewTransactions
      ? [
          {
            label: 'View in Transactions',
            onSelect: () => navigate('/staff/reports/transaction-history'),
          },
        ]
      : [];

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
        {menuItems.length > 0 ? (
          <MoreOptionsMenu
            label={`Options for ${sale.misc_sale_description ?? 'this sale'}`}
            items={menuItems}
          />
        ) : null}
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
      render: (sale) => sale.misc_sale_description,
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
      render: (sale) => formatCurrency(sale.total_amount),
    },
  ];

  function renderSaleCard(sale: Transaction) {
    return (
      <div className={styles.rowMain}>
        <span className={styles.itemName}>{sale.misc_sale_description}</span>
        <span className={styles.copy}>{customerName(sale.customer_id)}</span>
        <span className={styles.copy}>{sale.payment_method}</span>
        <span className={styles.itemPrice}>
          {formatCurrency(sale.total_amount)}
        </span>
        {renderRowActions(sale)}
      </div>
    );
  }

  if (isRoleLoading) {
    return <LoadingState />;
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
            onClick={() => navigate(NEW_MISC_SALE_PATH)}
          >
            New Misc Sale
          </button>
        </div>

        {customersError ? (
          <p className={styles.errorBanner} role="alert">
            {customersError}
          </p>
        ) : null}

        {isLoading ? (
          <LoadingState />
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

        {rowError && !editingSaleId ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={editingSaleId !== null}
        title="Edit payment method"
        onClose={closeEditModal}
        closeOnBackdropClick={false}
      >
        <PaymentMethodForm
          value={editingPayment}
          onChange={setEditingPayment}
          amountDue={0}
          hideCashTendered
        />
        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.smallButtonSecondary}
            onClick={closeEditModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.smallButton}
            disabled={isSavingEdit}
            onClick={() => void handleSaveEdit()}
          >
            {isSavingEdit ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
