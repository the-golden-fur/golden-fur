import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
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

type CatalogTab = 'medications' | 'procedures';

type MedicationSortKey = 'name-asc' | 'name-desc';
const MEDICATION_SORT_OPTIONS: SortOption<MedicationSortKey>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
];

type ProcedureSortKey = 'description-asc' | 'description-desc';
const PROCEDURE_SORT_OPTIONS: SortOption<ProcedureSortKey>[] = [
  { value: 'description-asc', label: 'Description (A-Z)' },
  { value: 'description-desc', label: 'Description (Z-A)' },
];

type ProcedureTypeFilter = ProcedureType | 'All';

interface MedicationFormState {
  name: string;
  dose: string;
  price: string;
}

const EMPTY_MEDICATION_FORM: MedicationFormState = {
  name: '',
  dose: '',
  price: '',
};

interface ProcedureFormState {
  procedureType: ProcedureType;
  description: string;
  price: string;
}

const EMPTY_PROCEDURE_FORM: ProcedureFormState = {
  procedureType: PROCEDURE_TYPES[0],
  description: '',
  price: '',
};

export function VetCatalogPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [activeTab, setActiveTab] = useState<CatalogTab>('medications');

  const [medications, setMedications] = useState<VetMedicationCatalogItem[]>(
    []
  );
  const [procedures, setProcedures] = useState<VetProcedureCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [procedureTypeFilter, setProcedureTypeFilter] =
    useState<ProcedureTypeFilter>('All');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<CatalogTab | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [medicationForm, setMedicationForm] = useState<MedicationFormState>(
    EMPTY_MEDICATION_FORM
  );
  const [procedureForm, setProcedureForm] =
    useState<ProcedureFormState>(EMPTY_PROCEDURE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const {
    search: medicationSearch,
    setSearch: setMedicationSearch,
    sortKey: medicationSortKey,
    setSortKey: setMedicationSortKey,
    result: visibleMedications,
  } = useSearchAndSort<VetMedicationCatalogItem, MedicationSortKey>({
    items: medications,
    matchesQuery: (item, query) =>
      item.name.toLowerCase().includes(query) ||
      (item.default_dose ?? '').toLowerCase().includes(query),
    comparators: {
      'name-asc': (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
    },
    initialSortKey: 'name-asc',
  });

  const {
    search: procedureSearch,
    setSearch: setProcedureSearch,
    sortKey: procedureSortKey,
    setSortKey: setProcedureSortKey,
    result: searchedProcedures,
  } = useSearchAndSort<VetProcedureCatalogItem, ProcedureSortKey>({
    items: procedures,
    matchesQuery: (item, query) =>
      item.description.toLowerCase().includes(query) ||
      item.procedure_type.toLowerCase().includes(query),
    comparators: {
      'description-asc': (a, b) => a.description.localeCompare(b.description),
      'description-desc': (a, b) => b.description.localeCompare(a.description),
    },
    initialSortKey: 'description-asc',
  });

  const visibleProcedures = useMemo(() => {
    if (procedureTypeFilter === 'All') return searchedProcedures;
    return searchedProcedures.filter(
      (item) => item.procedure_type === procedureTypeFilter
    );
  }, [searchedProcedures, procedureTypeFilter]);

  function openCreateMedication() {
    setFormKind('medications');
    setEditingId(null);
    setMedicationForm(EMPTY_MEDICATION_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditMedication(item: VetMedicationCatalogItem) {
    setFormKind('medications');
    setEditingId(item.id);
    setMedicationForm({
      name: item.name,
      dose: item.default_dose ?? '',
      price: item.default_price?.toString() ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function openCreateProcedure() {
    setFormKind('procedures');
    setEditingId(null);
    setProcedureForm(EMPTY_PROCEDURE_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditProcedure(item: VetProcedureCatalogItem) {
    setFormKind('procedures');
    setEditingId(item.id);
    setProcedureForm({
      procedureType: item.procedure_type,
      description: item.description,
      price: item.default_price?.toString() ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormKind(null);
    setEditingId(null);
    setFormError(null);
  }

  async function handleDeleteMedication(itemId: string) {
    if (!accessToken) return;

    const result = await deleteMedicationCatalogItem(itemId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setMedications((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Medication deleted.');
  }

  async function handleDeleteProcedure(itemId: string) {
    if (!accessToken) return;

    const result = await deleteProcedureCatalogItem(itemId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setProcedures((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Procedure deleted.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) return;

    if (formKind === 'medications') {
      if (!medicationForm.name.trim()) {
        setFormError('Name is required.');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      const result =
        editingId === null
          ? await createMedicationCatalogItem(accessToken, {
              name: medicationForm.name.trim(),
              default_dose: medicationForm.dose.trim() || undefined,
              default_price: medicationForm.price
                ? Number(medicationForm.price)
                : undefined,
            })
          : await updateMedicationCatalogItem(editingId, accessToken, {
              name: medicationForm.name.trim(),
              default_dose: medicationForm.dose.trim() || null,
              default_price: medicationForm.price
                ? Number(medicationForm.price)
                : null,
            });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not save medication.');
        return;
      }

      const saved = result.data;
      setMedications((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((item) => (item.id === editingId ? saved : item))
      );
      setMessage(
        editingId === null ? 'Medication added.' : 'Medication updated.'
      );
      closeForm();
      return;
    }

    if (formKind === 'procedures') {
      if (!procedureForm.description.trim()) {
        setFormError('Description is required.');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      const result =
        editingId === null
          ? await createProcedureCatalogItem(accessToken, {
              procedure_type: procedureForm.procedureType,
              description: procedureForm.description.trim(),
              default_price: procedureForm.price
                ? Number(procedureForm.price)
                : undefined,
            })
          : await updateProcedureCatalogItem(editingId, accessToken, {
              procedure_type: procedureForm.procedureType,
              description: procedureForm.description.trim(),
              default_price: procedureForm.price
                ? Number(procedureForm.price)
                : null,
            });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not save procedure.');
        return;
      }

      const saved = result.data;
      setProcedures((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((item) => (item.id === editingId ? saved : item))
      );
      setMessage(
        editingId === null ? 'Procedure added.' : 'Procedure updated.'
      );
      closeForm();
    }
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load your catalog.
          </p>
        </div>
      </main>
    );
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

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'medications'}
            className={
              activeTab === 'medications' ? styles.tabActive : styles.tab
            }
            onClick={() => setActiveTab('medications')}
          >
            Medications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'procedures'}
            className={
              activeTab === 'procedures' ? styles.tabActive : styles.tab
            }
            onClick={() => setActiveTab('procedures')}
          >
            Procedures
          </button>
        </div>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading your catalog...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : activeTab === 'medications' ? (
          <>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                <SearchSortBar
                  searchValue={medicationSearch}
                  onSearchChange={setMedicationSearch}
                  searchPlaceholder="Search medications..."
                  sortValue={medicationSortKey}
                  onSortChange={setMedicationSortKey}
                  sortOptions={MEDICATION_SORT_OPTIONS}
                />
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateMedication}
              >
                Add medication
              </button>
            </div>

            {visibleMedications.length === 0 ? (
              <p className={styles.copy}>No medications match these filters.</p>
            ) : (
              <ul className={styles.itemList}>
                {visibleMedications.map((item) => (
                  <li key={item.id} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <span className={styles.itemName}>{item.name}</span>
                      {item.default_dose ? (
                        <span className={styles.badge}>
                          {item.default_dose}
                        </span>
                      ) : null}
                      {item.default_price != null ? (
                        <span className={styles.badge}>
                          ₱{item.default_price}
                        </span>
                      ) : null}
                    </div>
                    <MoreOptionsMenu
                      label={`Actions for ${item.name}`}
                      items={[
                        {
                          label: 'Edit',
                          onSelect: () => openEditMedication(item),
                        },
                        {
                          label: 'Delete',
                          onSelect: () => void handleDeleteMedication(item.id),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                <SearchSortBar
                  searchValue={procedureSearch}
                  onSearchChange={setProcedureSearch}
                  searchPlaceholder="Search procedures..."
                  sortValue={procedureSortKey}
                  onSortChange={setProcedureSortKey}
                  sortOptions={PROCEDURE_SORT_OPTIONS}
                />
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>Type</span>
                  <select
                    className={styles.filterSelect}
                    value={procedureTypeFilter}
                    onChange={(event) =>
                      setProcedureTypeFilter(
                        event.target.value as ProcedureTypeFilter
                      )
                    }
                  >
                    <option value="All">All types</option>
                    {PROCEDURE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateProcedure}
              >
                Add procedure
              </button>
            </div>

            {visibleProcedures.length === 0 ? (
              <p className={styles.copy}>No procedures match these filters.</p>
            ) : (
              <ul className={styles.itemList}>
                {visibleProcedures.map((item) => (
                  <li key={item.id} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <span className={styles.itemName}>
                        {item.procedure_type}
                      </span>
                      <span className={styles.itemDescription}>
                        {item.description}
                      </span>
                      {item.default_price != null ? (
                        <span className={styles.badge}>
                          ₱{item.default_price}
                        </span>
                      ) : null}
                    </div>
                    <MoreOptionsMenu
                      label={`Actions for ${item.description}`}
                      items={[
                        {
                          label: 'Edit',
                          onSelect: () => openEditProcedure(item),
                        },
                        {
                          label: 'Delete',
                          onSelect: () => void handleDeleteProcedure(item.id),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isFormOpen}
        title={
          formKind === 'medications'
            ? editingId === null
              ? 'Add medication'
              : 'Edit medication'
            : editingId === null
              ? 'Add procedure'
              : 'Edit procedure'
        }
        onClose={closeForm}
        closeOnBackdropClick={false}
      >
        {isFormOpen && formKind === 'medications' ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={medicationForm.name}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Default Dose</span>
              <input
                className={styles.input}
                value={medicationForm.dose}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    dose: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Default Price (₱)</span>
              <input
                className={styles.input}
                type="number"
                value={medicationForm.price}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    price: event.target.value,
                  }))
                }
              />
            </label>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save medication'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {isFormOpen && formKind === 'procedures' ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Procedure Type</span>
              <select
                className={styles.input}
                value={procedureForm.procedureType}
                onChange={(event) =>
                  setProcedureForm((prev) => ({
                    ...prev,
                    procedureType: event.target.value as ProcedureType,
                  }))
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
              <span className={styles.fieldLabel}>Description</span>
              <input
                className={styles.input}
                value={procedureForm.description}
                onChange={(event) =>
                  setProcedureForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Default Price (₱)</span>
              <input
                className={styles.input}
                type="number"
                value={procedureForm.price}
                onChange={(event) =>
                  setProcedureForm((prev) => ({
                    ...prev,
                    price: event.target.value,
                  }))
                }
              />
            </label>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save procedure'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </main>
  );
}
