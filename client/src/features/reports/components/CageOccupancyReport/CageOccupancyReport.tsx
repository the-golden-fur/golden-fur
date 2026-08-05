import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getCageOccupancyReport } from '../../api/reports.api';
import type { CageOccupancyRow } from '../../reports.types';
import styles from './CageOccupancyReport.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

const SIZE_ORDER: CageOccupancyRow['size'][] = ['S', 'M', 'L', 'XL'];

const STATUS_TOKEN: Record<CageOccupancyRow['status'], string> = {
  Available: styles.statusAvailable,
  Occupied: styles.statusOccupied,
  Reserved: styles.statusReserved,
  'Under Maintenance': styles.statusMaintenance,
};

/**
 * Issue #105: real-time cage occupancy view, grouped by size category and
 * reusing the existing --color-cage-status-* token set (Sprint 4 Epic A,
 * #79) unchanged - the same visual language as the Hotel module's own cage
 * grid rather than a report-specific palette.
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
              <h2 className={styles.sizeTitle}>{size}</h2>
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
    </main>
  );
}
