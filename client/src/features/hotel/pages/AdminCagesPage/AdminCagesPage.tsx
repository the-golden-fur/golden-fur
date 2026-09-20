import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listPetTypes } from '../../../maintenance/api/maintenance.api';
import type { PetTypeRow } from '../../../maintenance/maintenance.types';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createCage,
  deleteCage,
  getCageGrid,
  setCageMaintenanceStatus,
  updateCage,
} from '../../api/hotel.api';
import type { Cage, CageSize, CageStatus } from '../../hotel.types';
import {
  applyCageFilters,
  buildCageFilterFields,
  CAGE_COMPARATORS,
  CAGE_GROUP_BY_AXES,
  CAGE_SIZE_LABELS,
  CAGE_SIZES,
  CAGE_SORT_FIELDS,
  deriveCageSortKey,
  matchesCageQuery,
} from './cageBrowserFields';
import styles from './AdminCagesPage.module.css';

/** Matches HOTEL_ADMIN_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

interface CreateFormState {
  cageLabel: string;
  size: CageSize;
  /** Custom change (cage pet-type support): must be non-empty on submit. */
  petTypes: string[];
}

const EMPTY_CREATE_FORM: CreateFormState = {
  cageLabel: '',
  size: 'S',
  petTypes: [],
};

function togglePetType(current: string[], key: string): string[] {
  return current.includes(key)
    ? current.filter((existing) => existing !== key)
    : [...current, key];
}

function statusBadgeClass(status: CageStatus): string {
  if (status === 'Available') return styles.statusAvailable;
  if (status === 'Under Maintenance') return styles.statusMaintenance;
  return styles.statusOccupied;
}

/**
 * Custom change: Cage CRUD (Settings > Config). Admin/Superadmin can add,
 * rename/resize, and delete specific cages - not just toggle Under
 * Maintenance (still available here too, folded into the same row rather
 * than living only on the operational CageStatusGrid at Hotel Queue).
 * Scoped to the viewer's own branch, same limitation the existing cage
 * grid/status endpoints already have for every role including Superadmin
 * (requireBranch always resolves the caller's own assigned branch - there
 * is no cross-branch override for this feature today).
 *
 * Notion-style remaster (session 110): search/filter/sort are FilterSortBar
 * pills, and the list can switch between Table, List, and Board (grouped by
 * Status or Size) via ViewSwitcher - this is the first page in the rollout
 * to prove all three shared view components together. Every filter tile
 * here is client-side only (see cageBrowserFields.ts) - there's no server
 * query layer change in this rollout.
 */
export function AdminCagesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [cages, setCages] = useState<Cage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingSize, setEditingSize] = useState<CageSize>('S');
  const [editingPetTypes, setEditingPetTypes] = useState<string[]>([]);
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [petTypeOptions, setPetTypeOptions] = useState<PetTypeRow[]>([]);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(CAGE_GROUP_BY_AXES[0].id);

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

    let isMounted = true;

    void listPetTypes(accessToken).then((result) => {
      if (!isMounted || !result.data) return;
      setPetTypeOptions(result.data.filter((petType) => petType.is_active));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

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

  function openCreateModal() {
    setCreateForm(EMPTY_CREATE_FORM);
    setFormError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setFormError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !createForm.cageLabel.trim()) {
      setFormError('Cage label is required.');
      return;
    }

    if (createForm.petTypes.length === 0) {
      setFormError('Select at least one pet type.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createCage(
      createForm.cageLabel.trim(),
      createForm.size,
      createForm.petTypes,
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add cage.');
      return;
    }

    setCages((prev) => [...prev, result.data as Cage]);
    setMessage('Cage added.');
    closeCreateModal();
  }

  function startEditing(cage: Cage) {
    setEditingId(cage.id);
    setEditingLabel(cage.cage_label);
    setEditingSize(cage.size);
    setEditingPetTypes(cage.pet_types);
    setRowError(null);
  }

  async function handleSaveEdit(cageId: string) {
    if (!accessToken || !editingLabel.trim()) {
      setRowError('Cage label is required.');
      return;
    }

    if (editingPetTypes.length === 0) {
      setRowError('Select at least one pet type.');
      return;
    }

    setRowError(null);

    const result = await updateCage(
      cageId,
      {
        cage_label: editingLabel.trim(),
        size: editingSize,
        pet_types: editingPetTypes,
      },
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

  const filterFields = useMemo(
    () => buildCageFilterFields(petTypeOptions),
    [petTypeOptions]
  );

  const visibleCages = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? cages.filter((cage) => matchesCageQuery(cage, query))
      : cages;
    const filtered = applyCageFilters(searched, filterTiles);

    // No sort tile means "keep the order cages arrived in" (grouped by
    // size, per loadCages) rather than silently imposing a default sort.
    if (!sortTile) return filtered;
    return [...filtered].sort(CAGE_COMPARATORS[deriveCageSortKey(sortTile)]);
  }, [cages, search, filterTiles, sortTile]);

  const activeGroupAxis =
    CAGE_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedCages = useGroupBy(
    visibleCages,
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

  // Custom change: consolidate the row actions behind a single "..." menu
  // (same treatment as Services/Pet Types/etc.) instead of a row of
  // always-visible buttons. Delete is left out entirely rather than shown
  // disabled - MoreOptionsMenu items have no disabled state, and omitting
  // an inapplicable action is the same convention every other "..." menu in
  // this app already uses.
  function cageActionItems(cage: Cage): MoreOptionsMenuItem[] {
    const items: MoreOptionsMenuItem[] = [
      { label: 'Edit', onSelect: () => startEditing(cage) },
    ];

    if (cage.status === 'Available' || cage.status === 'Under Maintenance') {
      items.push({
        label:
          cage.status === 'Under Maintenance'
            ? 'Mark Available'
            : 'Mark Under Maintenance',
        onSelect: () => void handleToggleMaintenance(cage),
      });
    }

    if (cage.status !== 'Occupied' && cage.status !== 'Reserved') {
      items.push({ label: 'Delete', onSelect: () => void handleDelete(cage) });
    }

    return items;
  }

  // Table/List: a persistent "..." trigger, same as every other migrated
  // page. Board reuses the same item list through CardContextMenu instead
  // (see renderCageBoardCard below) - a kebab button on every card in a
  // dense board grid is visual noise there, same precedent as Staff/
  // Customer Management (session 111).
  function renderCageActions(cage: Cage) {
    if (editingId === cage.id) {
      return (
        <div className={styles.actions}>
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
        </div>
      );
    }

    return (
      <div className={styles.actions}>
        <MoreOptionsMenu
          label={`Actions for ${cage.cage_label}`}
          items={cageActionItems(cage)}
        />
      </div>
    );
  }

  const columns = useMemo<DataTableColumn<Cage>[]>(
    () => [
      {
        id: 'label',
        header: 'Cage',
        render: (cage) =>
          editingId === cage.id ? (
            <input
              className={styles.input}
              value={editingLabel}
              onChange={(event) => setEditingLabel(event.target.value)}
            />
          ) : (
            <span className={styles.cageLabel}>{cage.cage_label}</span>
          ),
      },
      {
        id: 'size',
        header: 'Size',
        render: (cage) =>
          editingId === cage.id ? (
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
          ) : (
            <span className={styles.cageSize}>
              {CAGE_SIZE_LABELS[cage.size]}
            </span>
          ),
      },
      {
        id: 'petTypes',
        header: 'Pet types',
        render: (cage) =>
          editingId === cage.id ? (
            <div className={styles.petTypeCheckboxes}>
              {petTypeOptions.map((petType) => (
                <label key={petType.id} className={styles.petTypeCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={editingPetTypes.includes(petType.key)}
                    onChange={() =>
                      setEditingPetTypes((prev) =>
                        togglePetType(prev, petType.key)
                      )
                    }
                  />
                  {petType.name}
                </label>
              ))}
            </div>
          ) : (
            <span className={styles.petTypesBadge}>
              {cage.pet_types.join(', ')}
            </span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        render: (cage) => (
          <span
            className={`${styles.statusBadge} ${statusBadgeClass(cage.status)}`}
          >
            {cage.status}
          </span>
        ),
      },
    ],
    [editingId, editingLabel, editingSize, editingPetTypes, petTypeOptions]
  );

  function renderCageCardBody(cage: Cage) {
    return (
      <>
        <span className={styles.cageLabel}>{cage.cage_label}</span>
        <span className={styles.cageSize}>{CAGE_SIZE_LABELS[cage.size]}</span>
        <span className={styles.petTypesBadge}>
          {cage.pet_types.join(', ')}
        </span>
        <span
          className={`${styles.statusBadge} ${statusBadgeClass(cage.status)}`}
        >
          {cage.status}
        </span>
      </>
    );
  }

  function renderCageCard(cage: Cage) {
    if (editingId === cage.id) {
      return (
        <div className={styles.rowMain}>
          <input
            className={styles.input}
            value={editingLabel}
            onChange={(event) => setEditingLabel(event.target.value)}
          />
          <select
            className={styles.input}
            value={editingSize}
            onChange={(event) => setEditingSize(event.target.value as CageSize)}
          >
            {CAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <div className={styles.petTypeCheckboxes}>
            {petTypeOptions.map((petType) => (
              <label key={petType.id} className={styles.petTypeCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={editingPetTypes.includes(petType.key)}
                  onChange={() =>
                    setEditingPetTypes((prev) =>
                      togglePetType(prev, petType.key)
                    )
                  }
                />
                {petType.name}
              </label>
            ))}
          </div>
          {renderCageActions(cage)}
        </div>
      );
    }

    return (
      <div className={styles.rowMain}>
        {renderCageCardBody(cage)}
        {renderCageActions(cage)}
      </div>
    );
  }

  // Board: the "..." trigger is hidden entirely in favor of a right-click
  // (desktop) / long-press (mobile) menu via CardContextMenu - same
  // precedent as Staff/Customer Management (session 111). Editing state is
  // unaffected - it still shows the same inline edit form regardless of
  // view, since editing needs its inputs visible either way.
  function renderCageBoardCard(cage: Cage) {
    if (editingId === cage.id) {
      return renderCageCard(cage);
    }

    return (
      <CardContextMenu
        items={cageActionItems(cage)}
        label={`Actions for ${cage.cage_label}`}
      >
        <div className={styles.rowMain}>{renderCageCardBody(cage)}</div>
      </CardContextMenu>
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
          <h1 className={styles.title}>Cages</h1>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateModal}
          >
            Add cage
          </button>
        </div>
        <p className={styles.copy}>
          Add, rename/resize, or delete a cage at your branch. A cage that is
          currently Occupied or Reserved cannot be deleted.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        {isLoading ? (
          <p className={styles.copy}>Loading cages...</p>
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
              sortFields={CAGE_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search cages..."
            >
              <div className={styles.viewControls}>
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel="Cages view"
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
                      {CAGE_GROUP_BY_AXES.map((axis) => (
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
                rows={visibleCages}
                getRowKey={(cage) => cage.id}
                renderRowActions={renderCageActions}
                emptyMessage="No cages at this branch yet."
              />
            ) : view === 'list' ? (
              <DataList
                items={visibleCages}
                getRowKey={(cage) => cage.id}
                renderItem={renderCageCard}
                emptyMessage="No cages at this branch yet."
              />
            ) : (
              <DataBoard
                groups={groupedCages}
                getRowKey={(cage) => cage.id}
                renderCard={(cage) => (
                  <div className={styles.listItem}>
                    {renderCageBoardCard(cage)}
                  </div>
                )}
                emptyColumnMessage="No cages."
              />
            )}
          </>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title="Add cage"
        onClose={closeCreateModal}
      >
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

          <div className={styles.field}>
            <span className={styles.label}>Pet types</span>
            <div className={styles.petTypeCheckboxes}>
              {petTypeOptions.map((petType) => (
                <label key={petType.id} className={styles.petTypeCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={createForm.petTypes.includes(petType.key)}
                    onChange={() =>
                      setCreateForm((prev) => ({
                        ...prev,
                        petTypes: togglePetType(prev.petTypes, petType.key),
                      }))
                    }
                  />
                  {petType.name}
                </label>
              ))}
            </div>
          </div>

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
      </Modal>
    </main>
  );
}
