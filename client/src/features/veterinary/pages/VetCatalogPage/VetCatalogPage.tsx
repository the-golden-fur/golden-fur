import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  createMedicationCatalogItem,
  createProcedureCatalogItem,
  deleteMedicationCatalogItem,
  deleteProcedureCatalogItem,
  listMedicationCatalog,
  listProcedureCatalog,
  updateMedicationCatalogItem,
  updateProcedureCatalogItem,
} from '../../api/veterinary.api';
import {
  PROCEDURE_TYPES,
  type ProcedureType,
  type VetMedicationCatalogItem,
  type VetProcedureCatalogItem,
} from '../../veterinary.types';
import styles from './VetCatalogPage.module.css';

/** Personal catalog - unlike the rest of this feature (any Veterinarian may
 * view/edit any consultation), only the owning Veterinarian can see or edit
 * their own catalog (server-enforced, see vetCatalog.service.ts). */
const ALLOWED_VIEWER_ROLES = new Set(['Veterinarian']);

export function VetCatalogPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [medications, setMedications] = useState<VetMedicationCatalogItem[]>(
    []
  );
  const [procedures, setProcedures] = useState<VetProcedureCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newMedName, setNewMedName] = useState('');
  const [newMedDose, setNewMedDose] = useState('');
  const [newMedPrice, setNewMedPrice] = useState('');
  const [medFormError, setMedFormError] = useState<string | null>(null);
  const [isSubmittingMed, setIsSubmittingMed] = useState(false);

  const [newProcType, setNewProcType] = useState<ProcedureType>(
    PROCEDURE_TYPES[0]
  );
  const [newProcDescription, setNewProcDescription] = useState('');
  const [newProcPrice, setNewProcPrice] = useState('');
  const [procFormError, setProcFormError] = useState<string | null>(null);
  const [isSubmittingProc, setIsSubmittingProc] = useState(false);

  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editingMedName, setEditingMedName] = useState('');
  const [editingMedDose, setEditingMedDose] = useState('');
  const [editingMedPrice, setEditingMedPrice] = useState('');
  const [medRowError, setMedRowError] = useState<string | null>(null);

  const [editingProcId, setEditingProcId] = useState<string | null>(null);
  const [editingProcType, setEditingProcType] =
    useState<ProcedureType>('Lab test');
  const [editingProcDescription, setEditingProcDescription] = useState('');
  const [editingProcPrice, setEditingProcPrice] = useState('');
  const [procRowError, setProcRowError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      setRoleStatus(
        result.data && ALLOWED_VIEWER_ROLES.has(result.data.role)
          ? 'ok'
          : 'denied'
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    const token = accessToken;
    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(token),
      listProcedureCatalog(token),
    ]).then(([medResult, procResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (medResult.error || !medResult.data) {
        setLoadError(medResult.error ?? 'Could not load your catalog.');
        return;
      }
      if (procResult.error || !procResult.data) {
        setLoadError(procResult.error ?? 'Could not load your catalog.');
        return;
      }

      setMedications(medResult.data);
      setProcedures(procResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  async function handleCreateMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !newMedName.trim()) {
      setMedFormError('Name is required.');
      return;
    }

    setMedFormError(null);
    setIsSubmittingMed(true);

    const result = await createMedicationCatalogItem(accessToken, {
      name: newMedName.trim(),
      default_dose: newMedDose.trim() || undefined,
      default_price: newMedPrice ? Number(newMedPrice) : undefined,
    });

    setIsSubmittingMed(false);

    if (result.error || !result.data) {
      setMedFormError(result.error ?? 'Could not add medication.');
      return;
    }

    setMedications((prev) => [
      ...prev,
      result.data as VetMedicationCatalogItem,
    ]);
    setNewMedName('');
    setNewMedDose('');
    setNewMedPrice('');
    setMessage('Medication added.');
  }

  function startEditingMedication(item: VetMedicationCatalogItem) {
    setEditingMedId(item.id);
    setEditingMedName(item.name);
    setEditingMedDose(item.default_dose ?? '');
    setEditingMedPrice(item.default_price?.toString() ?? '');
    setMedRowError(null);
  }

  async function handleSaveMedication(itemId: string) {
    if (!accessToken || !editingMedName.trim()) {
      setMedRowError('Name is required.');
      return;
    }

    setMedRowError(null);

    const result = await updateMedicationCatalogItem(itemId, accessToken, {
      name: editingMedName.trim(),
      default_dose: editingMedDose.trim() || null,
      default_price: editingMedPrice ? Number(editingMedPrice) : null,
    });

    if (result.error || !result.data) {
      setMedRowError(result.error ?? 'Could not update medication.');
      return;
    }

    setMedications((prev) =>
      prev.map((item) =>
        item.id === itemId ? (result.data as VetMedicationCatalogItem) : item
      )
    );
    setEditingMedId(null);
    setMessage('Medication updated.');
  }

  async function handleDeleteMedication(itemId: string) {
    if (!accessToken) return;

    setMedRowError(null);

    const result = await deleteMedicationCatalogItem(itemId, accessToken);

    if (result.error) {
      setMedRowError(result.error);
      return;
    }

    setMedications((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Medication deleted.');
  }

  async function handleCreateProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !newProcDescription.trim()) {
      setProcFormError('Description is required.');
      return;
    }

    setProcFormError(null);
    setIsSubmittingProc(true);

    const result = await createProcedureCatalogItem(accessToken, {
      procedure_type: newProcType,
      description: newProcDescription.trim(),
      default_price: newProcPrice ? Number(newProcPrice) : undefined,
    });

    setIsSubmittingProc(false);

    if (result.error || !result.data) {
      setProcFormError(result.error ?? 'Could not add procedure.');
      return;
    }

    setProcedures((prev) => [...prev, result.data as VetProcedureCatalogItem]);
    setNewProcDescription('');
    setNewProcPrice('');
    setMessage('Procedure added.');
  }

  function startEditingProcedure(item: VetProcedureCatalogItem) {
    setEditingProcId(item.id);
    setEditingProcType(item.procedure_type);
    setEditingProcDescription(item.description);
    setEditingProcPrice(item.default_price?.toString() ?? '');
    setProcRowError(null);
  }

  async function handleSaveProcedure(itemId: string) {
    if (!accessToken || !editingProcDescription.trim()) {
      setProcRowError('Description is required.');
      return;
    }

    setProcRowError(null);

    const result = await updateProcedureCatalogItem(itemId, accessToken, {
      procedure_type: editingProcType,
      description: editingProcDescription.trim(),
      default_price: editingProcPrice ? Number(editingProcPrice) : null,
    });

    if (result.error || !result.data) {
      setProcRowError(result.error ?? 'Could not update procedure.');
      return;
    }

    setProcedures((prev) =>
      prev.map((item) =>
        item.id === itemId ? (result.data as VetProcedureCatalogItem) : item
      )
    );
    setEditingProcId(null);
    setMessage('Procedure updated.');
  }

  async function handleDeleteProcedure(itemId: string) {
    if (!accessToken) return;

    setProcRowError(null);

    const result = await deleteProcedureCatalogItem(itemId, accessToken);

    if (result.error) {
      setProcRowError(result.error);
      return;
    }

    setProcedures((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Procedure deleted.');
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>My Medication &amp; Procedure Catalog</h1>
        <p className={styles.copy}>
          Save the medications and procedures you use often, then pick them from
          a dropdown on the consultation form instead of retyping them every
          visit. Only you can see and edit your own catalog.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        {isLoading ? (
          <p className={styles.copy}>Loading your catalog...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <section className={styles.panel} aria-labelledby="add-med-title">
              <h2 className={styles.sectionTitle} id="add-med-title">
                Add medication
              </h2>
              <form
                className={styles.form}
                onSubmit={(event) => void handleCreateMedication(event)}
              >
                <label className={styles.field}>
                  <span className={styles.label}>Name</span>
                  <input
                    className={styles.input}
                    value={newMedName}
                    onChange={(event) => setNewMedName(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Default Dose</span>
                  <input
                    className={styles.input}
                    value={newMedDose}
                    onChange={(event) => setNewMedDose(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Default Price (₱)</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={newMedPrice}
                    onChange={(event) => setNewMedPrice(event.target.value)}
                  />
                </label>
                {medFormError ? (
                  <p className={styles.errorBanner} role="alert">
                    {medFormError}
                  </p>
                ) : null}
                <button
                  className={styles.button}
                  type="submit"
                  disabled={isSubmittingMed}
                >
                  {isSubmittingMed ? 'Adding...' : 'Add medication'}
                </button>
              </form>
            </section>

            <section className={styles.group}>
              <h2 className={styles.groupTitle}>Medications</h2>
              {medications.length === 0 ? (
                <p className={styles.copy}>No medications saved yet.</p>
              ) : (
                <ul className={styles.list}>
                  {medications.map((item) => (
                    <li className={styles.listItem} key={item.id}>
                      {editingMedId === item.id ? (
                        <>
                          <input
                            className={styles.input}
                            placeholder="Name"
                            value={editingMedName}
                            onChange={(event) =>
                              setEditingMedName(event.target.value)
                            }
                          />
                          <input
                            className={styles.input}
                            placeholder="Default Dose"
                            value={editingMedDose}
                            onChange={(event) =>
                              setEditingMedDose(event.target.value)
                            }
                          />
                          <input
                            className={styles.input}
                            type="number"
                            placeholder="Default Price (₱)"
                            value={editingMedPrice}
                            onChange={(event) =>
                              setEditingMedPrice(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => void handleSaveMedication(item.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => setEditingMedId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={styles.itemName}>{item.name}</span>
                          <span className={styles.itemMeta}>
                            {item.default_dose ?? '—'}
                          </span>
                          <span className={styles.itemMeta}>
                            {item.default_price != null
                              ? `₱${item.default_price}`
                              : '—'}
                          </span>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => startEditingMedication(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => void handleDeleteMedication(item.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {medRowError ? (
                <p className={styles.errorBanner} role="alert">
                  {medRowError}
                </p>
              ) : null}
            </section>

            <section className={styles.panel} aria-labelledby="add-proc-title">
              <h2 className={styles.sectionTitle} id="add-proc-title">
                Add procedure
              </h2>
              <form
                className={styles.form}
                onSubmit={(event) => void handleCreateProcedure(event)}
              >
                <label className={styles.field}>
                  <span className={styles.label}>Procedure Type</span>
                  <select
                    className={styles.input}
                    value={newProcType}
                    onChange={(event) =>
                      setNewProcType(event.target.value as ProcedureType)
                    }
                  >
                    {PROCEDURE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Description</span>
                  <input
                    className={styles.input}
                    value={newProcDescription}
                    onChange={(event) =>
                      setNewProcDescription(event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Default Price (₱)</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={newProcPrice}
                    onChange={(event) => setNewProcPrice(event.target.value)}
                  />
                </label>
                {procFormError ? (
                  <p className={styles.errorBanner} role="alert">
                    {procFormError}
                  </p>
                ) : null}
                <button
                  className={styles.button}
                  type="submit"
                  disabled={isSubmittingProc}
                >
                  {isSubmittingProc ? 'Adding...' : 'Add procedure'}
                </button>
              </form>
            </section>

            <section className={styles.group}>
              <h2 className={styles.groupTitle}>Procedures</h2>
              {procedures.length === 0 ? (
                <p className={styles.copy}>No procedures saved yet.</p>
              ) : (
                <ul className={styles.list}>
                  {procedures.map((item) => (
                    <li className={styles.listItem} key={item.id}>
                      {editingProcId === item.id ? (
                        <>
                          <select
                            className={styles.input}
                            value={editingProcType}
                            onChange={(event) =>
                              setEditingProcType(
                                event.target.value as ProcedureType
                              )
                            }
                          >
                            {PROCEDURE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          <input
                            className={styles.input}
                            placeholder="Description"
                            value={editingProcDescription}
                            onChange={(event) =>
                              setEditingProcDescription(event.target.value)
                            }
                          />
                          <input
                            className={styles.input}
                            type="number"
                            placeholder="Default Price (₱)"
                            value={editingProcPrice}
                            onChange={(event) =>
                              setEditingProcPrice(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => void handleSaveProcedure(item.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => setEditingProcId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={styles.itemName}>
                            {item.procedure_type}
                          </span>
                          <span className={styles.itemMeta}>
                            {item.description}
                          </span>
                          <span className={styles.itemMeta}>
                            {item.default_price != null
                              ? `₱${item.default_price}`
                              : '—'}
                          </span>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => startEditingProcedure(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.smallButtonSecondary}
                            onClick={() => void handleDeleteProcedure(item.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {procRowError ? (
                <p className={styles.errorBanner} role="alert">
                  {procRowError}
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
