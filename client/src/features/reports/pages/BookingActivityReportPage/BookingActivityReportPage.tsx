import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getBookingActivityReport } from '../../api/reports.api';
import type { BookingActivityReport } from '../../reports.types';
import { currentReportDay, isReportDay } from '../../utils/reportDay';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import styles from './BookingActivityReportPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Booking Activity Report: bookings/check-ins/check-outs/no-shows/lates for
 * a date range - the operational counterpart to the Daily Sales Report's
 * revenue view, mirroring its role gate (Admin/Supervisor/Superadmin), branch
 * toggle (Superadmin only) and dedicated print stylesheet. 'Checked in' and
 * 'checked out' read off started_at/completed_at rather than the current
 * status alone, since a since-completed booking still counts as having been
 * checked in. Ends with a sign-off block (prepared by the current viewer, a
 * blank line for a signature, a blank line for the date) for a supervisor to
 * countersign the printed copy.
 */
export function BookingActivityReportPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [viewerDisplayName, setViewerDisplayName] = useState<string | null>(
    null
  );
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(() => currentReportDay());
  const [dateTo, setDateTo] = useState(() => currentReportDay());

  const [report, setReport] = useState<BookingActivityReport | null>(null);
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
      setViewerDisplayName(self?.display_name ?? null);
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

    void getBookingActivityReport(dateFrom, dateTo, branchId, accessToken).then(
      (result) => {
        if (!isMounted) return;

        setIsLoading(false);

        if (result.error) {
          setError(result.error);
          return;
        }

        setReport(result.data);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    isSuperadmin,
    selectedBranchId,
    viewerBranchId,
    dateFrom,
    dateTo,
  ]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Unknown branch';

  const showBranchColumn = isSuperadmin && !selectedBranchId;

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <h1 className={styles.title}>Booking Activity Report</h1>

        <label className={styles.field}>
          From
          <input
            className={styles.control}
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(event) => {
              // Clearing the field gives '', which isn't a day to load.
              if (isReportDay(event.target.value)) {
                setDateFrom(event.target.value);
              }
            }}
          />
        </label>

        <label className={styles.field}>
          To
          <input
            className={styles.control}
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(event) => {
              if (isReportDay(event.target.value)) {
                setDateTo(event.target.value);
              }
            }}
          />
        </label>

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
        ) : (
          <span className={styles.branchLabel}>
            {branchName(viewerBranchId ?? '')}
          </span>
        )}

        <button
          type="button"
          className={styles.printButton}
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      {isLoading ? (
        <LoadingState label="Loading report..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : report ? (
        <div className={styles.reportContent}>
          <section className={styles.cards}>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Total Bookings</p>
              <p className={styles.cardValue}>{report.totals.total_bookings}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Checked In</p>
              <p className={styles.cardValue}>{report.totals.checked_in}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Checked Out</p>
              <p className={styles.cardValue}>{report.totals.checked_out}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Late</p>
              <p className={styles.cardValue}>{report.totals.late}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>No-shows</p>
              <p className={styles.cardValue}>{report.totals.no_show}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Cancelled</p>
              <p className={styles.cardValue}>{report.totals.cancelled}</p>
            </div>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Bookings</h2>
            {report.records.length === 0 ? (
              <p className={styles.copy}>No bookings in this date range.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Scheduled</th>
                      <th>Customer</th>
                      <th>Pet</th>
                      <th>Service</th>
                      {showBranchColumn ? <th>Branch</th> : null}
                      <th>Status</th>
                      <th>Checked In</th>
                      <th>Checked Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.records.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDateTime(record.scheduled_start)}</td>
                        <td>{record.customer_name ?? '—'}</td>
                        <td>{record.pet_name ?? '—'}</td>
                        <td>{record.service_category}</td>
                        {showBranchColumn ? (
                          <td>{branchName(record.branch_id)}</td>
                        ) : null}
                        <td>
                          <BookingStatusBadge status={record.status} />
                        </td>
                        <td>
                          {record.started_at
                            ? formatDateTime(record.started_at)
                            : '—'}
                        </td>
                        <td>
                          {record.completed_at
                            ? formatDateTime(record.completed_at)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.signoff}>
            <p className={styles.signoffLine}>
              Prepared by: {viewerDisplayName ?? 'Staff'}
            </p>
            <div className={styles.signoffFields}>
              <div className={styles.signoffField}>
                <span className={styles.signatureLine} />
                <span className={styles.signoffFieldLabel}>Signature</span>
              </div>
              <div className={styles.signoffField}>
                <span className={styles.signatureLine} />
                <span className={styles.signoffFieldLabel}>Date</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
