import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getCageGrid } from '../../../hotel/api/hotel.api';
import type { Cage, CageSize, CageStatus } from '../../../hotel/hotel.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { getCageOccupancyReport } from '../../api/reports.api';
import type { CageOccupancyRow } from '../../reports.types';
import styles from './CageOccupancyReport.module.css';

// Custom change (occupied/vacant cages view for Receptionist): opened to
// Receptionist too - server-side CAGE_OCCUPANCY_READ_ROLES
// (reports.types.ts) grants the matching GET /reports/cage-occupancy access.
const ALLOWED_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Receptionist',
]);

const SIZE_ORDER: CageOccupancyRow['size'][] = ['S', 'M', 'L', 'XL'];

const SIZE_LABEL: Record<CageOccupancyRow['size'], string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

const STATUS_TOKEN: Record<CageOccupancyRow['status'], string> = {
  Available: styles.statusAvailable,
  Occupied: styles.statusOccupied,
  Reserved: styles.statusReserved,
  'Under Maintenance': styles.statusMaintenance,
};

const STATUS_FILTER_OPTIONS: Array<CageStatus | 'All'> = [
  'All',
  'Available',
  'Occupied',
  'Reserved',
  'Under Maintenance',
];

type CageSortKey = 'label' | 'status' | 'size';

const CAGE_SORT_OPTIONS: Array<{ value: CageSortKey; label: string }> = [
  { value: 'label', label: 'Sort: Label (A-Z)' },
  { value: 'status', label: 'Sort: Status' },
  { value: 'size', label: 'Sort: Size' },
];

/**
 * Issue #105: real-time cage occupancy view, grouped by size category and
 * reusing the existing --color-cage-status-* token set (Sprint 4 Epic A,
 * #79) unchanged - the same visual language as the Hotel module's own cage
 * grid rather than a report-specific palette.
 *
 * Custom change (search/sort/filter): the per-size summary above stays as
 * the at-a-glance count view; a searchable/sortable/filterable list of
 * individual cages (reusing GET /hotel/cages, already open to every role
 * that can reach this page - see CageStatusGrid's own use of it) sits below
 * it for actually finding a specific cage. That individual list is always
 * scoped to the viewer's own branch (GET /hotel/cages has no branch
 * override) - Superadmin's branch selector above only affects the summary;
 * checking a specific cage in a different branch is still Hotel Queue's or
 * Admin > Cages' job, same as before this change.
 */
export function CageOccupancyReport() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [rows, setRows] = useState<CageOccupancyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cages, setCages] = useState<Cage[]>([]);
  const [isCagesLoading, setIsCagesLoading] = useState(true);
  const [cagesError, setCagesError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CageStatus | 'All'>('All');
  const [sizeFilter, setSizeFilter] = useState<CageSize | 'All'>('All');

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
      setViewerBranchId(self?.branch_id ?? null);
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    const branchId = isSuperadmin ? selectedBranchId || null : viewerBranchId;

    void getCageOccupancyReport(branchId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setRows(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    isSuperadmin,
    selectedBranchId,
    viewerBranchId,
  ]);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void getCageGrid(accessToken).then((result) => {
      if (!isMounted) return;

      setIsCagesLoading(false);

      if (result.error || !result.data) {
        setCagesError(result.error ?? 'Could not load individual cages.');
        return;
      }

      setCagesError(null);
      setCages(SIZE_ORDER.flatMap((size) => result.data![size]));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const preFilteredCages = useMemo(
    () =>
      cages.filter(
        (cage) =>
          (statusFilter === 'All' || cage.status === statusFilter) &&
          (sizeFilter === 'All' || cage.size === sizeFilter)
      ),
    [cages, statusFilter, sizeFilter]
  );

  const {
    search: cageSearch,
    setSearch: setCageSearch,
    sortKey: cageSortKey,
    setSortKey: setCageSortKey,
    result: filteredCages,
  } = useSearchAndSort<Cage, CageSortKey>({
    items: preFilteredCages,
    matchesQuery: (cage, query) =>
      cage.cage_label.toLowerCase().includes(query),
    comparators: {
      label: (a, b) => a.cage_label.localeCompare(b.cage_label),
      status: (a, b) => a.status.localeCompare(b.status),
      size: (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size),
    },
    initialSortKey: 'label',
  });

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const bySize = SIZE_ORDER.map((size) => ({
    size,
    rows: rows.filter((row) => row.size === size),
  }));

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <h1 className={styles.title}>Cage Occupancy</h1>

        {isSuperadmin ? (
          <label className={styles.field}>
            Branch
            <select
              className={styles.control}
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading cage occupancy...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <div className={styles.grid}>
          {bySize.map(({ size, rows: sizeRows }) => (
            <div key={size} className={styles.sizeGroup}>
              <h2 className={styles.sizeTitle}>{SIZE_LABEL[size]}</h2>
              <div className={styles.badges}>
                {sizeRows.length === 0 ? (
                  <span className={styles.copy}>No cages</span>
                ) : (
                  sizeRows.map((row) => (
                    <span
                      key={row.status}
                      className={`${styles.badge} ${STATUS_TOKEN[row.status]}`}
                    >
                      {row.status}: {row.cage_count}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className={styles.sectionTitle}>Find a cage</h2>

      <div className={styles.controls}>
        <SearchSortBar
          searchValue={cageSearch}
          onSearchChange={setCageSearch}
          searchPlaceholder="Search by cage label..."
          sortValue={cageSortKey}
          onSortChange={setCageSortKey}
          sortOptions={CAGE_SORT_OPTIONS}
        />

        <label className={styles.field}>
          Status
          <select
            className={styles.control}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as CageStatus | 'All')
            }
          >
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'All' ? 'All statuses' : status}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Size
          <select
            className={styles.control}
            value={sizeFilter}
            onChange={(event) =>
              setSizeFilter(event.target.value as CageSize | 'All')
            }
          >
            <option value="All">All sizes</option>
            {SIZE_ORDER.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABEL[size]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isCagesLoading ? (
        <p className={styles.copy}>Loading cages...</p>
      ) : cagesError ? (
        <p className={styles.errorBanner} role="alert">
          {cagesError}
        </p>
      ) : (
        <>
          <p className={styles.copy}>
            {filteredCages.length} of {cages.length} cages
          </p>
          {filteredCages.length === 0 ? (
            <p className={styles.copy}>No cages match these filters.</p>
          ) : (
            <div className={styles.cageList}>
              {filteredCages.map((cage) => (
                <div key={cage.id} className={styles.cageCard}>
                  <span className={styles.cageLabel}>{cage.cage_label}</span>
                  <span className={styles.cageSize}>
                    {SIZE_LABEL[cage.size]}
                  </span>
                  <span
                    className={`${styles.badge} ${STATUS_TOKEN[cage.status]}`}
                  >
                    {cage.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
