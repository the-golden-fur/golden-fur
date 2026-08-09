import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createCage,
  deleteCage,
  getCageGrid,
  setCageMaintenanceStatus,
  updateCage,
} from '../../api/hotel.api';
import type { Cage, CageSize } from '../../hotel.types';
import styles from './AdminCagesPage.module.css';

/** Matches HOTEL_ADMIN_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);
const CAGE_SIZES: CageSize[] = ['S', 'M', 'L', 'XL'];
const CAGE_SIZE_LABELS: Record<CageSize, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

interface CreateFormState {
  cageLabel: string;
  size: CageSize;
}

const EMPTY_CREATE_FORM: CreateFormState = { cageLabel: '', size: 'S' };

/**
 * Custom change: Cage CRUD (Settings > Config). Admin/Superadmin can add,
 * rename/resize, and delete specific cages - not just toggle Under
 * Maintenance (still available here too, folded into the same row rather
 * than living only on the operational CageStatusGrid at Hotel Queue).
 * Scoped to the viewer's own branch, same limitation the existing cage
 * grid/status endpoints already have for every role including Superadmin
 * (requireBranch always resolves the caller's own assigned branch - there
 * is no cross-branch override for this feature today).
 */
export function AdminCagesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [cages, setCages] = useState<Cage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingSize, setEditingSize] = useState<CageSize>('S');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

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

  function loadCages() {
    if (!accessToken) return;

    void getCageGrid(accessToken).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load cages.');
        return;
      }

      setLoadError(null);
      setCages(CAGE_SIZES.flatMap((size) => result.data![size]));
    });
  }

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;
    loadCages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAllowedViewer]);

  function replaceCage(updated: Cage) {
    setCages((prev) =>
      prev.map((cage) => (cage.id === updated.id ? updated : cage))
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !createForm.cageLabel.trim()) {
      setFormError('Cage label is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createCage(
      createForm.cageLabel.trim(),
      createForm.size,
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add cage.');
      return;
    }

    setCages((prev) => [...prev, result.data as Cage]);
    setCreateForm(EMPTY_CREATE_FORM);
    setMessage('Cage added.');
  }

  function startEditing(cage: Cage) {
    setEditingId(cage.id);
    setEditingLabel(cage.cage_label);
    setEditingSize(cage.size);
    setRowError(null);
  }

  async function handleSaveEdit(cageId: string) {
    if (!accessToken || !editingLabel.trim()) {
      setRowError('Cage label is required.');
      return;
    }

    setRowError(null);

    const result = await updateCage(
      cageId,
      { cage_label: editingLabel.trim(), size: editingSize },
      accessToken
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update cage.');
      return;
    }

    replaceCage(result.data);
    setEditingId(null);
    setMessage('Cage updated.');
  }

  async function handleToggleMaintenance(cage: Cage) {
    if (!accessToken) return;
    if (cage.status !== 'Available' && cage.status !== 'Under Maintenance') {
      return;
    }

    setRowError(null);

    const nextStatus =
      cage.status === 'Under Maintenance' ? 'Available' : 'Under Maintenance';

    const result = await setCageMaintenanceStatus(
      cage.id,
      nextStatus,
      accessToken
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update cage status.');
      return;
    }

    replaceCage(result.data);
  }

  async function handleDelete(cage: Cage) {
    if (!accessToken) return;

    setRowError(null);

    const result = await deleteCage(cage.id, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setCages((prev) => prev.filter((existing) => existing.id !== cage.id));
    setMessage('Cage deleted.');
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

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Cages</h1>
        <p className={styles.copy}>
          Add, rename/resize, or delete a cage at your branch. A cage that is
          currently Occupied or Reserved cannot be deleted.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="add-cage-title">
          <h2 className={styles.sectionTitle} id="add-cage-title">
            Add cage
          </h2>
          <form
            className={styles.form}
            onSubmit={(event) => void handleCreate(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Cage label</span>
              <input
                className={styles.input}
                value={createForm.cageLabel}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    cageLabel: event.target.value,
                  }))
                }
                placeholder="e.g. Makati-S-03"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Size</span>
              <select
                className={styles.input}
                value={createForm.size}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    size: event.target.value as CageSize,
                  }))
                }
              >
                {CAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {CAGE_SIZE_LABELS[size]}
                  </option>
                ))}
              </select>
            </label>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add cage'}
            </button>
          </form>
        </section>

        {isLoading ? (
          <p className={styles.copy}>Loading cages...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <ul className={styles.list}>
            {cages.map((cage) => (
              <li className={styles.listItem} key={cage.id}>
                <div className={styles.rowMain}>
                  {editingId === cage.id ? (
                    <>
                      <input
                        className={styles.input}
                        value={editingLabel}
                        onChange={(event) =>
                          setEditingLabel(event.target.value)
                        }
                      />
                      <select
                        className={styles.input}
                        value={editingSize}
                        onChange={(event) =>
                          setEditingSize(event.target.value as CageSize)
                        }
                      >
                        {CAGE_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => void handleSaveEdit(cage.id)}
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
                      <span className={styles.cageLabel}>
                        {cage.cage_label}
                      </span>
                      <span className={styles.cageSize}>
                        {CAGE_SIZE_LABELS[cage.size]}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${
                          cage.status === 'Available'
                            ? styles.statusAvailable
                            : cage.status === 'Under Maintenance'
                              ? styles.statusMaintenance
                              : styles.statusOccupied
                        }`}
                      >
                        {cage.status}
                      </span>
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => startEditing(cage)}
                      >
                        Edit
                      </button>
                      {cage.status === 'Available' ||
                      cage.status === 'Under Maintenance' ? (
                        <button
                          type="button"
                          className={styles.smallButtonSecondary}
                          onClick={() => void handleToggleMaintenance(cage)}
                        >
                          {cage.status === 'Under Maintenance'
                            ? 'Mark Available'
                            : 'Mark Under Maintenance'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.smallButtonDanger}
                        disabled={
                          cage.status === 'Occupied' ||
                          cage.status === 'Reserved'
                        }
                        onClick={() => void handleDelete(cage)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
            {cages.length === 0 ? (
              <p className={styles.copy}>No cages at this branch yet.</p>
            ) : null}
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
