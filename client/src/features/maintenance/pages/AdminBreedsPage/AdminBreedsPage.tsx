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
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { CardRowWithMenu } from '../../../../shared/components/MoreOptionsMenu/CardRowWithMenu';
import { RenameModal } from '../../../../shared/components/RenameModal/RenameModal';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archiveBreedAdmin,
  createBreedAdmin,
  listBreedsAdmin,
  listPetTypes,
  updateBreedAdmin,
} from '../../api/maintenance.api';
import type { Breed, PetType, PetTypeRow } from '../../maintenance.types';
import {
  applyBreedFilters,
  BREED_COMPARATORS,
  BREED_SORT_FIELDS,
  buildBreedFilterFields,
  buildBreedGroupByAxes,
  deriveBreedSortKey,
  matchesBreedQuery,
} from './breedBrowserFields';
import styles from './AdminBreedsPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

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
 * Epic A follow-up: breeds previously had no CRUD anywhere - only the
 * seeded list from migration 20260725041. Lets Admin/Superadmin add, rename,
 * and remove breeds so BreedSelect's list doesn't require a new migration
 * every time it needs to grow.
 *
 * Notion-style remaster (session 110): the old one-section-per-pet-type
 * layout is now a single combined browser (per the Ideas backlog: "the
 * entire breed list to be combined into one... search, input, sort and
 * group by... table, list and board view options") - Board view, grouped
 * by Pet type (the default), reproduces the old per-section grouping;
 * Table/List show every breed flat with a Pet type badge, and the Filter
 * pill narrows to one pet type at a time.
 */
export function AdminBreedsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petTypes, setPetTypes] = useState<PetTypeRow[]>([]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPetType, setNewPetType] = useState<PetType>('');
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [renamingBreed, setRenamingBreed] = useState<Breed | null>(null);
  const [archivingBreed, setArchivingBreed] = useState<Breed | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [configuringBreed, setConfiguringBreed] = useState<Breed | null>(null);
  const [configPetType, setConfigPetType] = useState<PetType>('');
  const [configName, setConfigName] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId] = useState('petType');

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

    void listBreedsAdmin(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load breeds.');
        return;
      }

      setBreeds(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  // Pet Types admin CRUD (20260912191): the type filter/grouping and the
  // add-breed dropdown read the admin-managed list instead of a hardcoded
  // ['Dog', 'Cat'] array - breeds are keyed by pet type too, so a
  // newly-added pet type needs its own breeds section here immediately.
  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listPetTypes(accessToken).then((result) => {
      if (!isMounted || !result.data) {
        return;
      }

      setPetTypes(result.data);
      setNewPetType((current) => current || (result.data?.[0]?.key ?? ''));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const filterFields = useMemo(
    () => buildBreedFilterFields(petTypes),
    [petTypes]
  );
  const groupByAxes = useMemo(
    () => buildBreedGroupByAxes(petTypes),
    [petTypes]
  );

  const visibleBreeds = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? breeds.filter((breed) => matchesBreedQuery(breed, query))
      : breeds;
    const filtered = applyBreedFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(BREED_COMPARATORS[deriveBreedSortKey(sortTile)]);
  }, [breeds, search, filterTiles, sortTile]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedBreeds = useGroupBy(
    visibleBreeds,
    view === 'board' ? activeGroupAxis : null
  );

  function petTypeName(key: PetType): string {
    return petTypes.find((petType) => petType.key === key)?.name ?? key;
  }

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

    const result = await createBreedAdmin(accessToken, {
      pet_type: newPetType,
      name: newName.trim(),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add breed.');
      return;
    }

    setBreeds((prev) => [...prev, result.data as Breed]);
    setMessage('Breed added.');
    closeCreateModal();
  }

  function replaceBreed(updated: Breed) {
    setBreeds((prev) =>
      prev.map((breed) => (breed.id === updated.id ? updated : breed))
    );
  }

  async function handleRename(
    breed: Breed,
    name: string
  ): Promise<string | null> {
    if (!accessToken) return 'You are signed out.';

    const result = await updateBreedAdmin(breed.id, accessToken, { name });

    if (result.error || !result.data) {
      return result.error ?? 'Could not rename breed.';
    }

    replaceBreed(result.data);
    setMessage('Breed renamed.');
    return null;
  }

  function openConfigure(breed: Breed) {
    setConfiguringBreed(breed);
    setConfigPetType(breed.pet_type);
    setConfigName(breed.name);
    setConfigError(null);
  }

  function closeConfigure() {
    setConfiguringBreed(null);
    setConfigError(null);
  }

  async function handleConfigure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !configuringBreed) return;

    if (!configName.trim()) {
      setConfigError('Name is required.');
      return;
    }

    setIsConfiguring(true);
    setConfigError(null);

    const result = await updateBreedAdmin(configuringBreed.id, accessToken, {
      pet_type: configPetType,
      name: configName.trim(),
    });

    setIsConfiguring(false);

    if (result.error || !result.data) {
      setConfigError(result.error ?? 'Could not update breed.');
      return;
    }

    replaceBreed(result.data);
    setMessage('Breed updated.');
    closeConfigure();
  }

  async function handleConfirmArchive() {
    if (!accessToken || !archivingBreed) return;

    setIsArchiving(true);
    setRowError(null);

    const result = await archiveBreedAdmin(archivingBreed.id, accessToken);

    setIsArchiving(false);

    if (result.error) {
      setArchivingBreed(null);
      setRowError(result.error);
      return;
    }

    setBreeds((prev) => prev.filter((breed) => breed.id !== archivingBreed.id));
    setArchivingBreed(null);
    setMessage('Breed archived. Restore it from Settings > Config > Archive.');
  }

  function buildBreedActionItems(breed: Breed): MoreOptionsMenuItem[] {
    return [
      { label: 'Configure', onSelect: () => openConfigure(breed) },
      { label: 'Rename', onSelect: () => setRenamingBreed(breed) },
      { label: 'Archive', onSelect: () => setArchivingBreed(breed) },
    ];
  }

  function renderBreedActions(breed: Breed) {
    return (
      <div className={styles.actions}>
        <MoreOptionsMenu
          label={`Actions for ${breed.name}`}
          items={buildBreedActionItems(breed)}
        />
      </div>
    );
  }

  const columns = useMemo<DataTableColumn<Breed>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        render: (breed) => (
          <span className={styles.breedName}>{breed.name}</span>
        ),
      },
      {
        id: 'petType',
        header: 'Pet type',
        render: (breed) => (
          <span className={styles.petTypeBadge}>
            {petTypeName(breed.pet_type)}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [petTypes]
  );

  function renderBreedCard(breed: Breed, showMenuButton = false) {
    return (
      <CardRowWithMenu
        showMenuButton={showMenuButton}
        label={`Actions for ${breed.name}`}
        items={buildBreedActionItems(breed)}
      >
        <div className={styles.rowMain}>
          <span className={styles.breedName}>{breed.name}</span>
          <span className={styles.petTypeBadge}>
            {petTypeName(breed.pet_type)}
          </span>
        </div>
      </CardRowWithMenu>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
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
          <h1 className={styles.title}>Breed Management</h1>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateModal}
          >
            Add breed
          </button>
        </div>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="breeds-list-title">
          <h2 className={styles.sectionTitle} id="breeds-list-title">
            Breeds
          </h2>
          {isLoading ? (
            <LoadingState label="Loading breeds..." />
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
                sortFields={BREED_SORT_FIELDS}
                sortTile={sortTile}
                onChangeSort={setSortTile}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search breeds..."
              >
                <div className={styles.viewControls}>
                  <ViewSwitcher
                    options={VIEW_OPTIONS}
                    value={view}
                    onChange={setView}
                    ariaLabel="Breeds view"
                  />
                </div>
              </FilterSortBar>

              {view === 'table' ? (
                <DataTable
                  columns={columns}
                  rows={visibleBreeds}
                  getRowKey={(breed) => breed.id}
                  renderRowActions={renderBreedActions}
                  emptyMessage="No breeds match this filter."
                />
              ) : view === 'list' ? (
                <DataList
                  items={visibleBreeds}
                  getRowKey={(breed) => breed.id}
                  renderItem={(breed) => renderBreedCard(breed, true)}
                  emptyMessage="No breeds match this filter."
                />
              ) : (
                <DataBoard
                  groups={groupedBreeds}
                  getRowKey={(breed) => breed.id}
                  renderCard={(breed) => (
                    <div className={styles.listItem}>
                      {renderBreedCard(breed)}
                    </div>
                  )}
                  renderColumnHeader={(column, count) => (
                    <>
                      <span>{petTypeName(column)}</span>
                      <span className={styles.groupCount}>{count}</span>
                    </>
                  )}
                  emptyColumnMessage="No breeds yet."
                />
              )}
            </>
          )}
        </section>

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title="Add breed"
        onClose={closeCreateModal}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Pet Type</span>
            <select
              className={styles.input}
              value={newPetType}
              onChange={(event) => setNewPetType(event.target.value as PetType)}
            >
              {petTypes.map((option) => (
                <option key={option.id} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
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
            {isSubmitting ? 'Adding...' : 'Add breed'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={configuringBreed !== null}
        title="Configure breed"
        onClose={closeConfigure}
        closeOnBackdropClick={false}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleConfigure(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Pet Type</span>
            <select
              className={styles.input}
              value={configPetType}
              onChange={(event) =>
                setConfigPetType(event.target.value as PetType)
              }
            >
              {petTypes.map((option) => (
                <option key={option.id} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              value={configName}
              onChange={(event) => setConfigName(event.target.value)}
            />
          </label>
          {configError ? (
            <p className={styles.errorBanner} role="alert">
              {configError}
            </p>
          ) : null}
          <button
            className={styles.button}
            type="submit"
            disabled={isConfiguring}
          >
            {isConfiguring ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </Modal>

      <RenameModal
        isOpen={renamingBreed !== null}
        entityLabel="breed"
        currentName={renamingBreed?.name ?? ''}
        onSubmit={(name) =>
          renamingBreed
            ? handleRename(renamingBreed, name)
            : Promise.resolve(null)
        }
        onClose={() => setRenamingBreed(null)}
      />

      <ConfirmDialog
        isOpen={archivingBreed !== null}
        title="Archive breed?"
        body={`"${archivingBreed?.name ?? ''}" will no longer be offered when adding or editing pets. Pets that already have this breed keep it, and you can restore it from Settings > Config > Archive.`}
        confirmLabel="Archive"
        isConfirming={isArchiving}
        onConfirm={() => void handleConfirmArchive()}
        onCancel={() => setArchivingBreed(null)}
      />
    </main>
  );
}
