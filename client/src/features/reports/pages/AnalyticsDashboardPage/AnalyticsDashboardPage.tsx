import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getAnalyticsSummary } from '../../api/reports.api';
import type {
  AnalyticsSummary,
  AnalyticsTimeFilter,
} from '../../reports.types';
import styles from './AnalyticsDashboardPage.module.css';

const TIME_FILTERS: { value: AnalyticsTimeFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

/**
 * Issue #104: revenue/bookings/cancellation-rate cards + time-filter
 * selector. Gated Superadmin-only at the route level, mirroring #103's
 * server-side restriction - defense in depth, not solely a client-side
 * check.
 */
export function AnalyticsDashboardPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [timeFilter, setTimeFilter] = useState<AnalyticsTimeFilter>('today');

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
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
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!accessToken || !isSuperadmin) return;

    let isMounted = true;

    void getAnalyticsSummary(
      timeFilter,
      selectedBranchId || null,
      accessToken
    ).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSummary(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isSuperadmin, selectedBranchId, timeFilter]);

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isSuperadmin || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <h1 className={styles.title}>Analytics Dashboard</h1>

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

        <label className={styles.field}>
          Time period
          <select
            value={timeFilter}
            onChange={(event) =>
              setTimeFilter(event.target.value as AnalyticsTimeFilter)
            }
          >
            {TIME_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading analytics...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : summary ? (
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Total Revenue</span>
            <span className={styles.cardValue}>
              ₱{summary.total_revenue.toFixed(2)}
            </span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Bookings</span>
            <span className={styles.cardValue}>{summary.booking_count}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Cancellation Rate</span>
            <span className={styles.cardValue}>
              {summary.cancellation_rate}%
            </span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
