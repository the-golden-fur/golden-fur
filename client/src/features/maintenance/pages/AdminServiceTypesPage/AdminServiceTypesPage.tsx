import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createServiceType,
  listBranches,
  listServiceTypes,
  setServiceTypeBranchAvailability,
  updateServiceType,
} from '../../api/maintenance.api';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BranchAvailabilityModal } from '../../components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import type { BranchSummary, ServiceType } from '../../maintenance.types';
import styles from './AdminServiceTypesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ServiceTypeSortKey = 'name-asc' | 'name-desc';

const SORT_OPTIONS: SortOption<ServiceTypeSortKey>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
];

interface CreateFormState {
  key: string;
  name: string;
  staffPickerEnabled: boolean;
  cagePickerEnabled: boolean;
  branchIds: string[];
}

const EMPTY_CREATE_FORM: CreateFormState = {
  key: '',
  name: '',
  staffPickerEnabled: false,
  cagePickerEnabled: false,
  branchIds: [],
};

interface EditFormState {
  name: string;
  staffPickerEnabled: boolean;
  cagePickerEnabled: boolean;
  branchIds: string[];
}

function availableBranchIds(serviceType: ServiceType): string[] {
  return (serviceType.service_type_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/**
 * Custom change: Service Types admin CRUD. Grooming/Hotel/Daycare/
 * Veterinary are still hardcoded ServiceCategory values everywhere they
 * drive real behavior (availability, capacity, pricing, vet eligibility) -
 * this page only controls each type's customer-facing display name,
 * whether it's offered at all (Active), and whether the Staff Picker/Cage
 * Picker steps are offered for it. A row added here with a brand new `key`
 * shows up as selectable but has no matching category-specific behavior
 * until that's separately built in code.
 */
export function AdminServiceTypesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState('All');

  const [createForm, setCreateForm] =
    useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingServiceType, setEditingServiceType] =
    useState<ServiceType | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    staffPickerEnabled: false,
    cagePickerEnabled: false,
    branchIds: [],
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Custom change (services/packages/service types actions menu): the
  // row-level global Activate/Deactivate action is gone - per-branch
  // availability (a new service_type_branch_availability table, mirroring
  // services) is now the operative control, same precedent as the Services
  // admin page. is_active stays a real column (still what the booking
  // flow's service-type list ultimately reads) but is no longer settable
  // from this page.
  const [availabilityServiceTypeId, setAvailabilityServiceTypeId] = useState<
    string | null
  >(null);

  const [message, setMessage] = useState<string | null>(null);

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

    void Promise.all([listServiceTypes(accessToken), listBranches()]).then(
      ([typesResult, branchesResult]) => {
        if (!isMounted) {
          return;
        }

        setIsLoading(false);

        if (typesResult.error || !typesResult.data) {
          setLoadError(typesResult.error ?? 'Could not load service types.');
          return;
        }

        setServiceTypes(typesResult.data);
        // Branch names are optional garnish - a failed lookup degrades the
        // Branch Availability modal's labels, it doesn't block the page.
        const loadedBranches = branchesResult.data ?? [];
        setBranches(loadedBranches);
        // Seeds the create form's branch multiselect with every branch
        // checked (matching what createServiceType already seeds
        // server-side) - set here, not in a reactive effect keyed off
        // branches, since this only needs to run once on initial load.
        if (loadedBranches.length > 0) {
          setCreateForm((prev) => ({
            ...prev,
            branchIds: loadedBranches.map((branch) => branch.id),
          }));
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const comparators = useMemo(
    () => ({
      'name-asc': (a: ServiceType, b: ServiceType) =>
        a.name.localeCompare(b.name),
      'name-desc': (a: ServiceType, b: ServiceType) =>
        b.name.localeCompare(a.name),
    }),
    []
  );

  const { search, setSearch, sortKey, setSortKey, result } = useSearchAndSort<
    ServiceType,
    ServiceTypeSortKey
  >({
    items: serviceTypes,
    matchesQuery: (serviceType, query) =>
      serviceType.name.toLowerCase().includes(query) ||
      serviceType.key.toLowerCase().includes(query),
    comparators,
    initialSortKey: 'name-asc',
  });

  const filteredServiceTypes = useMemo(() => {
    if (branchFilter === 'All') {
      return result;
    }

    return result.filter((serviceType) =>
      availableBranchIds(serviceType).includes(branchFilter)
    );
  }, [result, branchFilter]);

  const availabilityServiceType = serviceTypes.find(
    (serviceType) => serviceType.id === availabilityServiceTypeId
  );

  const replaceServiceType = (updated: ServiceType) => {
    setServiceTypes((prev) =>
      prev.map((type) => (type.id === updated.id ? updated : type))
    );
  };

  const handleBranchAvailabilityToggle = async (
    serviceType: ServiceType,
    branchId: string,
    isAvailable: boolean
  ) => {
    if (!accessToken) {
      return;
    }

    const result = await setServiceTypeBranchAvailability(
      serviceType.id,
      accessToken,
      { branch_id: branchId, is_available: isAvailable }
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update branch availability.');
      return;
    }

    const rows = serviceType.service_type_branch_availability ?? [];
    const hasRow = rows.some((row) => row.branch_id === branchId);

    replaceServiceType({
      ...serviceType,
      service_type_branch_availability: hasRow
        ? rows.map((row) =>
            row.branch_id === branchId ? { ...row, ...result.data } : row
          )
        : [...rows, result.data],
    });
  };

  /**
   * Applies a branch multiselect's final selection to a just-created/-edited
   * service type by diffing it against the row's current availability and
   * only calling setServiceTypeBranchAvailability for branches whose
   * selection actually changed - avoids calling the single-toggle handler in
   * a loop against a stale closure, which would lose updates when merging
   * the resulting availability array back together.
   */
  async function applyBranchSelection(
    serviceType: ServiceType,
    selectedBranchIds: string[]
  ): Promise<ServiceType> {
    if (!accessToken) {
      return serviceType;
    }

    const rows = serviceType.service_type_branch_availability ?? [];
    const changedBranches = branches.filter((branch) => {
      const current =
        rows.find((row) => row.branch_id === branch.id)?.is_available ?? false;
      const next = selectedBranchIds.includes(branch.id);
      return current !== next;
    });

    if (changedBranches.length === 0) {
      return serviceType;
    }

    const results = await Promise.all(
      changedBranches.map((branch) =>
        setServiceTypeBranchAvailability(serviceType.id, accessToken, {
          branch_id: branch.id,
          is_available: selectedBranchIds.includes(branch.id),
        })
      )
    );

    const updatedRows = [...rows];

    changedBranches.forEach((branch, index) => {
      const data = results[index]?.data;
      if (!data) return;

      const rowIndex = updatedRows.findIndex(
        (row) => row.branch_id === branch.id
      );

      if (rowIndex >= 0) {
        updatedRows[rowIndex] = data;
      } else {
        updatedRows.push(data);
      }
    });

    return { ...serviceType, service_type_branch_availability: updatedRows };
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !createForm.key.trim() || !createForm.name.trim()) {
      setFormError('Key and name are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createServiceType(accessToken, {
      key: createForm.key.trim(),
      name: createForm.name.trim(),
      staff_picker_enabled: createForm.staffPickerEnabled,
      cage_picker_enabled: createForm.cagePickerEnabled,
    });

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not add service type.');
      return;
    }

    const finalServiceType = await applyBranchSelection(
      result.data,
      createForm.branchIds
    );

    setIsSubmitting(false);
    setServiceTypes((prev) => [...prev, finalServiceType]);
    setCreateForm({
      ...EMPTY_CREATE_FORM,
      branchIds: branches.map((branch) => branch.id),
    });
    setMessage('Service type added.');
  }

  function openEditModal(serviceType: ServiceType) {
    setEditingServiceType(serviceType);
    setEditForm({
      name: serviceType.name,
      staffPickerEnabled: serviceType.staff_picker_enabled,
      cagePickerEnabled: serviceType.cage_picker_enabled,
      branchIds: availableBranchIds(serviceType),
    });
    setRowError(null);
  }

  function closeEditModal() {
    setEditingServiceType(null);
    setRowError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !editingServiceType || !editForm.name.trim()) {
      setRowError('Name is required.');
      return;
    }

    setRowError(null);
    setIsSavingEdit(true);

    const result = await updateServiceType(editingServiceType.id, accessToken, {
      name: editForm.name.trim(),
      staff_picker_enabled: editForm.staffPickerEnabled,
      cage_picker_enabled: editForm.cagePickerEnabled,
    });

    if (result.error || !result.data) {
      setIsSavingEdit(false);
      setRowError(result.error ?? 'Could not update service type.');
      return;
    }

    const finalServiceType = await applyBranchSelection(
      result.data,
      editForm.branchIds
    );

    setIsSavingEdit(false);
    replaceServiceType(finalServiceType);
    setEditingServiceType(null);
    setMessage('Service type updated.');
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
        <h1 className={styles.title}>Service Types</h1>
        <p className={styles.copy}>
          The service lines customers choose between at booking time (Grooming,
          Hotel, Daycare, Veterinary). Rename a type's customer-facing label,
          manage which branches offer it, or turn on the Staff Picker/Cage
          Picker step for it. Adding a brand new type only makes it selectable
          here - real booking behavior for it (availability, pricing, etc.)
          still needs to be built separately.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="add-type-title">
          <h2 className={styles.sectionTitle} id="add-type-title">
            Add service type
          </h2>
          <form
            className={styles.form}
            onSubmit={(event) => void handleCreate(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Key</span>
              <input
                className={styles.input}
                value={createForm.key}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    key: event.target.value,
                  }))
                }
                placeholder="e.g. Boarding"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={createForm.staffPickerEnabled}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    staffPickerEnabled: event.target.checked,
                  }))
                }
              />
              <span>Staff picker enabled</span>
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={createForm.cagePickerEnabled}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    cagePickerEnabled: event.target.checked,
                  }))
                }
              />
              <span>Cage picker enabled</span>
            </label>

            <BranchMultiSelect
              label="Available at"
              branches={branches}
              selectedBranchIds={createForm.branchIds}
              onChange={(branchIds) =>
                setCreateForm((prev) => ({ ...prev, branchIds }))
              }
            />

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
              {isSubmitting ? 'Adding...' : 'Add service type'}
            </button>
          </form>
        </section>

        {isLoading ? (
          <p className={styles.copy}>Loading service types...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <SearchSortBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search service types..."
                sortValue={sortKey}
                onSortChange={setSortKey}
                sortOptions={SORT_OPTIONS}
              />
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Branch</span>
                <select
                  className={styles.filterSelect}
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                >
                  <option value="All">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredServiceTypes.length === 0 ? (
              <p className={styles.copy}>
                No service types match the selected filters.
              </p>
            ) : (
              <ul className={styles.list}>
                {filteredServiceTypes.map((serviceType) => (
                  <li className={styles.listItem} key={serviceType.id}>
                    <div className={styles.rowMain}>
                      <span className={styles.typeName}>
                        {serviceType.name}
                      </span>
                      <span className={styles.typeKey}>{serviceType.key}</span>
                      {serviceType.staff_picker_enabled ? (
                        <span className={styles.pickerBadge}>
                          Staff picker enabled
                        </span>
                      ) : null}
                      {serviceType.cage_picker_enabled ? (
                        <span className={styles.pickerBadge}>
                          Cage picker enabled
                        </span>
                      ) : null}
                      <MoreOptionsMenu
                        label={`Actions for ${serviceType.name}`}
                        items={[
                          {
                            label: 'Configure',
                            onSelect: () => openEditModal(serviceType),
                          },
                          {
                            label: 'Branch Availability',
                            onSelect: () =>
                              setAvailabilityServiceTypeId(serviceType.id),
                          },
                        ]}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={editingServiceType !== null}
        title={
          editingServiceType
            ? `Configure ${editingServiceType.name}`
            : 'Configure service type'
        }
        onClose={closeEditModal}
      >
        {editingServiceType ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleEditSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <ToggleSwitch
              label="Staff picker enabled"
              checked={editForm.staffPickerEnabled}
              onChange={(checked) =>
                setEditForm((prev) => ({
                  ...prev,
                  staffPickerEnabled: checked,
                }))
              }
            />

            <ToggleSwitch
              label="Cage picker enabled"
              checked={editForm.cagePickerEnabled}
              onChange={(checked) =>
                setEditForm((prev) => ({
                  ...prev,
                  cagePickerEnabled: checked,
                }))
              }
            />

            <BranchMultiSelect
              label="Available at"
              branches={branches}
              selectedBranchIds={editForm.branchIds}
              onChange={(branchIds) =>
                setEditForm((prev) => ({ ...prev, branchIds }))
              }
            />

            {rowError ? (
              <p className={styles.errorBanner} role="alert">
                {rowError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                className={styles.button}
                type="submit"
                disabled={isSavingEdit}
              >
                {isSavingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className={styles.smallButtonSecondary}
                onClick={closeEditModal}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <BranchAvailabilityModal
        isOpen={availabilityServiceType !== undefined}
        itemName={availabilityServiceType?.name ?? ''}
        rows={branches.map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          isAvailable:
            (
              availabilityServiceType?.service_type_branch_availability ?? []
            ).find((row) => row.branch_id === branch.id)?.is_available ?? false,
        }))}
        onToggle={(branchId, isAvailable) => {
          if (availabilityServiceType) {
            void handleBranchAvailabilityToggle(
              availabilityServiceType,
              branchId,
              isAvailable
            );
          }
        }}
        onClose={() => setAvailabilityServiceTypeId(null)}
      />
    </main>
  );
}
