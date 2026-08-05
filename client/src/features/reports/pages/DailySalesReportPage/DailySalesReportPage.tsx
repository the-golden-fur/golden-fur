import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getDailySalesReport } from '../../api/reports.api';
import type { DailySalesReport } from '../../reports.types';
import styles from './DailySalesReportPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Issue #104: Daily Sales Report - breakdown table with a totals row, a
 * distinct miscellaneous-sales section (AC-2, never merged into the
 * service-type breakdown), a branch toggle visible only to Superadmin
 * (Admin/Supervisor see their own branch with no toggle, mirroring #103's
 * server-side restriction as a client-level gate too - defense in depth,
 * not solely a client-side check), a date filter, and a dedicated print
 * stylesheet (@media print in the CSS module) rather than relying on the
 * browser's default print rendering of the screen layout.
 */
export function DailySalesReportPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [reportDate, setReportDate] = useState(today());

  const [report, setReport] = useState<DailySalesReport | null>(null);
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

    void getDailySalesReport(reportDate, branchId, accessToken).then(
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
    reportDate,
  ]);

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <h1 className={styles.title}>Daily Sales Report</h1>

        <label className={styles.field}>
          Date
          <input
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
          />
        </label>

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
        <p className={styles.copy}>Loading report...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : report ? (
        <div className={styles.reportContent}>
          <section>
            <h2 className={styles.sectionTitle}>Service Breakdown</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Service Category</th>
                  <th>Payment Method</th>
                  <th>Transactions</th>
                  <th>Gross Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.breakdown.map((row, index) => (
                  <tr
                    key={`${row.service_category}-${row.payment_method}-${index}`}
                  >
                    <td>{row.service_category}</td>
                    <td>{row.payment_method}</td>
                    <td>{row.transaction_count}</td>
                    <td>₱{row.gross_amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className={styles.totalsRow}>
                  <td colSpan={2}>Total</td>
                  <td>{report.totals.transaction_count}</td>
                  <td>₱{report.totals.gross_amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Credit Usage</h2>
            <p className={styles.copy}>
              {report.credit_usage.transaction_count} redemption(s) - ₱
              {report.credit_usage.total_credit_applied.toFixed(2)} applied.
            </p>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Miscellaneous Sales</h2>
            {report.misc_sales.length === 0 ? (
              <p className={styles.copy}>No miscellaneous sales today.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Payment Method</th>
                    <th>Transactions</th>
                    <th>Gross Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.misc_sales.map((row) => (
                    <tr key={row.payment_method}>
                      <td>{row.payment_method}</td>
                      <td>{row.transaction_count}</td>
                      <td>₱{row.gross_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className={styles.totalsRow}>
                    <td>Total</td>
                    <td></td>
                    <td>₱{report.misc_sales_total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
