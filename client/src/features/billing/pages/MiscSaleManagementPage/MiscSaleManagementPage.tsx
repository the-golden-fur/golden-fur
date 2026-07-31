import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  deleteMiscSale,
  listMiscSales,
  updateMiscSale,
} from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
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

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  // Closures don't retain flow narrowing, even for a const - re-bind to a
  // definitely-string local so handleSaveEdit/handleDelete below don't need
  // their own redundant null guards.
  const token = accessToken;

  function startEditing(sale: Transaction) {
    setEditingId(sale.id);
    setEditingDescription(sale.misc_sale_description ?? '');
    setEditingAmount(String(sale.total_amount));
    setRowError(null);
  }

  async function handleSaveEdit(saleId: string) {
    const amount = Number(editingAmount);

    if (!editingDescription.trim() || Number.isNaN(amount) || amount <= 0) {
      setRowError('Description and a positive amount are required.');
      return;
    }

    setRowError(null);

    const result = await updateMiscSale(
      saleId,
      { description: editingDescription.trim(), amount },
      token
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update this sale.');
      return;
    }

    setSales((prev) =>
      prev.map((sale) => (sale.id === saleId ? result.data!.transaction : sale))
    );
    setEditingId(null);
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
                      onClick={() => void handleSaveEdit(sale.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.smallButtonSecondary}
                      onClick={() => setEditingId(null)}
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
