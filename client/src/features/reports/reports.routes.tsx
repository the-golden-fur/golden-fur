import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { DailySalesReportPage } from './pages/DailySalesReportPage/DailySalesReportPage';
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage/AnalyticsDashboardPage';
import { CustomerTransactionHistoryPage } from './pages/CustomerTransactionHistoryPage/CustomerTransactionHistoryPage';
import { CageOccupancyReport } from './components/CageOccupancyReport/CageOccupancyReport';
import { TransactionHistoryTable } from './components/TransactionHistoryTable/TransactionHistoryTable';

/**
 * Issues #104/#105: role enforcement for every reports page happens
 * server-side (Admin/Supervisor/Superadmin for DSR/cage-occupancy,
 * +Cashier for transaction-history - TRANSACTION_HISTORY_READ_ROLES in
 * reports.routes.ts, Superadmin-only for analytics - reports.routes.ts);
 * each page additionally gates itself client-side (Navigate away for a
 * disallowed viewer), matching MiscSaleManagementPage's own precedent.
 *
 * Custom change (P-1 roadmap item: transaction history visibility) -
 * /portal/transactions is the customer-facing counterpart, wrapped in
 * CustomerAuthGuard rather than StaffAuthGuard - see
 * CustomerTransactionHistoryPage, which always calls the server's
 * customer-scoped GET /reports/my-transaction-history.
 */
export const reportsRoutes = (
  <Fragment>
    <Route element={<StaffAuthGuard />}>
      <Route path="/staff/reports/dsr" element={<DailySalesReportPage />} />
      <Route
        path="/staff/reports/analytics"
        element={<AnalyticsDashboardPage />}
      />
      <Route
        path="/staff/reports/cage-occupancy"
        element={<CageOccupancyReport />}
      />
      <Route
        path="/staff/reports/transaction-history"
        element={<TransactionHistoryTable />}
      />
    </Route>
    <Route element={<CustomerAuthGuard />}>
      <Route
        path="/portal/transactions"
        element={<CustomerTransactionHistoryPage />}
      />
    </Route>
  </Fragment>
);
