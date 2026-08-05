import { Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { DailySalesReportPage } from './pages/DailySalesReportPage/DailySalesReportPage';
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage/AnalyticsDashboardPage';
import { CageOccupancyReport } from './components/CageOccupancyReport/CageOccupancyReport';
import { TransactionHistoryTable } from './components/TransactionHistoryTable/TransactionHistoryTable';

/**
 * Issues #104/#105: role enforcement for every reports page happens
 * server-side (Admin/Supervisor/Superadmin for DSR/cage-occupancy/
 * transaction-history, Superadmin-only for analytics - reports.routes.ts);
 * each page additionally gates itself client-side (Navigate away for a
 * disallowed viewer), matching MiscSaleManagementPage's own precedent.
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
  </Fragment>
);
