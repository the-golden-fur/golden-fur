import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
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
import { listStaff } from '../../../staff/api/staff.api';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import {
  archiveBranch,
  createBranch,
  listBranchesFull,
  updateBranch,
} from '../../api/branches.api';
import {
  WEEKDAYS,
  type Branch,
  type OperatingHours,
  type Weekday,
} from '../../maintenance.types';
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

const POLICIES_ROUTE = '/staff/admin/maintenance/policies';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

interface BranchFormState {
  name: string;
  address: string;
  contact_number: string;
  is_vet_branch: boolean;
  timezone: string;
  operating_hours: OperatingHours;
}

const EMPTY_FORM: BranchFormState = {
  name: '',
  address: '',
  contact_number: '',
  is_vet_branch: false,
  timezone: 'Asia/Manila',
  operating_hours: {},
};

function formStateFromBranch(branch: Branch): BranchFormState {
  return {
    name: branch.name,
    address: branch.address,
    contact_number: branch.contact_number ?? '',
    is_vet_branch: branch.is_vet_branch,
    timezone: branch.timezone,
    operating_hours: branch.operating_hours,
  };
}

interface BranchesPageProps {
  /** Passed by SettingsPage when this page is embedded inline - lets a
   * "Configure" row action switch Settings to another tile (Policies,
   * pre-scoped) instead of a plain route navigation. Falls back to
   * useNavigate below when this page is reached via its own standalone
   * route instead (no pre-scoping available there - the visitor picks a
   * branch from Policies' own selector like before). */
  onNavigateToConfig?: (to: string, props?: Record<string, unknown>) => void;
}

/**
 * Superadmin Branches (renamed from System Configuration, session 87) -
 * full Notion-style browser (search/filter/sort/group-by/view-switcher,
 * same shared toolbar as AdminCagesPage) over every branch, replacing the
 * old single-branch-at-a-time edit form. Branch identity/operating hours
 * editing itself is unchanged in substance (same fields), now reached via
 * a per-row "Edit" menu item instead of always being on-page. Policies
 * (formerly its own separate Config tile) is now reached via "Configure"
 * on a specific branch row, pre-scoped to that branch.
 */
export function BranchesPage({ onNavigateToConfig }: BranchesPageProps) {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  function setDayClosed(day: Weekday, closed: boolean) {
    setForm((prev) => {
      const next = { ...prev.operating_hours };
      if (closed) {
        delete next[day];
      } else {
        next[day] = { open: '09:00', close: '18:00' };
      }
      return { ...prev, operating_hours: next };
    });
  }

  function setDayTime(day: Weekday, field: 'open' | 'close', value: string) {
    setForm((prev) => {
      const existing = prev.operating_hours[day] ?? {
        open: '09:00',
        close: '18:00',
      };
      return {
        ...prev,
        operating_hours: {
          ...prev.operating_hours,
          [day]: { ...existing, [field]: value },
        },
      };
    });
  }

  function openCreateModal() {
    setEditingBranchId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(branch: Branch) {
    setEditingBranchId(branch.id);
    setForm(formStateFromBranch(branch));
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setFormError(null);
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    if (!form.name.trim() || !form.address.trim() || !form.timezone.trim()) {
      setFormError('Name, address, and timezone are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      contact_number: form.contact_number.trim()
        ? form.contact_number.trim()
        : null,
      is_vet_branch: form.is_vet_branch,
      timezone: form.timezone.trim(),
      operating_hours: form.operating_hours,
    };

    const result = editingBranchId
      ? await updateBranch(editingBranchId, accessToken, payload)
      : await createBranch(accessToken, payload);

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(
        result.error ??
          `Could not ${editingBranchId ? 'update' : 'add'} the branch.`
      );
      return;
    }

    if (editingBranchId) {
      replaceBranch(result.data);
    } else {
      setBranches((prev) => [...prev, result.data as Branch]);
    }

    setMessage(editingBranchId ? 'Branch updated.' : 'Branch added.');
    setIsModalOpen(false);
    setEditingBranchId(null);
  }

  async function handleToggleActive(branch: Branch) {
    if (!accessToken) return;
    setRowError(null);

    const result = await updateBranch(branch.id, accessToken, {
      is_active: !branch.is_active,
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update the branch.');
      return;
    }

    replaceBranch(result.data);
  }

  async function handleArchive(branch: Branch) {
    if (!accessToken) return;
    setRowError(null);

    const result = await archiveBranch(branch.id, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setBranches((prev) => prev.filter((item) => item.id !== branch.id));
    setMessage('Branch archived.');
  }

  function handleConfigure(branch: Branch) {
    if (onNavigateToConfig) {
      onNavigateToConfig(POLICIES_ROUTE, {
        initialBranchId: branch.id,
        lockBranchSelector: true,
      });
    } else {
      navigate(POLICIES_ROUTE);
    }
  }

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
    const items: MoreOptionsMenuItem[] = [
      { label: 'Edit', onSelect: () => openEditModal(branch) },
      { label: 'Configure', onSelect: () => handleConfigure(branch) },
      {
        label: branch.is_active ? 'Deactivate' : 'Reactivate',
        onSelect: () => void handleToggleActive(branch),
      },
    ];

    if (!branch.is_active) {
      items.push({
        label: 'Archive',
        onSelect: () => void handleArchive(branch),
      });
    }

    return items;
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
            onClick={openCreateModal}
          >
            + Add branch
          </button>
        </div>
        <p className={styles.copy}>
          Branch identity and operating hours - the same operating_hours Date
          &amp; Time slot generation and staff day-off shift-end resolution read
          from everywhere else in the app. "Configure" opens Policies pre-scoped
          to that branch.
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
        title={editingBranchId ? 'Edit branch' : 'Add branch'}
        onClose={closeModal}
      >
        <form className={styles.form} onSubmit={handleFormSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Branch name</span>
            <input
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Address</span>
            <input
              className={styles.input}
              type="text"
              value={form.address}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Contact number</span>
            <input
              className={styles.input}
              type="text"
              value={form.contact_number}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  contact_number: event.target.value,
                }))
              }
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Timezone</span>
            <input
              className={styles.input}
              type="text"
              value={form.timezone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, timezone: event.target.value }))
              }
              required
            />
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={form.is_vet_branch}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  is_vet_branch: event.target.checked,
                }))
              }
            />
            <span>Veterinary services offered at this branch</span>
          </label>

          <section aria-labelledby="operating-hours-heading">
            <h2 className={styles.sectionTitle} id="operating-hours-heading">
              Operating hours
            </h2>
            <div className={styles.hoursTable}>
              {WEEKDAYS.map((day) => {
                const entry = form.operating_hours[day];
                const isClosed = !entry;

                return (
                  <div className={styles.hoursRow} key={day}>
                    <span className={styles.dayLabel}>
                      {WEEKDAY_LABELS[day]}
                    </span>
                    <label className={styles.closedField}>
                      <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={(event) =>
                          setDayClosed(day, event.target.checked)
                        }
                      />
                      <span>Closed</span>
                    </label>
                    {!isClosed ? (
                      <>
                        <TimeInput
                          value={entry.open}
                          onChange={(value) => setDayTime(day, 'open', value)}
                          aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                        />
                        <span className={styles.hoursSeparator}>to</span>
                        <TimeInput
                          value={entry.close}
                          onChange={(value) => setDayTime(day, 'close', value)}
                          aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

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
              {isSubmitting
                ? 'Saving...'
                : editingBranchId
                  ? 'Save changes'
                  : 'Add branch'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
