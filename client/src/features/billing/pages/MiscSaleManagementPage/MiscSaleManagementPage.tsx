import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  deleteMiscSale,
  listMiscSales,
  updateMiscSale,
} from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
import { useUnsavedChanges } from '../../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
import styles from './MiscSaleManagementPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

/**
 * Issue #85/#87 (per explicit request): Admin/Superadmin CRUD over recorded
 * miscellaneous sales - create happens on MiscellaneousSalePage; this page
 * lists existing ones with inline edit (description/amount) and delete,
 * mirroring CatalogAdminPage's inline-edit-row pattern. Backed by
 * PATCH/DELETE /billing/misc-sale/:id, which RLS (migration 20260731068/069)
 * and the route guard both restrict to Admin/Superadmin.
 */
export function MiscSaleManagementPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [sales, setSales] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [editingAmount, setEditingAmount] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

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

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

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

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  // Closures don't retain flow narrowing, even for a const - re-bind to a
  // definitely-string local so handleDelete below doesn't need its own
  // redundant null guard.
  const token = accessToken;

  function startEditing(sale: Transaction) {
    setEditingId(sale.id);
    setEditingDescription(sale.misc_sale_description ?? '');
    setEditingAmount(String(sale.total_amount));
    setRowError(null);
  }

  async function handleDelete(saleId: string) {
    setRowError(null);

    const result = await deleteMiscSale(saleId, token);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setSales((prev) => prev.filter((sale) => sale.id !== saleId));
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Miscellaneous Sales</h1>

        {isLoading ? (
          <p className={styles.copy}>Loading...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : sales.length === 0 ? (
          <p className={styles.copy}>No miscellaneous sales recorded yet.</p>
        ) : (
          <ul className={styles.list}>
            {sales.map((sale) => (
              <li className={styles.listItem} key={sale.id}>
                {editingId === sale.id ? (
                  <>
                    <input
                      className={styles.input}
                      value={editingDescription}
                      onChange={(event) =>
                        setEditingDescription(event.target.value)
                      }
                    />
                    <input
                      className={styles.input}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editingAmount}
                      onChange={(event) => setEditingAmount(event.target.value)}
                    />
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
                ) : (
                  <>
                    <span className={styles.description}>
                      {sale.misc_sale_description}
                      <span className={styles.statusBadge}>
                        {sale.payment_status}
                      </span>
                    </span>
                    <span className={styles.amount}>
                      PHP {sale.total_amount.toFixed(2)}
                    </span>
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
                )}
              </li>
            ))}
          </ul>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
