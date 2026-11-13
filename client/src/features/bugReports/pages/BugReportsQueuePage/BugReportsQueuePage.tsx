import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import { getCustomerProfile } from '../../../customers/api/customer.api';
import type { CustomerProfile } from '../../../customers/customer.types';
import {
  listBugReports,
  updateBugReportStatus,
} from '../../api/bugReports.api';
import {
  BUG_REPORT_CATEGORY_LABELS,
  BUG_REPORT_MANAGER_ROLES,
  BUG_REPORT_STATUS_LABELS,
  type BugReport,
  type BugReportStatus,
} from '../../bugReports.types';
import styles from './BugReportsQueuePage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

const STATUS_OPTIONS: BugReportStatus[] = [
  'pending',
  'in_progress',
  'resolved',
  'dismissed',
];

/**
 * Developer (+ Superadmin) only - every bug report/feature request
 * submitted from the mascot widget's "Report a bug / feature request"
 * option, oldest first. Mirrors CreditReviewQueuePage's shape: role-gated
 * the same way the server route is, defense in depth alongside the server's
 * own requireRole gate.
 */
export function BugReportsQueuePage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [reports, setReports] = useState<BugReport[]>([]);
  const [staffById, setStaffById] = useState<Record<string, StaffProfile>>({});
  const [customersById, setCustomersById] = useState<
    Record<string, CustomerProfile>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);

      const byId: Record<string, StaffProfile> = {};
      for (const staff of result.data ?? []) {
        byId[staff.id] = staff;
      }
      setStaffById(byId);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && BUG_REPORT_MANAGER_ROLES.includes(viewerRole);

  useEffect(() => {
    if (!isAllowedViewer || !accessToken) return;

    let isMounted = true;

    void listBugReports(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the bug reports queue.');
        return;
      }

      setLoadError(null);
      setReports(result.data);

      const customerIds = new Set(
        result.data
          .map((report) => report.reporter_customer_id)
          .filter((id): id is string => id !== null)
      );

      void Promise.all(
        Array.from(customerIds).map((id) => getCustomerProfile(id, accessToken))
      ).then((customerResults) => {
        if (!isMounted) return;

        setCustomersById((prev) => {
          const next = { ...prev };
          for (const customerResult of customerResults) {
            if (customerResult.data)
              next[customerResult.data.id] = customerResult.data;
          }
          return next;
        });
      });
    });

    return () => {
      isMounted = false;
    };
  }, [isAllowedViewer, accessToken]);

  function reporterName(report: BugReport): string {
    if (report.reporter_staff_id) {
      const staff = staffById[report.reporter_staff_id];
      return staff ? `${staff.display_name} (staff)` : 'A staff member';
    }

    if (report.reporter_customer_id) {
      const customer = customersById[report.reporter_customer_id];
      return customer ? customer.full_name : 'A customer';
    }

    return 'Unknown';
  }

  function handleStatusChange(reportId: string, status: BugReportStatus) {
    if (!accessToken) return;

    setActionError(null);
    setUpdatingId(reportId);

    void updateBugReportStatus(reportId, status, accessToken).then((result) => {
      setUpdatingId(null);

      if (result.error || !result.data) {
        setActionError(result.error ?? 'Could not update the report.');
        return;
      }

      const updated = result.data;
      setReports((prev) =>
        prev.map((report) => (report.id === updated.id ? updated : report))
      );
    });
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the bug reports queue.
          </p>
        </div>
      </main>
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
        <h1 className={styles.title}>Bug Reports & Feature Requests</h1>
        <p className={styles.copy}>
          Every report submitted from the mascot widget, oldest first.
        </p>

        {actionError ? (
          <p className={styles.errorBanner} role="alert">
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <LoadingState label="Loading bug reports..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : reports.length === 0 ? (
          <p className={styles.copy}>No reports submitted yet.</p>
        ) : (
          <div className={styles.grid}>
            {reports.map((report) => (
              <article key={report.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span
                    className={
                      report.category === 'bug'
                        ? `${styles.badge} ${styles.badgeBug}`
                        : `${styles.badge} ${styles.badgeFeature}`
                    }
                  >
                    {BUG_REPORT_CATEGORY_LABELS[report.category]}
                  </span>
                  <span className={styles.statusBadge}>
                    {BUG_REPORT_STATUS_LABELS[report.status]}
                  </span>
                </div>

                <h2 className={styles.cardTitle}>{report.title}</h2>
                <p className={styles.cardDescription}>{report.description}</p>

                <p className={styles.cardMeta}>
                  From {reporterName(report)} -{' '}
                  {new Date(report.created_at).toLocaleString()}
                </p>

                <label className={styles.statusField}>
                  <span className={styles.statusFieldLabel}>Status</span>
                  <select
                    className={styles.statusSelect}
                    value={report.status}
                    disabled={updatingId === report.id}
                    onChange={(event) =>
                      handleStatusChange(
                        report.id,
                        event.target.value as BugReportStatus
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {BUG_REPORT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
