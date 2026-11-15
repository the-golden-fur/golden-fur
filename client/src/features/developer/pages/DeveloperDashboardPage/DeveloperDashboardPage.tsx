import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { getDeveloperStats } from '../../api/developer.api';
import { DEVELOPER_DASHBOARD_ROLES } from '../../developer.types';
import type { DeveloperStats } from '../../developer.types';
import styles from './DeveloperDashboardPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

/**
 * Developer (+ Superadmin) only - total/deactivated customer and staff
 * account counts, and how many bug reports still need attention. Gated the
 * same way the server route is (requireRole(BUG_REPORT_MANAGER_ROLES)),
 * mirroring AnalyticsDashboardPage's stat-card shape.
 */
export function DeveloperDashboardPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [stats, setStats] = useState<DeveloperStats | null>(null);
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

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && DEVELOPER_DASHBOARD_ROLES.includes(viewerRole);

  useEffect(() => {
    if (!isAllowedViewer || !accessToken) return;

    let isMounted = true;

    void getDeveloperStats(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load the dashboard.');
        return;
      }

      setStats(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [isAllowedViewer, accessToken]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Developer Dashboard</h1>
      <p className={styles.copy}>Account counts across every branch.</p>

      {isLoading ? (
        <LoadingState label="Loading dashboard..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : stats ? (
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Total Customers</span>
            <span className={styles.cardValue}>{stats.total_customers}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Deactivated Customers</span>
            <span className={styles.cardValue}>
              {stats.deactivated_customers}
            </span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Total Staff</span>
            <span className={styles.cardValue}>{stats.total_staff}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Deactivated Staff</span>
            <span className={styles.cardValue}>{stats.deactivated_staff}</span>
          </div>
          <Link to="/staff/developer/bug-reports" className={styles.card}>
            <span className={styles.cardLabel}>Pending Bug Reports</span>
            <span className={styles.cardValue}>
              {stats.pending_bug_reports}
            </span>
          </Link>
        </div>
      ) : null}
    </main>
  );
}
