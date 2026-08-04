import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  listPolicyConfigurations,
  resolveEffectivePolicy,
} from '../../../booking/api/policy.api';
import {
  cancelUnavailabilityBlock,
  createUnavailabilityBlock,
  getStaffProfile,
  listBranchSchedule,
  listStaff,
} from '../../api/staff.api';
import {
  UNAVAILABILITY_LEAVE_TYPES,
  type BranchScheduleEntry,
  type StaffProfile,
  type StaffRole,
  type UnavailabilityLeaveType,
} from '../../staff.types';
import styles from './MonthlySchedulePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const LEAVE_TYPE_CLASS: Record<UnavailabilityLeaveType, string> = {
  'Rest Day': 'restDay',
  'Vacation Leave': 'vacationLeave',
  'Sick Leave': 'sickLeave',
  Other: 'other',
};

const LEAVE_TYPE_ABBR: Record<UnavailabilityLeaveType, string> = {
  'Rest Day': 'RD',
  'Vacation Leave': 'VL',
  'Sick Leave': 'SL',
  Other: 'O',
};

type ViewMode = 'calendar' | 'grid';
type StaffSort = 'name-asc' | 'name-desc';
type StaffRoleFilter = 'All' | StaffRole;

/** Shared by the page-level view filter and the Add-entry modal's own
 * staff searcher - same search/role-filter/sort behavior in both places. */
function filterSortStaff(
  list: StaffProfile[],
  search: string,
  roleFilter: StaffRoleFilter,
  sort: StaffSort
): StaffProfile[] {
  let result = list;

  if (roleFilter !== 'All') {
    result = result.filter((staff) => staff.role === roleFilter);
  }

  const query = search.trim().toLowerCase();
  if (query) {
    result = result.filter((staff) =>
      staff.display_name.toLowerCase().includes(query)
    );
  }

  const sorted = [...result].sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );

  return sort === 'name-desc' ? sorted.reverse() : sorted;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dateKeyFromDate(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Shared, branch-level calendar for plotting staff rest days / vacation
 * leave / sick leave - Admin, Supervisor, and Superadmin all have equal
 * CRUD access, scoped to their own branch (Superadmin can switch branches).
 * Reuses staff_unavailability_blocks end-to-end (createUnavailabilityBlock/
 * cancelUnavailabilityBlock) - "on behalf of" creation here is always
 * auto-approved per the existing manager rule, and every entry already
 * carries created_by/created_at, surfaced below as the requested log of
 * who added a schedule entry and when.
 */
export function MonthlySchedulePage() {
  const { user, accessToken } = useAuth();

  const [viewerProfile, setViewerProfile] = useState<StaffProfile | null>(null);
  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [roster, setRoster] = useState<StaffProfile[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  // Page-level view filter - narrows which staff's entries show in both
  // Calendar and Grid.
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] =
    useState<StaffRoleFilter>('All');
  const [staffSort, setStaffSort] = useState<StaffSort>('name-asc');

  // Independent search/filter/sort for the Add-entry modal's staff picker -
  // deliberately not the same state as above, so narrowing the page's view
  // (e.g. to Groomers only) never hides someone you still need to add a
  // Rest Day for from the modal.
  const [modalStaffSearch, setModalStaffSearch] = useState('');
  const [modalStaffRoleFilter, setModalStaffRoleFilter] =
    useState<StaffRoleFilter>('All');
  const [modalStaffSort, setModalStaffSort] = useState<StaffSort>('name-asc');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [entries, setEntries] = useState<BranchScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [lunchBreak, setLunchBreak] = useState<{
    enabled: boolean;
    start: string;
    end: string;
  } | null>(null);

  const [addDate, setAddDate] = useState<string | null>(null);
  const [addStaffId, setAddStaffId] = useState('');
  const [addLeaveType, setAddLeaveType] =
    useState<UnavailabilityLeaveType>('Rest Day');
  const [addReason, setAddReason] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [selectedEntry, setSelectedEntry] =
    useState<BranchScheduleEntry | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setViewerProfile(result.data);
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setSelectedBranchId((current) => current || result.data!.branch_id);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    let isMounted = true;

    void listBranches().then((result) => {
      if (isMounted && result.data) {
        setBranches(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken || !selectedBranchId) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted || !result.data) return;
      setRoster(
        result.data
          .filter((staff) => staff.branch_id === selectedBranchId)
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
      );
    });

    void listPolicyConfigurations(accessToken).then((result) => {
      if (!isMounted || !result.data) return;
      const effective = resolveEffectivePolicy(result.data, selectedBranchId);
      if (effective) {
        setLunchBreak({
          enabled: effective.lunch_break_enabled,
          start: effective.lunch_break_start.slice(0, 5),
          end: effective.lunch_break_end.slice(0, 5),
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken, selectedBranchId]);

  const loadSchedule = () => {
    if (!accessToken || !selectedBranchId) return;

    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 1).toISOString();

    void listBranchSchedule(selectedBranchId, { from, to }, accessToken).then(
      (result) => {
        setIsLoading(false);

        if (result.error || !result.data) {
          setLoadError(result.error ?? 'Could not load the schedule.');
          return;
        }

        setLoadError(null);
        setEntries(result.data);
      }
    );
  };

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedBranchId, year, month]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, BranchScheduleEntry[]>();
    for (const entry of entries) {
      const key = dateKeyFromDate(new Date(entry.start_time));
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    }
    return map;
  }, [entries]);

  // Staff Grid view: staff rows x date columns, one lookup per (staff, day)
  // cell instead of re-filtering entriesByDate per staff on every render.
  const entriesByStaffAndDate = useMemo(() => {
    const map = new Map<string, Map<string, BranchScheduleEntry[]>>();
    for (const entry of entries) {
      const key = dateKeyFromDate(new Date(entry.start_time));
      const staffMap = map.get(entry.staff_id) ?? new Map();
      const bucket = staffMap.get(key) ?? [];
      bucket.push(entry);
      staffMap.set(key, bucket);
      map.set(entry.staff_id, staffMap);
    }
    return map;
  }, [entries]);

  const roleOptions = useMemo(
    () =>
      Array.from(
        new Set(roster.map((staff) => staff.role))
      ).sort() as StaffRole[],
    [roster]
  );

  const filteredRoster = useMemo(
    () => filterSortStaff(roster, staffSearch, staffRoleFilter, staffSort),
    [roster, staffSearch, staffRoleFilter, staffSort]
  );

  const filteredRosterIds = useMemo(
    () => new Set(filteredRoster.map((staff) => staff.id)),
    [filteredRoster]
  );

  const modalFilteredRoster = useMemo(
    () =>
      filterSortStaff(
        roster,
        modalStaffSearch,
        modalStaffRoleFilter,
        modalStaffSort
      ),
    [roster, modalStaffSearch, modalStaffRoleFilter, modalStaffSort]
  );

  const leadingBlanks = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  function goToPrevMonth() {
    if (month === 0) {
      setYear((current) => current - 1);
      setMonth(11);
    } else {
      setMonth((current) => current - 1);
    }
  }

  function goToNextMonth() {
    if (month === 11) {
      setYear((current) => current + 1);
      setMonth(0);
    } else {
      setMonth((current) => current + 1);
    }
  }

  function openAddPanel(day: number, preselectStaffId?: string) {
    setAddDate(dateKey(year, month, day));
    setAddStaffId(preselectStaffId ?? roster[0]?.id ?? '');
    setAddLeaveType('Rest Day');
    setAddReason('');
    setAddError(null);
    setModalStaffSearch('');
    setModalStaffRoleFilter('All');
    setModalStaffSort('name-asc');
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !addDate || !addStaffId) {
      setAddError('Select a staff member.');
      return;
    }

    setAddError(null);
    setIsAdding(true);

    const result = await createUnavailabilityBlock(addStaffId, accessToken, {
      is_full_day: true,
      date: addDate,
      leave_type: addLeaveType,
      reason: addReason.trim() ? addReason.trim() : undefined,
    });

    setIsAdding(false);

    if (result.error || !result.data) {
      setAddError(result.error ?? 'Could not add this schedule entry.');
      return;
    }

    setAddDate(null);
    loadSchedule();
  }

  async function handleCancel(entry: BranchScheduleEntry) {
    if (!accessToken) return;

    setCancelError(null);
    setIsCancelling(true);

    const result = await cancelUnavailabilityBlock(
      entry.staff_id,
      accessToken,
      entry.id
    );

    setIsCancelling(false);

    if (result.error) {
      setCancelError(result.error);
      return;
    }

    setSelectedEntry(null);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the monthly schedule.
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
        <h1 className={styles.title}>Monthly Schedule</h1>
        <p className={styles.copy}>
          Rest days and vacation/sick leave for every staff member at this
          branch - shared across Admin, Supervisor, and Superadmin. Rest days
          are fixed by a manager; vacation/sick leave can also be self-
          requested from Days Off.
        </p>

        <div className={styles.toolbar}>
          {viewerProfile?.role === 'Superadmin' && branches.length > 0 ? (
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Branch</span>
              <select
                className={styles.filterSelect}
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className={styles.monthNav}>
            <button
              type="button"
              className={styles.navButton}
              onClick={goToPrevMonth}
              aria-label="Previous month"
            >
              &larr;
            </button>
            <span className={styles.monthLabel}>
              {MONTH_LABELS[month]} {year}
            </span>
            <button
              type="button"
              className={styles.navButton}
              onClick={goToNextMonth}
              aria-label="Next month"
            >
              &rarr;
            </button>
          </div>

          {lunchBreak?.enabled ? (
            <span className={styles.lunchBadge}>
              Lunch break {lunchBreak.start}-{lunchBreak.end} daily
            </span>
          ) : null}

          <div
            className={styles.viewToggle}
            role="group"
            aria-label="Calendar view"
          >
            <button
              type="button"
              className={
                viewMode === 'calendar'
                  ? styles.viewToggleButtonActive
                  : styles.viewToggleButton
              }
              onClick={() => setViewMode('calendar')}
            >
              Calendar
            </button>
            <button
              type="button"
              className={
                viewMode === 'grid'
                  ? styles.viewToggleButtonActive
                  : styles.viewToggleButton
              }
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
          </div>
        </div>

        <div className={styles.staffFilterBar}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Search staff</span>
            <input
              className={styles.filterSelect}
              type="text"
              value={staffSearch}
              onChange={(event) => setStaffSearch(event.target.value)}
              placeholder="Name..."
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Role</span>
            <select
              className={styles.filterSelect}
              value={staffRoleFilter}
              onChange={(event) =>
                setStaffRoleFilter(event.target.value as StaffRoleFilter)
              }
            >
              <option value="All">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Sort</span>
            <select
              className={styles.filterSelect}
              value={staffSort}
              onChange={(event) =>
                setStaffSort(event.target.value as StaffSort)
              }
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </label>
        </div>

        {loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading schedule...</p>
        ) : viewMode === 'calendar' ? (
          <div className={styles.calendar}>
            {WEEKDAY_HEADERS.map((label) => (
              <div key={label} className={styles.weekdayHeader}>
                {label}
              </div>
            ))}
            {cells.map((day, index) => {
              if (day === null) {
                return (
                  <div key={`blank-${index}`} className={styles.dayCellBlank} />
                );
              }

              const key = dateKey(year, month, day);
              const dayEntries = (entriesByDate.get(key) ?? []).filter(
                (entry) => filteredRosterIds.has(entry.staff_id)
              );

              return (
                <div key={key} className={styles.dayCell}>
                  <div className={styles.dayCellHeader}>
                    <span>{day}</span>
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => openAddPanel(day)}
                      aria-label={`Add schedule entry on ${key}`}
                    >
                      +
                    </button>
                  </div>
                  <div className={styles.dayChips}>
                    {dayEntries.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        className={`${styles.chip} ${
                          styles[LEAVE_TYPE_CLASS[entry.leave_type]]
                        }`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        {entry.staff?.display_name ?? 'Staff'} -{' '}
                        {entry.leave_type}
                        {entry.status !== 'approved'
                          ? ` (${entry.status})`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : roster.length === 0 ? (
          <p className={styles.copy}>No staff at this branch yet.</p>
        ) : filteredRoster.length === 0 ? (
          <p className={styles.copy}>No staff match your search/filter.</p>
        ) : (
          <div className={styles.gridScroll}>
            <table className={styles.gridTable}>
              <thead>
                <tr>
                  <th className={styles.gridCornerCell} scope="col">
                    Staff
                  </th>
                  {Array.from(
                    { length: totalDays },
                    (_, index) => index + 1
                  ).map((day) => (
                    <th
                      key={day}
                      className={styles.gridDateHeaderCell}
                      scope="col"
                    >
                      <span className={styles.gridDow}>
                        {WEEKDAY_HEADERS[new Date(year, month, day).getDay()]}
                      </span>
                      <span className={styles.gridDay}>{day}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((staff) => (
                  <tr key={staff.id}>
                    <th className={styles.gridStaffCell} scope="row">
                      <span>{staff.display_name}</span>
                      <span className={styles.gridStaffRole}>{staff.role}</span>
                    </th>
                    {Array.from(
                      { length: totalDays },
                      (_, index) => index + 1
                    ).map((day) => {
                      const key = dateKey(year, month, day);
                      const entry = entriesByStaffAndDate
                        .get(staff.id)
                        ?.get(key)?.[0];

                      return (
                        <td key={day} className={styles.gridCell}>
                          {entry ? (
                            <button
                              type="button"
                              className={`${styles.gridBadge} ${
                                styles[LEAVE_TYPE_CLASS[entry.leave_type]]
                              }`}
                              title={`${entry.leave_type}${
                                entry.status !== 'approved'
                                  ? ` (${entry.status})`
                                  : ''
                              }`}
                              onClick={() => setSelectedEntry(entry)}
                            >
                              {LEAVE_TYPE_ABBR[entry.leave_type]}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.gridEmptyCell}
                              aria-label={`Add schedule entry for ${staff.display_name} on ${key}`}
                              onClick={() => openAddPanel(day, staff.id)}
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {addDate ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setAddDate(null)}
          >
            <section
              className={`${styles.panel} ${styles.modalBox}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-entry-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className={styles.sectionTitle} id="add-entry-title">
                Add schedule entry - {addDate}
              </h2>
              <form className={styles.form} onSubmit={(e) => void handleAdd(e)}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Find staff member</span>
                  <div className={styles.modalStaffFilters}>
                    <input
                      className={styles.input}
                      type="text"
                      value={modalStaffSearch}
                      onChange={(event) =>
                        setModalStaffSearch(event.target.value)
                      }
                      placeholder="Search by name..."
                      aria-label="Search staff by name"
                    />
                    <select
                      className={styles.input}
                      value={modalStaffRoleFilter}
                      onChange={(event) =>
                        setModalStaffRoleFilter(
                          event.target.value as StaffRoleFilter
                        )
                      }
                      aria-label="Filter staff by role"
                    >
                      <option value="All">All roles</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <select
                      className={styles.input}
                      value={modalStaffSort}
                      onChange={(event) =>
                        setModalStaffSort(event.target.value as StaffSort)
                      }
                      aria-label="Sort staff"
                    >
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                    </select>
                  </div>
                </div>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Staff member</span>
                  {modalFilteredRoster.length === 0 ? (
                    <p className={styles.copy}>No staff match that search.</p>
                  ) : (
                    <select
                      className={styles.input}
                      value={addStaffId}
                      onChange={(event) => setAddStaffId(event.target.value)}
                    >
                      {modalFilteredRoster.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.display_name} - {staff.role}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Type</span>
                  <select
                    className={styles.input}
                    value={addLeaveType}
                    onChange={(event) =>
                      setAddLeaveType(
                        event.target.value as UnavailabilityLeaveType
                      )
                    }
                  >
                    {UNAVAILABILITY_LEAVE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Reason (optional)</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={addReason}
                    onChange={(event) => setAddReason(event.target.value)}
                  />
                </label>

                {addError ? (
                  <p className={styles.errorBanner} role="alert">
                    {addError}
                  </p>
                ) : null}

                <div className={styles.formActions}>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={isAdding || modalFilteredRoster.length === 0}
                  >
                    {isAdding ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setAddDate(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {selectedEntry ? (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => setSelectedEntry(null)}
          >
            <section
              className={`${styles.panel} ${styles.modalBox}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="entry-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className={styles.sectionTitle} id="entry-detail-title">
                {selectedEntry.staff?.display_name ?? 'Staff'} -{' '}
                {selectedEntry.leave_type}
              </h2>
              <p className={styles.copy}>Status: {selectedEntry.status}</p>
              {selectedEntry.reason ? (
                <p className={styles.copy}>Reason: {selectedEntry.reason}</p>
              ) : null}
              <p className={styles.copy}>
                Added by{' '}
                {selectedEntry.created_by_name ??
                  'a staff account no longer on file'}{' '}
                on {formatDateTime(selectedEntry.created_at)}
              </p>

              {cancelError ? (
                <p className={styles.errorBanner} role="alert">
                  {cancelError}
                </p>
              ) : null}

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={isCancelling}
                  onClick={() => void handleCancel(selectedEntry)}
                >
                  {isCancelling ? 'Removing...' : 'Remove'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSelectedEntry(null)}
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
