import { useEffect, useMemo, useState } from 'react';
import {
  Columns3,
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
} from 'lucide-react';
import { Link, Navigate } from 'react-router';
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
import {
  GROUP_SORT_MODE_OPTIONS,
  sortGroupByAxis,
  useGroupBy,
  type GroupSortMode,
} from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { listStaff } from '../../api/staff.api';
import { UnavailabilityBlockBadge } from '../../components/badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import { StaffCard } from '../../components/cards/StaffCard/StaffCard';
import { CreateStaffAccountForm } from '../../components/forms/CreateStaffAccountForm/CreateStaffAccountForm';
import { ManageStaffAccountForm } from '../../components/forms/ManageStaffAccountForm/ManageStaffAccountForm';
import { UnavailabilityBlockForm } from '../../components/forms/UnavailabilityBlockForm/UnavailabilityBlockForm';
import type { CreateStaffAccountResult, StaffProfile } from '../../staff.types';
import {
  applyStaffFilters,
  buildStaffFilterFields,
  buildStaffGroupByAxes,
  deriveStaffSortKey,
  matchesStaffQuery,
  STAFF_COMPARATORS,
  STAFF_SORT_FIELDS,
} from './staffBrowserFields';
import styles from './StaffManagementPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type StaffViewMode = 'gallery' | 'table' | 'list' | 'board';

const STAFF_VIEW_OPTIONS: ViewSwitcherOption<StaffViewMode>[] = [
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/**
 * Issue #75: renamed from AdminStaffListPage/"Staff Directory" ->
 * StaffManagementPage/"Staff Management" (label-only - no route or
 * permission change). Also fixes the staff card branch-id-instead-of-name
 * bug (joins against branches) and removes the duplicate unavailability
 * approval-queue entry point - that queue continues to live, unchanged, on
 * the branch operations dashboard (StaffDashboardPage's own tile still
 * links to /staff/admin/unavailability).
 */
export function StaffManagementPage() {
  const { user, accessToken } = useAuth();

  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [view, setView] = useState<StaffViewMode>('gallery');
  const [groupAxisId, setGroupAxisId] = useState('role');
  const [groupSortMode, setGroupSortMode] = useState<GroupSortMode>('manual');
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [expandedManageStaffId, setExpandedManageStaffId] = useState<
    string | null
  >(null);
  const [blockRefreshKeys, setBlockRefreshKeys] = useState<
    Record<string, number>
  >({});
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load staff.');
        return;
      }

      setStaffList(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  useEffect(() => {
    let isMounted = true;

    void listBranches().then((result) => {
      if (isMounted && result.data) {
        setBranches(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  // The Supabase session's user.role is the Postgres role ("authenticated"
  // for every signed-in user), not the app-level staff role, and no
  // app_metadata claim carries it either - so the viewer's own role is
  // read off their own row in the already-fetched staff list instead.
  // GET /staff is reachable by every staff role and always includes the
  // requester's own row (branch-scoped or, for Superadmin, unfiltered).
  const viewer = staffList.find((staff) => staff.id === user?.id) ?? null;
  const viewerRole = viewer?.role ?? null;
  const isAllowedViewer = ALLOWED_VIEWER_ROLES.has(viewerRole ?? '');

  const staffFilterFields = useMemo(
    () => buildStaffFilterFields(branches, viewerRole === 'Superadmin'),
    [branches, viewerRole]
  );

  const staffGroupByAxes = useMemo(
    () => buildStaffGroupByAxes(branches, viewerRole === 'Superadmin'),
    [branches, viewerRole]
  );

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? staffList.filter((staff) => matchesStaffQuery(staff, query))
      : staffList;
    const filtered = applyStaffFilters(searched, filterTiles);

    // No sort tile means "keep fetch order" rather than imposing a default.
    if (!sortTile) return filtered;
    return [...filtered].sort(STAFF_COMPARATORS[deriveStaffSortKey(sortTile)]);
  }, [staffList, search, filterTiles, sortTile]);

  const activeGroupAxis =
    staffGroupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const sortedGroupAxis = activeGroupAxis
    ? sortGroupByAxis(activeGroupAxis, groupSortMode)
    : null;
  const groupedStaff = useGroupBy(
    filteredStaff,
    view === 'board' ? sortedGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = staffFilterFields.find((f) => f.id === fieldId);
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

  const handleBlockCreated = (staffId: string) => {
    setBlockRefreshKeys((prev) => ({
      ...prev,
      [staffId]: (prev[staffId] ?? 0) + 1,
    }));
    setBlockMessage('Day-off request created.');
    setExpandedStaffId(null);
  };

  const handleAccountCreated = (result: CreateStaffAccountResult) => {
    setStaffList((prev) => [...prev, result.staff]);
  };

  const handleAccountManaged = (updated: StaffProfile) => {
    setStaffList((prev) =>
      prev.map((staff) => (staff.id === updated.id ? updated : staff))
    );
  };

  const handleAccountArchived = (archivedId: string) => {
    setStaffList((prev) => prev.filter((staff) => staff.id !== archivedId));
    // The Manage account modal is no longer keyed per-row (it's a single
    // page-level Modal now), so it must be explicitly closed here - an
    // archived staff member no longer exists in the list for it to reopen
    // against.
    setExpandedManageStaffId((current) =>
      current === archivedId ? null : current
    );
  };

  function staffActionItems(staff: StaffProfile): MoreOptionsMenuItem[] {
    return [
      {
        label: 'Set day(s) off',
        onSelect: () => setExpandedStaffId(staff.id),
      },
      {
        label: 'Manage account',
        onSelect: () => setExpandedManageStaffId(staff.id),
      },
    ];
  }

  // Table/List: a persistent "..." trigger, same as every other migrated
  // page. Gallery/Board reuse the same item list but through
  // CardContextMenu instead (see renderStaffCard below) - a kebab button on
  // every card in a dense grid/board is visual noise there.
  function renderStaffActions(staff: StaffProfile) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${staff.display_name}`}
        items={staffActionItems(staff)}
      />
    );
  }

  function renderStaffCard(staff: StaffProfile) {
    return (
      <CardContextMenu
        items={staffActionItems(staff)}
        label={`Actions for ${staff.display_name}`}
      >
        <StaffCard
          staffId={staff.id}
          profile={staff}
          accessToken={accessToken}
          branchName={branchNameById.get(staff.branch_id)}
          refreshKey={blockRefreshKeys[staff.id]}
        />
      </CardContextMenu>
    );
  }

  const staffTableColumns: DataTableColumn<StaffProfile>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (staff) => (
        <div className={styles.rowMain}>
          {staff.profile_photo_url ? (
            <img
              className={styles.rowAvatar}
              src={staff.profile_photo_url}
              alt=""
            />
          ) : (
            <span className={styles.rowAvatarFallback} aria-hidden="true">
              {getInitials(staff.display_name)}
            </span>
          )}
          <span className={styles.itemName}>{staff.display_name}</span>
        </div>
      ),
    },
    { id: 'role', header: 'Role', render: (staff) => staff.role },
    {
      id: 'branch',
      header: 'Branch',
      render: (staff) => branchNameById.get(staff.branch_id) ?? '—',
    },
    {
      id: 'availability',
      header: 'Availability',
      render: (staff) => (
        <UnavailabilityBlockBadge
          staffId={staff.id}
          accessToken={accessToken}
          refreshKey={blockRefreshKeys[staff.id]}
        />
      ),
    },
  ];

  const expandedStaff = staffList.find((staff) => staff.id === expandedStaffId);
  const expandedManageStaff = staffList.find(
    (staff) => staff.id === expandedManageStaffId
  );

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load staff management.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading staff...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  // Only decided once loading has resolved, so an Admin/Superadmin never
  // flashes through this redirect while their own role is still unknown.
  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Staff Management</h1>
          <Link
            className={styles.archiveLink}
            to="/staff/admin/archive?tab=staff"
          >
            View archive
          </Link>
        </div>

        <section className={styles.panel} aria-labelledby="create-staff-title">
          <h2 className={styles.sectionTitle} id="create-staff-title">
            Create staff account
          </h2>
          {viewerRole ? (
            <CreateStaffAccountForm
              accessToken={accessToken}
              viewerRole={viewerRole}
              viewerBranchId={viewer?.branch_id ?? ''}
              branches={branches}
              onCreated={handleAccountCreated}
            />
          ) : null}
        </section>

        <FilterSortBar
          filterFields={staffFilterFields}
          filterTiles={filterTiles}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          sortFields={STAFF_SORT_FIELDS}
          sortTile={sortTile}
          onChangeSort={setSortTile}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search staff..."
        >
          <div className={styles.viewControls}>
            <ViewSwitcher
              options={STAFF_VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Staff view"
            />
            {view === 'board' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Group by</span>
                  <select
                    className={styles.input}
                    value={groupAxisId}
                    onChange={(event) => setGroupAxisId(event.target.value)}
                    aria-label="Group by"
                  >
                    {staffGroupByAxes.map((axis) => (
                      <option key={axis.id} value={axis.id}>
                        {axis.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Sort groups</span>
                  <select
                    className={styles.input}
                    value={groupSortMode}
                    onChange={(event) =>
                      setGroupSortMode(event.target.value as GroupSortMode)
                    }
                    aria-label="Sort groups"
                  >
                    {GROUP_SORT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </FilterSortBar>

        {blockMessage ? (
          <p className={styles.successBanner}>{blockMessage}</p>
        ) : null}

        {filteredStaff.length === 0 ? (
          <p className={styles.copy}>
            No staff members match the selected filters.
          </p>
        ) : view === 'table' ? (
          <DataTable
            columns={staffTableColumns}
            rows={filteredStaff}
            getRowKey={(staff) => staff.id}
            renderRowActions={renderStaffActions}
          />
        ) : view === 'list' ? (
          <DataList
            items={filteredStaff}
            getRowKey={(staff) => staff.id}
            renderItem={(staff) => (
              <div className={styles.rowContent}>
                <div className={styles.rowMain}>
                  {staff.profile_photo_url ? (
                    <img
                      className={styles.rowAvatar}
                      src={staff.profile_photo_url}
                      alt=""
                    />
                  ) : (
                    <span
                      className={styles.rowAvatarFallback}
                      aria-hidden="true"
                    >
                      {getInitials(staff.display_name)}
                    </span>
                  )}
                  <span className={styles.itemName}>{staff.display_name}</span>
                  <span className={styles.roleBadge}>{staff.role}</span>
                  <span className={styles.copy}>
                    {branchNameById.get(staff.branch_id) ?? '—'}
                  </span>
                  <UnavailabilityBlockBadge
                    staffId={staff.id}
                    accessToken={accessToken}
                    refreshKey={blockRefreshKeys[staff.id]}
                  />
                </div>
                {renderStaffActions(staff)}
              </div>
            )}
          />
        ) : view === 'board' ? (
          <DataBoard
            groups={groupedStaff}
            getRowKey={(staff) => staff.id}
            renderCard={(staff) => (
              <div className={styles.boardCard}>{renderStaffCard(staff)}</div>
            )}
          />
        ) : (
          <div className={styles.grid}>
            {filteredStaff.map((staff) => (
              <div className={styles.gridItem} key={staff.id}>
                {renderStaffCard(staff)}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={expandedStaff !== undefined}
        title={`Set day(s) off - ${expandedStaff?.display_name ?? ''}`}
        onClose={() => setExpandedStaffId(null)}
      >
        {expandedStaff && accessToken ? (
          <UnavailabilityBlockForm
            staffId={expandedStaff.id}
            accessToken={accessToken}
            onCreated={() => handleBlockCreated(expandedStaff.id)}
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={expandedManageStaff !== undefined}
        title={`Manage account - ${expandedManageStaff?.display_name ?? ''}`}
        onClose={() => setExpandedManageStaffId(null)}
      >
        {expandedManageStaff && viewerRole && accessToken ? (
          <ManageStaffAccountForm
            staffId={expandedManageStaff.id}
            profile={expandedManageStaff}
            viewerRole={viewerRole}
            branches={branches}
            accessToken={accessToken}
            onUpdated={handleAccountManaged}
            onArchived={() => handleAccountArchived(expandedManageStaff.id)}
          />
        ) : null}
      </Modal>
    </main>
  );
}
