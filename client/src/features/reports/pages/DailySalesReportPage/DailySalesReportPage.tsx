import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listBranches,
  listBranchLetterheads,
  type BranchLetterhead,
} from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  getDailySalesReport,
  getTransactionHistory,
} from '../../api/reports.api';
import type { DailySalesReport, TransactionRecord } from '../../reports.types';
import { TransactionReceiptPrintout } from '../../../../shared/components/TransactionReceiptPrintout/TransactionReceiptPrintout';
import { receiptPropsFor } from '../../components/TransactionHistoryTable/transactionReceipt';
import {
  currentReportDay,
  formatReportDay,
  isReportDay,
  shiftReportDay,
} from '../../utils/reportDay';
import styles from './DailySalesReportPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

/**
 * Issue #104: Daily Sales Report - breakdown table with a totals row, a
 * distinct miscellaneous-sales section (AC-2, never merged into the
 * service-type breakdown), a branch toggle visible only to Superadmin
 * (Admin/Supervisor see their own branch with no toggle, mirroring #103's
 * server-side restriction as a client-level gate too - defense in depth,
 * not solely a client-side check), a date filter, and a dedicated print
 * stylesheet (@media print in the CSS module) rather than relying on the
 * browser's default print rendering of the screen layout.
 *
 * Custom change (Branch Reports cards): a row of summary cards on top, each
 * comparing the selected day with the day before - the day-level take on the
 * Goals page's this-month/last-month panels - and Previous/Next day buttons
 * around the date field, like the Goals page's month picker. Both days come
 * from the same GET /reports/dsr, fetched side by side.
 *
 * Custom change (receipt print): Print no longer prints the report layout -
 * it prints one receipt per transaction the report counts (the same slip the
 * Transactions page prints), each on its own page.
 */
export function DailySalesReportPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [reportDate, setReportDate] = useState(() => currentReportDay());

  // Only for the printed receipts' letterheads.
  const [letterheads, setLetterheads] = useState<Map<string, BranchLetterhead>>(
    () => new Map()
  );
  const [isPrinting, setIsPrinting] = useState(false);

  // Tagged with what it was fetched for, so "loading" is derived (result is
  // for a different day/branch) rather than set inside the effect - same
  // pattern as GoalsPage.
  const [result, setResult] = useState<{
    day: string;
    branchId: string | null;
    report: DailySalesReport | null;
    previous: DailySalesReport | null;
    /** The day's transactions the report counts, oldest first - what Print
     * prints. */
    receipts: TransactionRecord[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((staffResult) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = staffResult.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
      setViewerBranchId(self?.branch_id ?? null);
    });

    void listBranches().then((branchesResult) => {
      if (isMounted && branchesResult.data) setBranches(branchesResult.data);
    });

    void listBranchLetterheads().then((letterheadsResult) => {
      if (isMounted && letterheadsResult.data) {
        setLetterheads(
          new Map(letterheadsResult.data.map((branch) => [branch.id, branch]))
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  const isSuperadmin = viewerRole === 'Superadmin';
  const branchId = isSuperadmin ? selectedBranchId || null : viewerBranchId;

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void Promise.all([
      getDailySalesReport(reportDate, branchId, accessToken),
      getDailySalesReport(
        shiftReportDay(reportDate, -1),
        branchId,
        accessToken
      ),
      getTransactionHistory(
        {
          branchId: branchId ?? undefined,
          dateFrom: reportDate,
          dateTo: reportDate,
        },
        accessToken
      ),
    ]).then(([current, previous, history]) => {
      if (!isMounted) return;

      setResult({
        day: reportDate,
        branchId,
        report: current.data,
        // A failed previous-day fetch only drops the comparison line.
        previous: previous.error ? null : previous.data,
        // The report only counts settled transactions (both booking payments
        // and misc sales) - print the same set. A failed fetch only leaves
        // nothing to print.
        receipts: (history.data ?? [])
          .filter((transaction) => transaction.payment_status === 'Fully Paid')
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        error: current.error,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer, branchId, reportDate]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? 'All branches';

  const isLoading = result?.day !== reportDate || result?.branchId !== branchId;
  const report = isLoading ? null : (result?.report ?? null);
  const previous = isLoading ? null : (result?.previous ?? null);
  const error = isLoading ? null : (result?.error ?? null);
  const receipts = isLoading ? [] : (result?.receipts ?? []);

  function printReceipts() {
    // The sheets have to be in the page before the print dialog opens, so
    // their render is flushed rather than left for the next paint.
    flushSync(() => setIsPrinting(true));
    window.print();
  }

  const today = currentReportDay();
  const isToday = reportDate === today;
  const previousLabel = isToday
    ? 'Yesterday'
    : formatReportDay(shiftReportDay(reportDate, -1), { withYear: false });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>
            Branch Reports · {formatReportDay(reportDate)}
          </p>
          <h1 className={styles.title}>Daily Sales Report</h1>
        </div>

        <div className={styles.controls}>
          <div className={styles.field}>
            <label htmlFor="dsr-date">Date</label>
            <div className={styles.dayPicker}>
              <button
                type="button"
                className={styles.dayStep}
                onClick={() => setReportDate(shiftReportDay(reportDate, -1))}
                aria-label="Previous day"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <input
                id="dsr-date"
                className={styles.control}
                type="date"
                max={today}
                value={reportDate}
                onChange={(event) => {
                  // Clearing the field gives '', which isn't a day to load.
                  if (isReportDay(event.target.value)) {
                    setReportDate(event.target.value);
                  }
                }}
              />
              <button
                type="button"
                className={styles.dayStep}
                onClick={() => setReportDate(shiftReportDay(reportDate, 1))}
                disabled={reportDate >= today}
                aria-label="Next day"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

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
            onClick={printReceipts}
            disabled={receipts.length === 0}
            title={
              receipts.length === 0
                ? 'No paid transactions to print for this day'
                : undefined
            }
          >
            Print
          </button>
        </div>
      </header>

      {isLoading ? (
        <LoadingState label="Loading report..." />
      ) : error || !report ? (
        <p className={styles.errorBanner} role="alert">
          {error ?? 'Could not load the report.'}
        </p>
      ) : (
        <div className={styles.reportContent}>
          <section className={styles.cards} aria-label="Day summary">
            <SummaryCard
              label="Total sales"
              value={report.totals.gross_amount}
              previous={previous?.totals.gross_amount}
              previousLabel={previousLabel}
              format={formatCurrency}
            />
            <SummaryCard
              label="Transactions"
              value={report.totals.transaction_count}
              previous={previous?.totals.transaction_count}
              previousLabel={previousLabel}
            />
            <SummaryCard
              label="Credit applied"
              value={report.credit_usage.total_credit_applied}
              previous={previous?.credit_usage.total_credit_applied}
              previousLabel={previousLabel}
              format={formatCurrency}
              // More credit redeemed isn't good or bad news - show the change
              // without the green/red.
              neutral
            />
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Service Breakdown</h2>
            <div className={styles.tableWrap}>
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
            </div>
          </section>

          <div className={styles.split}>
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Credit Usage</h2>
              <p className={styles.copy}>
                {report.credit_usage.transaction_count} redemption(s) - ₱
                {report.credit_usage.total_credit_applied.toFixed(2)} applied.
              </p>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Miscellaneous Sales</h2>
              {report.misc_sales.length === 0 ? (
                <p className={styles.copy}>
                  {isToday
                    ? 'No miscellaneous sales today.'
                    : 'No miscellaneous sales on this day.'}
                </p>
              ) : (
                <div className={styles.tableWrap}>
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
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {isPrinting
        ? receipts.map((transaction) => (
            <TransactionReceiptPrintout
              key={transaction.id}
              {...receiptPropsFor(
                transaction,
                letterheads.get(transaction.branch_id)
              )}
              onDone={() => setIsPrinting(false)}
            />
          ))
        : null}
    </main>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  /** Undefined when the previous day couldn't be loaded - the card then
   * shows just the day's own figure. */
  previous: number | undefined;
  previousLabel: string;
  format?: (value: number) => string;
  neutral?: boolean;
}

/** One headline figure for the selected day, with the day before under it
 * and the change between them. */
function SummaryCard({
  label,
  value,
  previous,
  previousLabel,
  format = (amount) => amount.toLocaleString(),
  neutral = false,
}: SummaryCardProps) {
  // PG numeric columns can arrive as strings - same coercion formatCurrency does.
  const current = Number(value) || 0;
  const before = previous === undefined ? null : Number(previous) || 0;

  let change: { text: string; trend: 'up' | 'down' | 'flat' } | null = null;
  if (before !== null) {
    if (current === before) {
      change = { text: 'No change', trend: 'flat' };
    } else if (before === 0) {
      change = { text: 'New', trend: 'up' };
    } else {
      const percent = Math.round(((current - before) / before) * 100);
      change = {
        text: `${percent > 0 ? '+' : ''}${percent}%`,
        trend: current > before ? 'up' : 'down',
      };
    }
  }

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{format(current)}</span>
      {before !== null && change ? (
        <span className={styles.cardCompare}>
          <span
            className={styles.change}
            data-trend={neutral ? 'flat' : change.trend}
          >
            {change.text}
          </span>
          <span>
            {previousLabel} {format(before)}
          </span>
        </span>
      ) : null}
    </div>
  );
}
