/** Admin/Supervisor see their own branch only; Superadmin gets the
 * toggle/combined option - enforced at the application layer in each
 * service, in addition to whatever get_daily_sales_report()/
 * get_cage_occupancy_report() do server-side (defense in depth, matching
 * every prior epic's RLS-plus-application-check convention). */
export const REPORTS_READ_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
];

/** Modules-Features is explicit the analytics dashboard is Superadmin-only,
 * distinct from the DSR which Admin/Supervisor can also see for their own
 * branch (Issue #103 dev notes). */
export const ANALYTICS_READ_ROLES: readonly string[] = ['Superadmin'];

export interface DailySalesReportBreakdownRow {
  service_category: string;
  payment_method: string;
  transaction_count: number;
  gross_amount: number;
}

export interface DailySalesReportTotals {
  transaction_count: number;
  gross_amount: number;
}

export interface DailySalesReportCreditUsage {
  transaction_count: number;
  total_credit_applied: number;
}

export interface DailySalesReportMiscSaleRow {
  payment_method: string;
  transaction_count: number;
  gross_amount: number;
}

export interface DailySalesReport {
  branch_id: string | null;
  report_date: string;
  breakdown: DailySalesReportBreakdownRow[];
  totals: DailySalesReportTotals;
  credit_usage: DailySalesReportCreditUsage;
  misc_sales: DailySalesReportMiscSaleRow[];
  misc_sales_total: number;
}

export interface CageOccupancyRow {
  size: 'S' | 'M' | 'L' | 'XL';
  status: 'Available' | 'Occupied' | 'Reserved' | 'Under Maintenance';
  cage_count: number;
}

export interface TransactionHistoryFilters {
  branchId?: string;
  customerId?: string;
  petId?: string;
  dateFrom?: string;
  dateTo?: string;
  serviceCategory?: string;
}

export type AnalyticsTimeFilter =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'all_time';

export interface AnalyticsSummary {
  branch_id: string | null;
  time_filter: AnalyticsTimeFilter;
  total_revenue: number;
  booking_count: number;
  cancelled_count: number;
  cancellation_rate: number;
}
