import { useEffect, useMemo, useState } from 'react';
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
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { BranchConfigureModal } from '../../components/BranchConfigureModal/BranchConfigureModal';
import { useRenameAndArchive } from '../../../../shared/hooks/useRenameAndArchive/useRenameAndArchive';
import { listStaff } from '../../../staff/api/staff.api';
import {
  BranchDetailsForm,
  type BranchDetailsPayload,
} from '../../components/BranchDetailsForm/BranchDetailsForm';
import {
  archiveBranch,
  createBranch,
  listBranchesFull,
  updateBranch,
} from '../../api/branches.api';
import type { Branch } from '../../maintenance.types';
import {
  applyBranchFilters,
  BRANCH_COMPARATORS,
  BRANCH_FILTER_FIELDS,
  BRANCH_GROUP_BY_AXES,
  BRANCH_SORT_FIELDS,
  deriveBranchSortKey,
  matchesBranchQuery,
} from './branchBrowserFields';
import styles from './BranchesPage.module.css';

/** Superadmin-only - deliberately narrower than every other maintenance
 * config page in this feature folder (all Admin+Superadmin), matching the
 * server's BRANCH_CONFIG_ROLES. */
const ALLOWED_VIEWER_ROLES = new Set(['Superadmin']);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/**
 * Superadmin Branches (renamed from System Configuration, session 87) -
 * full Notion-style browser (search/filter/sort/group-by/view-switcher,
 * same shared toolbar as AdminCagesPage) over every branch, replacing the
 * old single-branch-at-a-time edit form. A row's "Configure" opens one modal
 * for that branch: its identity/operating hours (the former "Edit"/"Details"
 * form) and its booking policies (formerly its own Config tile), so there
 * is a single Configure action instead of two.
 */
export function BranchesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [configuringBranchId, setConfiguringBranchId] = useState<string | null>(
    null
  );

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(BRANCH_GROUP_BY_AXES[0].id);

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

  function loadBranches() {
    if (!accessToken) return;
    void listBranchesFull(accessToken).then((result) => {
      setIsLoading(false);
      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load branches.');
        return;
      }
      setLoadError(null);
      setBranches(result.data);
    });
  }

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAllowedViewer]);

  function replaceBranch(updated: Branch) {
    setBranches((prev) =>
      prev.map((branch) => (branch.id === updated.id ? updated : branch))
    );
  }

  // "Add branch" only - editing a branch's details now happens on the
  // combined Configure page (details + policies), see BranchConfigurePage.
  async function handleCreate(
    payload: BranchDetailsPayload
  ): Promise<string | null> {
    if (!accessToken) return 'You are signed out.';

    const result = await createBranch(accessToken, payload);

    if (result.error || !result.data) {
      return result.error ?? 'Could not add the branch.';
    }

    setBranches((prev) => [...prev, result.data as Branch]);
    setMessage('Branch added.');
    setIsModalOpen(false);
    return null;
  }

  const { requestRename, requestArchive, dialogs } =
    useRenameAndArchive<Branch>({
      entityLabel: 'branch',
      getName: (branch) => branch.name,
      archiveConsequence:
        'it will be switched off and hidden from customers and staff pickers',
      onRename: async (branch, name) => {
        if (!accessToken) return 'You are signed out.';

        const result = await updateBranch(branch.id, accessToken, { name });

        if (result.error || !result.data) {
          return result.error ?? 'Could not rename the branch.';
        }

        replaceBranch(result.data);
        setMessage('Branch renamed.');
        return null;
      },
      onArchive: async (branch) => {
        if (!accessToken) return 'You are signed out.';

        const result = await archiveBranch(branch.id, accessToken);

        if (result.error) return result.error;

        setBranches((prev) => prev.filter((item) => item.id !== branch.id));
        setMessage(
          'Branch archived. Restore it from Settings > Config > Archive.'
        );
        return null;
      },
      onArchiveError: setRowError,
    });

  // Configure opens ONE modal for the branch: its details (name, address,
  // contact, timezone, hours) and its booking policies together.
  const configuringBranch =
    branches.find((branch) => branch.id === configuringBranchId) ?? null;

  const visibleBranches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? branches.filter((branch) => matchesBranchQuery(branch, query))
      : branches;
    const filtered = applyBranchFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      BRANCH_COMPARATORS[deriveBranchSortKey(sortTile)]
    );
  }, [branches, search, filterTiles, sortTile]);

  const activeGroupAxis =
    BRANCH_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedBranches = useGroupBy(
    visibleBranches,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = BRANCH_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  function branchActionItems(branch: Branch): MoreOptionsMenuItem[] {
    return [
      { label: 'Configure', onSelect: () => setConfiguringBranchId(branch.id) },
      { label: 'Rename', onSelect: () => requestRename(branch) },
      { label: 'Archive', onSelect: () => requestArchive(branch) },
    ];
  }

  function renderBranchActions(branch: Branch) {
    return (
      <div className={styles.actions}>
        <MoreOptionsMenu
          label={`Actions for ${branch.name}`}
          items={branchActionItems(branch)}
        />
      </div>
    );
  }

  const columns = useMemo<DataTableColumn<Branch>[]>(
    () => [
      {
        id: 'name',
        header: 'Branch',
        render: (branch) => (
          <span className={styles.branchName}>{branch.name}</span>
        ),
      },
      {
        id: 'address',
        header: 'Address',
        render: (branch) => (
          <span className={styles.branchAddress}>{branch.address}</span>
        ),
      },
      {
        id: 'type',
        header: 'Branch type',
        render: (branch) => (
          <span className={styles.typeBadge}>
            {branch.is_vet_branch ? 'Veterinary' : 'Grooming only'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        render: (branch) => (
          <span
            className={`${styles.statusBadge} ${
              branch.is_active ? styles.statusActive : styles.statusInactive
            }`}
          >
            {branch.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
    ],
    []
  );

  function renderBranchCardBody(branch: Branch) {
    return (
      <>
        <span className={styles.branchName}>{branch.name}</span>
        <span className={styles.branchAddress}>{branch.address}</span>
        <span className={styles.typeBadge}>
          {branch.is_vet_branch ? 'Veterinary' : 'Grooming only'}
        </span>
        <span
          className={`${styles.statusBadge} ${
            branch.is_active ? styles.statusActive : styles.statusInactive
          }`}
        >
          {branch.is_active ? 'Active' : 'Inactive'}
        </span>
      </>
    );
  }

  function renderBranchCard(branch: Branch) {
    return (
      <div className={styles.rowMain}>
        {renderBranchCardBody(branch)}
        {renderBranchActions(branch)}
      </div>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the branches panel.
          </p>
        </div>
      </main>
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
          <h1 className={styles.title}>Branches</h1>
          <button
            type="button"
            className={styles.button}
            onClick={() => setIsModalOpen(true)}
          >
            + Add branch
          </button>
        </div>
        <p className={styles.copy}>
          Branch identity and operating hours - the same operating_hours Date
          &amp; Time slot generation and staff day-off shift-end resolution read
          from everywhere else in the app. "Configure" opens a pop-up with that
          branch's details and booking policies.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading branches...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <FilterSortBar
              filterFields={BRANCH_FILTER_FIELDS}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={BRANCH_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search branches..."
            >
              <div className={styles.viewControls}>
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel="Branches view"
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
                      {BRANCH_GROUP_BY_AXES.map((axis) => (
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
                rows={visibleBranches}
                getRowKey={(branch) => branch.id}
                renderRowActions={renderBranchActions}
                emptyMessage="No branches match this filter."
              />
            ) : view === 'list' ? (
              <DataList
                items={visibleBranches}
                getRowKey={(branch) => branch.id}
                renderItem={(branch) => (
                  <div className={styles.listItem}>
                    {renderBranchCard(branch)}
                  </div>
                )}
                emptyMessage="No branches match this filter."
              />
            ) : (
              <DataBoard
                groups={groupedBranches}
                getRowKey={(branch) => branch.id}
                renderCard={(branch) => (
                  <div className={styles.listItem}>
                    {renderBranchCard(branch)}
                  </div>
                )}
                emptyColumnMessage="No branches here."
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
        isOpen={isModalOpen}
        title="Add branch"
        onClose={() => setIsModalOpen(false)}
      >
        <BranchDetailsForm
          branch={null}
          submitLabel="Add branch"
          onSubmit={handleCreate}
        />
      </Modal>

      <BranchConfigureModal
        branch={configuringBranch}
        onClose={() => setConfiguringBranchId(null)}
        onSaved={replaceBranch}
      />

      {dialogs}
    </main>
  );
}
