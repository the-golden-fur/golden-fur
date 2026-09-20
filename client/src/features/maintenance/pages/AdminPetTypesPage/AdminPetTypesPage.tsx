import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Navigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
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
import { useUnsavedChanges } from '../../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
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
import { PetTypePriceOverrideModal } from '../../components/PetTypePriceOverrideModal/PetTypePriceOverrideModal';
import type {
  BranchSummary,
  PetTypePriceOverride,
  PetTypeRow,
} from '../../maintenance.types';
import {
  applyPetTypeFilters,
  deriveSortKey,
  matchesPetTypeQuery,
  PET_TYPE_COMPARATORS,
  PET_TYPE_FILTER_FIELDS,
  PET_TYPE_GROUP_BY_AXES,
  PET_TYPE_SORT_FIELDS,
} from './petTypeBrowserFields';
import styles from './AdminPetTypesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/**
 * Architectural-Change-History: "Add admin config to pet types... set X
 * fixed price to pet types, this will override service and package
 * prices... cat type... fixed price at 800." pet_type used to be a hardcoded
 * 2-value enum (Dog/Cat) - it's now the pet_types admin-CRUD table
 * (20260912191), and a brand-new row here won't have any special pricing
 * behavior until an admin also sets a fixed-price override for it via the
 * row's Configure action - the plain weight/coat matrix pricing applies
 * otherwise, same fallback Dog already uses today.
 *
 * Custom change: "Add pet type" is now a modal (opened by the title-row
 * button) instead of an always-visible section, matching Services/Service
 * Types/Packages. `key` is no longer typed in or shown here - generated
 * server-side (same treatment as Service Types, see petTypes.service.ts) -
 * it's still used internally as the join Cages/Breeds/price-overrides read,
 * just not an admin-facing concept any more. The old always-visible "Fixed
 * price overrides" section (pick one branch, set every pet type's price) is
 * replaced by a per-row "Configure" action that opens
 * PetTypePriceOverrideModal scoped to one pet type at a time.
 */
export function AdminPetTypesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [petTypes, setPetTypes] = useState<PetTypeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [overrides, setOverrides] = useState<PetTypePriceOverride[]>([]);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceModalPetType, setPriceModalPetType] = useState<PetTypeRow | null>(
    null
  );

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(PET_TYPE_GROUP_BY_AXES[0].id);

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

    // Every branch's overrides are loaded up front (not just one selected
    // branch) since Configure now shows every branch's price for one pet
    // type at a time, instead of one branch's price for every pet type.
    void listPetTypePriceOverrides(accessToken).then((result) => {
      if (isMounted && result.data) setOverrides(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  function openCreateModal() {
    setNewName('');
    setFormError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setFormError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !newName.trim()) {
      setFormError('Name is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createPetType(accessToken, {
      name: newName.trim(),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add pet type.');
      return;
    }

    setPetTypes((prev) => [...prev, result.data as PetTypeRow]);
    setMessage('Pet type added.');
    closeCreateModal();
  }

  function startEditing(petType: PetTypeRow) {
    setEditingId(petType.id);
    setEditingName(petType.name);
    setRowError(null);
  }

  async function handleRename(petTypeId: string) {
    if (!accessToken || !editingName.trim()) {
      const message = 'Name is required.';
      setRowError(message);
      throw new Error(message);
    }

    setRowError(null);

    const result = await updatePetType(petTypeId, accessToken, {
      name: editingName.trim(),
    });

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not rename pet type.';
      setRowError(message);
      throw new Error(message);
    }

    setPetTypes((prev) =>
      prev.map((petType) =>
        petType.id === petTypeId ? (result.data as PetTypeRow) : petType
      )
    );
    setEditingId(null);
    setMessage('Pet type renamed.');
  }

  const editingPetType = petTypes.find((p) => p.id === editingId) ?? null;

  const handleDiscardEdit = useCallback(() => {
    setEditingId(null);
    setRowError(null);
  }, []);

  // handleRename is a plain function (redefined every render), so this
  // wrapper must list every piece of state it reads as its own deps -
  // otherwise an unmemoized onSave identity re-triggers useUnsavedChanges'
  // registration effect on every render, changing the provider's context
  // value, re-rendering this component, creating another fresh onSave... an
  // infinite loop with no user action needed to sustain it.
  const handleUnsavedSave = useCallback(
    () => (editingId !== null ? handleRename(editingId) : Promise.resolve()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, accessToken, editingName]
  );

  // Pet Types only ever has one row mid-edit at a time (editingId), so this
  // is the "per-in-progress-edit" shape of the pattern - a stable id with
  // entering edit mode itself as the dirty signal, no deeper per-field
  // diffing.
  useUnsavedChanges({
    id: 'pet-type-edit',
    label: editingPetType ? `Pet type: ${editingPetType.name}` : 'Pet type',
    isDirty: editingId !== null,
    onSave: handleUnsavedSave,
    onDiscard: handleDiscardEdit,
  });

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

  async function handleSaveOverride(
    branchId: string | null,
    fixedPrice: number
  ) {
    if (!accessToken || !priceModalPetType) return;

    setPriceError(null);

    const result = await upsertPetTypePriceOverride(accessToken, {
      pet_type: priceModalPetType.key,
      branch_id: branchId,
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
            row.pet_type === priceModalPetType.key && row.branch_id === branchId
          )
      ),
      savedOverride,
    ]);
    setMessage('Fixed price saved.');
  }

  async function handleClearOverride(branchId: string | null) {
    if (!accessToken || !priceModalPetType) return;

    const ownScopeRow = overrides.find(
      (row) =>
        row.pet_type === priceModalPetType.key && row.branch_id === branchId
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
    setMessage('Fixed price cleared.');
  }

  const visiblePetTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? petTypes.filter((petType) => matchesPetTypeQuery(petType, query))
      : petTypes;
    const filtered = applyPetTypeFilters(searched, filterTiles);

    // No sort tile means "keep fetch order" rather than imposing a default.
    if (!sortTile) return filtered;
    return [...filtered].sort(PET_TYPE_COMPARATORS[deriveSortKey(sortTile)]);
  }, [petTypes, search, filterTiles, sortTile]);

  const activeGroupAxis =
    PET_TYPE_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedPetTypes = useGroupBy(
    visiblePetTypes,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = PET_TYPE_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  function renderPetTypeActions(petType: PetTypeRow) {
    if (editingId === petType.id) {
      return (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() =>
              void handleRename(petType.id).catch(() => {
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
        </div>
      );
    }

    return (
      <div className={styles.actions}>
        <MoreOptionsMenu
          label={`Actions for ${petType.name}`}
          items={[
            { label: 'Rename', onSelect: () => startEditing(petType) },
            {
              label: 'Configure',
              onSelect: () => setPriceModalPetType(petType),
            },
            {
              label: petType.is_active ? 'Deactivate' : 'Activate',
              onSelect: () => void handleToggleActive(petType),
            },
            { label: 'Delete', onSelect: () => void handleDelete(petType.id) },
          ]}
        />
      </div>
    );
  }

  const columns = useMemo<DataTableColumn<PetTypeRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        render: (petType) =>
          editingId === petType.id ? (
            <input
              className={styles.input}
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
            />
          ) : (
            <span
              className={
                petType.is_active
                  ? styles.itemName
                  : `${styles.itemName} ${styles.itemInactive}`
              }
            >
              {petType.name}
            </span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        render: (petType) => (
          <span
            className={`${styles.statusBadge} ${
              petType.is_active ? styles.statusActive : styles.statusInactive
            }`}
          >
            {petType.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
    ],
    [editingId, editingName]
  );

  function renderPetTypeCard(petType: PetTypeRow) {
    if (editingId === petType.id) {
      return (
        <div className={styles.rowMain}>
          <input
            className={styles.input}
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
          />
          {renderPetTypeActions(petType)}
        </div>
      );
    }

    return (
      <div className={styles.rowMain}>
        <span
          className={
            petType.is_active
              ? styles.itemName
              : `${styles.itemName} ${styles.itemInactive}`
          }
        >
          {petType.name}
        </span>
        <span
          className={`${styles.statusBadge} ${
            petType.is_active ? styles.statusActive : styles.statusInactive
          }`}
        >
          {petType.is_active ? 'Active' : 'Inactive'}
        </span>
        {renderPetTypeActions(petType)}
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
          <h1 className={styles.title}>Pet Types</h1>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateModal}
          >
            Add pet type
          </button>
        </div>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

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
            <>
              <FilterSortBar
                filterFields={PET_TYPE_FILTER_FIELDS}
                filterTiles={filterTiles}
                onAddFilter={handleAddFilter}
                onChangeFilter={handleChangeFilter}
                onRemoveFilter={handleRemoveFilter}
                sortFields={PET_TYPE_SORT_FIELDS}
                sortTile={sortTile}
                onChangeSort={setSortTile}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search pet types..."
              >
                <div className={styles.viewControls}>
                  <ViewSwitcher
                    options={VIEW_OPTIONS}
                    value={view}
                    onChange={setView}
                    ariaLabel="Pet types view"
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
                        {PET_TYPE_GROUP_BY_AXES.map((axis) => (
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
                  rows={visiblePetTypes}
                  getRowKey={(petType) => petType.id}
                  renderRowActions={renderPetTypeActions}
                  emptyMessage="No pet types match this filter."
                />
              ) : view === 'list' ? (
                <DataList
                  items={visiblePetTypes}
                  getRowKey={(petType) => petType.id}
                  renderItem={renderPetTypeCard}
                  emptyMessage="No pet types match this filter."
                />
              ) : (
                <DataBoard
                  groups={groupedPetTypes}
                  getRowKey={(petType) => petType.id}
                  renderCard={(petType) => (
                    <div className={styles.listItem}>
                      {renderPetTypeCard(petType)}
                    </div>
                  )}
                  emptyColumnMessage="No pet types."
                />
              )}
            </>
          )}
          {rowError ? (
            <p className={styles.errorBanner} role="alert">
              {rowError}
            </p>
          ) : null}
        </section>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title="Add pet type"
        onClose={closeCreateModal}
      >
        <p className={styles.copy}>
          A new pet type won&apos;t have a fixed price or any other special
          pricing behavior until you set one via its Configure action - it
          prices like any other pet (weight/coat matrix if a service opts in,
          otherwise the service&apos;s own price) in the meantime.
        </p>
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
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
      </Modal>

      <PetTypePriceOverrideModal
        key={priceModalPetType?.id ?? 'none'}
        isOpen={priceModalPetType !== null}
        petTypeName={priceModalPetType?.name ?? ''}
        branches={branches}
        overrides={overrides.filter(
          (row) => row.pet_type === priceModalPetType?.key
        )}
        onSave={(branchId, fixedPrice) =>
          void handleSaveOverride(branchId, fixedPrice)
        }
        onClear={(branchId) => void handleClearOverride(branchId)}
        onClose={() => {
          setPriceModalPetType(null);
          setPriceError(null);
        }}
        error={priceError}
      />
    </main>
  );
}
