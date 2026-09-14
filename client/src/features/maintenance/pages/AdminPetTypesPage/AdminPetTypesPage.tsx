import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createPetType,
  deletePetType,
  deletePetTypePriceOverride,
  listBranches,
  listPetTypePriceOverrides,
  listPetTypes,
  updatePetType,
  upsertPetTypePriceOverride,
} from '../../api/maintenance.api';
import type {
  BranchSummary,
  PetTypePriceOverride,
  PetTypeRow,
} from '../../maintenance.types';
import styles from './AdminPetTypesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const SYSTEM_DEFAULT_OPTION = '';

/**
 * Architectural-Change-History: "Add admin config to pet types... set X
 * fixed price to pet types, this will override service and package
 * prices... cat type... fixed price at 800." pet_type used to be a hardcoded
 * 2-value enum (Dog/Cat) - it's now the pet_types admin-CRUD table
 * (20260912191), and a brand-new row here won't have any special pricing
 * behavior until an admin also sets a fixed-price override for it below (the
 * plain weight/coat matrix pricing applies otherwise, same fallback Dog
 * already uses today).
 */
export function AdminPetTypesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [petTypes, setPetTypes] = useState<PetTypeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    SYSTEM_DEFAULT_OPTION
  );
  const [overrides, setOverrides] = useState<PetTypePriceOverride[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [priceError, setPriceError] = useState<string | null>(null);

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

    void listPetTypes(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load pet types.');
        return;
      }

      setPetTypes(result.data);
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listPetTypePriceOverrides(
      accessToken,
      selectedBranchId || undefined
    ).then((result) => {
      if (!isMounted || !result.data) {
        return;
      }

      setOverrides(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer, selectedBranchId]);

  // Effective price per pet type at the currently selected scope: the
  // branch-specific row if one exists, else the system-wide default row,
  // else no override at all - same fallback resolveEffectivePolicy uses for
  // Policies, just keyed per pet type instead of a single settings row.
  function effectiveOverrideFor(
    petTypeKey: string
  ): PetTypePriceOverride | null {
    const rowsForType = overrides.filter((row) => row.pet_type === petTypeKey);
    const branchRow = selectedBranchId
      ? rowsForType.find((row) => row.branch_id === selectedBranchId)
      : undefined;
    const defaultRow = rowsForType.find((row) => row.branch_id === null);
    return branchRow ?? defaultRow ?? null;
  }

  function priceInputFor(petTypeKey: string): string {
    if (petTypeKey in priceInputs) return priceInputs[petTypeKey];
    return effectiveOverrideFor(petTypeKey)?.fixed_price.toString() ?? '';
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !newKey.trim() || !newName.trim()) {
      setFormError('Key and name are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createPetType(accessToken, {
      key: newKey.trim(),
      name: newName.trim(),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add pet type.');
      return;
    }

    setPetTypes((prev) => [...prev, result.data as PetTypeRow]);
    setNewKey('');
    setNewName('');
    setMessage('Pet type added.');
  }

  function startEditing(petType: PetTypeRow) {
    setEditingId(petType.id);
    setEditingName(petType.name);
    setRowError(null);
  }

  async function handleRename(petTypeId: string) {
    if (!accessToken || !editingName.trim()) {
      setRowError('Name is required.');
      return;
    }

    setRowError(null);

    const result = await updatePetType(petTypeId, accessToken, {
      name: editingName.trim(),
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not rename pet type.');
      return;
    }

    setPetTypes((prev) =>
      prev.map((petType) =>
        petType.id === petTypeId ? (result.data as PetTypeRow) : petType
      )
    );
    setEditingId(null);
    setMessage('Pet type renamed.');
  }

  async function handleToggleActive(petType: PetTypeRow) {
    if (!accessToken) return;

    setRowError(null);

    const result = await updatePetType(petType.id, accessToken, {
      is_active: !petType.is_active,
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update pet type.');
      return;
    }

    setPetTypes((prev) =>
      prev.map((row) =>
        row.id === petType.id ? (result.data as PetTypeRow) : row
      )
    );
  }

  async function handleDelete(petTypeId: string) {
    if (!accessToken) {
      return;
    }

    setRowError(null);

    const result = await deletePetType(petTypeId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setPetTypes((prev) => prev.filter((petType) => petType.id !== petTypeId));
    setMessage('Pet type deleted.');
  }

  async function handleSavePrice(petTypeKey: string) {
    if (!accessToken) return;

    const raw = priceInputFor(petTypeKey);
    const fixedPrice = Number(raw);

    if (raw.trim() === '' || Number.isNaN(fixedPrice) || fixedPrice < 0) {
      setPriceError('Enter a valid, non-negative price.');
      return;
    }

    setPriceError(null);

    const result = await upsertPetTypePriceOverride(accessToken, {
      pet_type: petTypeKey,
      branch_id: selectedBranchId || null,
      fixed_price: fixedPrice,
    });

    if (result.error || !result.data) {
      setPriceError(result.error ?? 'Could not save the fixed price.');
      return;
    }

    const savedOverride = result.data;

    setOverrides((prev) => [
      ...prev.filter(
        (row) =>
          !(
            row.pet_type === petTypeKey &&
            row.branch_id === (selectedBranchId || null)
          )
      ),
      savedOverride,
    ]);
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[petTypeKey];
      return next;
    });
    setMessage('Fixed price saved.');
  }

  async function handleClearPrice(petTypeKey: string) {
    if (!accessToken) return;

    const ownScopeRow = overrides.find(
      (row) =>
        row.pet_type === petTypeKey &&
        row.branch_id === (selectedBranchId || null)
    );

    if (!ownScopeRow) return;

    setPriceError(null);

    const result = await deletePetTypePriceOverride(
      ownScopeRow.id,
      accessToken
    );

    if (result.error) {
      setPriceError(result.error);
      return;
    }

    setOverrides((prev) => prev.filter((row) => row.id !== ownScopeRow.id));
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[petTypeKey];
      return next;
    });
    setMessage('Fixed price cleared.');
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

  const activePetTypes = petTypes.filter((petType) => petType.is_active);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Pet Types</h1>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="add-pet-type-title">
          <h2 className={styles.sectionTitle} id="add-pet-type-title">
            Add pet type
          </h2>
          <p className={styles.copy}>
            A new pet type won&apos;t have a fixed price or any other special
            pricing behavior until you configure one below - it prices like any
            other pet (weight/coat matrix if a service opts in, otherwise the
            service&apos;s own price) in the meantime.
          </p>
          <form
            className={styles.form}
            onSubmit={(event) => void handleCreate(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Key (not shown to customers)</span>
              <input
                className={styles.input}
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
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
              {isSubmitting ? 'Adding...' : 'Add pet type'}
            </button>
          </form>
        </section>

        <section
          className={styles.panel}
          aria-labelledby="pet-types-list-title"
        >
          <h2 className={styles.sectionTitle} id="pet-types-list-title">
            Existing pet types
          </h2>
          {isLoading ? (
            <p className={styles.copy}>Loading pet types...</p>
          ) : loadError ? (
            <p className={styles.errorBanner} role="alert">
              {loadError}
            </p>
          ) : (
            <ul className={styles.list}>
              {petTypes.map((petType) => (
                <li className={styles.listItem} key={petType.id}>
                  {editingId === petType.id ? (
                    <>
                      <input
                        className={styles.input}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => void handleRename(petType.id)}
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
                      <span
                        className={
                          petType.is_active
                            ? styles.itemName
                            : `${styles.itemName} ${styles.itemInactive}`
                        }
                      >
                        {petType.name}
                        {petType.is_active ? '' : ' (inactive)'}
                      </span>
                      <span className={styles.itemKey}>{petType.key}</span>
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => startEditing(petType)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => void handleToggleActive(petType)}
                      >
                        {petType.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => void handleDelete(petType.id)}
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
        </section>

        <section
          className={styles.panel}
          aria-labelledby="pet-type-pricing-title"
        >
          <h2 className={styles.sectionTitle} id="pet-type-pricing-title">
            Fixed price overrides
          </h2>
          <p className={styles.copy}>
            When set, every service and package booked for that pet type is
            charged this one flat price instead - it replaces the
            service/package&apos;s own price (base price or weight/coat matrix)
            entirely. Leave a field blank for "no override, use normal pricing."
          </p>
          <label className={styles.field}>
            <span className={styles.label}>Branch</span>
            <select
              className={styles.input}
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              <option value={SYSTEM_DEFAULT_OPTION}>
                System default (all branches)
              </option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <ul className={styles.list}>
            {activePetTypes.map((petType) => {
              const ownScopeRow = overrides.find(
                (row) =>
                  row.pet_type === petType.key &&
                  row.branch_id === (selectedBranchId || null)
              );

              return (
                <li className={styles.listItem} key={petType.id}>
                  <span className={styles.itemName}>{petType.name}</span>
                  <input
                    className={styles.priceInput}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No override"
                    value={priceInputFor(petType.key)}
                    onChange={(event) =>
                      setPriceInputs((prev) => ({
                        ...prev,
                        [petType.key]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => void handleSavePrice(petType.key)}
                  >
                    Save
                  </button>
                  {ownScopeRow ? (
                    <button
                      type="button"
                      className={styles.smallButtonSecondary}
                      onClick={() => void handleClearPrice(petType.key)}
                    >
                      Clear
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {priceError ? (
            <p className={styles.errorBanner} role="alert">
              {priceError}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
