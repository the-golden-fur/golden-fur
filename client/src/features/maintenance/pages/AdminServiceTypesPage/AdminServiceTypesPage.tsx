import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
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
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { BranchAvailabilityModal } from '../../components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import { StaffRoleMultiSelect } from '../../components/StaffRoleMultiSelect/StaffRoleMultiSelect';
import { IconPicker } from '../../../../shared/components/IconPicker/IconPicker';
import { getServiceIcon } from '../../../../shared/components/IconPicker/serviceIcons';
import { ImageUploader } from '../../../../shared/components/ImageUploader/ImageUploader';
import { uploadServiceImage } from '../../api/maintenance.api';
import type { BranchSummary, ServiceType } from '../../maintenance.types';
import {
  applyServiceTypeFilters,
  buildServiceTypeFilterFields,
  deriveServiceTypeSortKey,
  matchesServiceTypeQuery,
  SERVICE_TYPE_COMPARATORS,
  SERVICE_TYPE_GROUP_BY_AXES,
  SERVICE_TYPE_SORT_FIELDS,
} from './serviceTypeBrowserFields';
import styles from './AdminServiceTypesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

interface CreateFormState {
  name: string;
  staffPickerEnabled: boolean;
  cagePickerEnabled: boolean;
  eligibleStaffRoles: string[];
  branchIds: string[];
  icon: string | null;
  imageUrl: string | null;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  name: '',
  staffPickerEnabled: false,
  cagePickerEnabled: false,
  eligibleStaffRoles: [],
  branchIds: [],
  icon: null,
  imageUrl: null,
};

interface EditFormState {
  name: string;
  staffPickerEnabled: boolean;
  cagePickerEnabled: boolean;
  eligibleStaffRoles: string[];
  branchIds: string[];
  icon: string | null;
  imageUrl: string | null;
}

function availableBranchIds(serviceType: ServiceType): string[] {
  return (serviceType.service_type_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/**
 * Custom change: Service Types admin CRUD. Grooming/Hotel/Daycare/
 * Veterinary are still hardcoded ServiceCategory values everywhere they
 * drive real behavior (availability, capacity, pricing) - this page
 * controls each type's customer-facing display name, whether it's offered
 * at all (Active), whether the Staff Picker/Cage Picker steps are offered
 * for it, and (new) which staff roles the Staff Picker offers when it's on
 * - see resolveServiceTypeStaffConfig in staffPicker.service.ts. `key` is
 * generated server-side, not entered here - it's the internal join to
 * ServiceCategory (cagePicker.service.ts, the booking flow's category
 * tabs), not admin-facing. A row added here shows up as selectable but has
 * no matching category-specific availability/capacity/pricing behavior
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

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(
    SERVICE_TYPE_GROUP_BY_AXES[0].id
  );

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
    eligibleStaffRoles: [],
    branchIds: [],
    icon: null,
    imageUrl: null,
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

  const filterFields = useMemo(
    () => buildServiceTypeFilterFields(branches),
    [branches]
  );

  const filteredServiceTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? serviceTypes.filter((serviceType) =>
          matchesServiceTypeQuery(serviceType, query)
        )
      : serviceTypes;
    const filtered = applyServiceTypeFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      SERVICE_TYPE_COMPARATORS[deriveServiceTypeSortKey(sortTile)]
    );
  }, [serviceTypes, search, filterTiles, sortTile]);

  const activeGroupAxis =
    SERVICE_TYPE_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedServiceTypes = useGroupBy(
    filteredServiceTypes,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((f) => f.id === fieldId);
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

    if (!accessToken || !createForm.name.trim()) {
      setFormError('Name is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createServiceType(accessToken, {
      name: createForm.name.trim(),
      staff_picker_enabled: createForm.staffPickerEnabled,
      cage_picker_enabled: createForm.cagePickerEnabled,
      eligible_staff_roles: createForm.eligibleStaffRoles,
      icon: createForm.icon,
      image_url: createForm.imageUrl,
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
    setIsCreateModalOpen(false);
    setMessage('Service type added.');
  }

  function openCreateModal() {
    setFormError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setFormError(null);
  }

  function openEditModal(serviceType: ServiceType) {
    setEditingServiceType(serviceType);
    setEditForm({
      name: serviceType.name,
      staffPickerEnabled: serviceType.staff_picker_enabled,
      cagePickerEnabled: serviceType.cage_picker_enabled,
      eligibleStaffRoles: serviceType.eligible_staff_roles,
      branchIds: availableBranchIds(serviceType),
      icon: serviceType.icon,
      imageUrl: serviceType.image_url,
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
      eligible_staff_roles: editForm.eligibleStaffRoles,
      icon: editForm.icon,
      image_url: editForm.imageUrl,
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

  function renderServiceTypeActions(serviceType: ServiceType) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${serviceType.name}`}
        items={[
          { label: 'Configure', onSelect: () => openEditModal(serviceType) },
          {
            label: 'Branch Availability',
            onSelect: () => setAvailabilityServiceTypeId(serviceType.id),
          },
        ]}
      />
    );
  }

  function renderServiceTypeBadges(serviceType: ServiceType) {
    return (
      <>
        {serviceType.staff_picker_enabled ? (
          <span className={styles.pickerBadge}>Staff picker enabled</span>
        ) : null}
        {serviceType.cage_picker_enabled ? (
          <span className={styles.pickerBadge}>Cage picker enabled</span>
        ) : null}
      </>
    );
  }

  const columns: DataTableColumn<ServiceType>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (serviceType) => {
        const Icon = getServiceIcon(serviceType.icon);
        return (
          <span className={styles.rowMain}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span className={styles.typeName}>{serviceType.name}</span>
          </span>
        );
      },
    },
    {
      id: 'pickers',
      header: 'Pickers',
      render: (serviceType) => (
        <span className={styles.rowMain}>
          {renderServiceTypeBadges(serviceType)}
        </span>
      ),
    },
  ];

  function renderServiceTypeCard(serviceType: ServiceType) {
    const Icon = getServiceIcon(serviceType.icon);
    return (
      <div className={styles.rowMain}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span className={styles.typeName}>{serviceType.name}</span>
        {renderServiceTypeBadges(serviceType)}
        {renderServiceTypeActions(serviceType)}
      </div>
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

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Service Types</h1>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateModal}
          >
            New service type
          </button>
        </div>
        <p className={styles.copy}>
          The service lines customers choose between at booking time (Grooming,
          Hotel, Daycare, Veterinary). Rename a type's customer-facing label,
          manage which branches offer it, turn on the Staff Picker/Cage Picker
          step for it, and pick which staff roles the Staff Picker offers.
          Adding a brand new type only makes it selectable here - real booking
          behavior for it (availability, pricing, etc.) still needs to be built
          separately.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        {isLoading ? (
          <p className={styles.copy}>Loading service types...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <FilterSortBar
                filterFields={filterFields}
                filterTiles={filterTiles}
                onAddFilter={handleAddFilter}
                onChangeFilter={handleChangeFilter}
                onRemoveFilter={handleRemoveFilter}
                sortFields={SERVICE_TYPE_SORT_FIELDS}
                sortTile={sortTile}
                onChangeSort={setSortTile}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search service types..."
              >
                <div className={styles.rowMain}>
                  <ViewSwitcher
                    options={VIEW_OPTIONS}
                    value={view}
                    onChange={setView}
                    ariaLabel="Service types view"
                  />
                  {view === 'board' ? (
                    <label className={styles.filterField}>
                      <span className={styles.filterLabel}>Group by</span>
                      <select
                        className={styles.filterSelect}
                        value={groupAxisId}
                        onChange={(event) => setGroupAxisId(event.target.value)}
                        aria-label="Group by"
                      >
                        {SERVICE_TYPE_GROUP_BY_AXES.map((axis) => (
                          <option key={axis.id} value={axis.id}>
                            {axis.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </FilterSortBar>
            </div>

            {view === 'table' ? (
              <DataTable
                columns={columns}
                rows={filteredServiceTypes}
                getRowKey={(serviceType) => serviceType.id}
                renderRowActions={renderServiceTypeActions}
                emptyMessage="No service types match the selected filters."
              />
            ) : view === 'list' ? (
              <DataList
                items={filteredServiceTypes}
                getRowKey={(serviceType) => serviceType.id}
                renderItem={renderServiceTypeCard}
                emptyMessage="No service types match the selected filters."
              />
            ) : (
              <DataBoard
                groups={groupedServiceTypes}
                getRowKey={(serviceType) => serviceType.id}
                renderCard={(serviceType) => (
                  <div className={styles.listItem}>
                    {renderServiceTypeCard(serviceType)}
                  </div>
                )}
                emptyColumnMessage="No service types here."
              />
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title="Add service type"
        onClose={closeCreateModal}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
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

          <StaffRoleMultiSelect
            label="Eligible staff roles"
            selectedRoles={createForm.eligibleStaffRoles}
            onChange={(eligibleStaffRoles) =>
              setCreateForm((prev) => ({ ...prev, eligibleStaffRoles }))
            }
          />

          <IconPicker
            label="Icon"
            value={createForm.icon}
            onChange={(icon) => setCreateForm((prev) => ({ ...prev, icon }))}
          />

          <ImageUploader
            currentImageUrl={createForm.imageUrl}
            uploadFn={(file) =>
              accessToken
                ? uploadServiceImage(accessToken, file)
                : Promise.resolve({ data: null, error: 'Not signed in.' })
            }
            onUploaded={(imageUrl) =>
              setCreateForm((prev) => ({ ...prev, imageUrl }))
            }
            onRemove={() =>
              setCreateForm((prev) => ({ ...prev, imageUrl: null }))
            }
            alt="Service type image"
          />

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

          <div className={styles.formActions}>
            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add service type'}
            </button>
            <button
              type="button"
              className={styles.smallButtonSecondary}
              onClick={closeCreateModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

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

            <StaffRoleMultiSelect
              label="Eligible staff roles"
              selectedRoles={editForm.eligibleStaffRoles}
              onChange={(eligibleStaffRoles) =>
                setEditForm((prev) => ({ ...prev, eligibleStaffRoles }))
              }
            />

            <IconPicker
              label="Icon"
              value={editForm.icon}
              onChange={(icon) => setEditForm((prev) => ({ ...prev, icon }))}
            />

            <ImageUploader
              currentImageUrl={editForm.imageUrl}
              uploadFn={(file) =>
                accessToken
                  ? uploadServiceImage(accessToken, file)
                  : Promise.resolve({ data: null, error: 'Not signed in.' })
              }
              onUploaded={(imageUrl) =>
                setEditForm((prev) => ({ ...prev, imageUrl }))
              }
              onRemove={() =>
                setEditForm((prev) => ({ ...prev, imageUrl: null }))
              }
              alt="Service type image"
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
