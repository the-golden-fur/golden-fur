import type { Transaction } from '../billing/billing.types.ts';

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

/** Custom change (transaction history visibility): DSR/cage-occupancy stay
 * REPORTS_READ_ROLES-only, but Transaction History also opens to Cashier -
 * matching the client's own ALLOWED_VIEWER_ROLES in
 * TransactionHistoryTable.tsx, which already assumed this and was 403ing
 * against the server's narrower list. */
export const TRANSACTION_HISTORY_READ_ROLES: readonly string[] = [
  ...REPORTS_READ_ROLES,
  'Cashier',
  'Front Desk',
];

/** Custom change (occupied/vacant cages view for Receptionist): cage
 * occupancy stays read-only and real-time either way, so opening it to
 * Receptionist (who already reads the live cage grid via GET /hotel/cages
 * for check-in) doesn't touch DSR/analytics, which stay REPORTS_READ_ROLES-
 * only. */
export const CAGE_OCCUPANCY_READ_ROLES: readonly string[] = [
  ...REPORTS_READ_ROLES,
  'Receptionist',
  'Front Desk',
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

/** A transaction-history row plus the owner's display name, resolved by
 * listTransactionHistory in one batched lookup. customer_name is null only
 * when the referenced customer_profiles row is somehow missing. */
export interface TransactionHistoryRecord extends Transaction {
  customer_name: string | null;
  /** The bill's itemized lines (transaction_line_items) - for the receipt. */
  transaction_line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export interface TransactionHistoryFilters {
  branchId?: string;
  customerId?: string;
  petId?: string;
  dateFrom?: string;
  dateTo?: string;
  serviceCategory?: string;
  /** 'booking_payment' | 'miscellaneous_sale' - the transactions.transaction_type enum. */
  transactionType?: string;
  /** 'full' | 'downpayment' | 'balance' - transactions.payment_choice (the
   * advisor's "downpayment, full, etc." on the transactions page). NULL on
   * older rows and misc sales, so this filter also narrows to booking
   * payments. */
  paymentChoice?: string;
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

/** Custom change (Branch Comparison page): Superadmin-only, same as
 * analytics - it exposes every branch's figures at once. */
export const BRANCH_COMPARISON_READ_ROLES: readonly string[] = ['Superadmin'];

/** One element of get_branch_comparison()'s array - one per non-archived
 * branch. The *_by_category maps only carry categories with activity in the
 * period; a missing key means zero. */
export interface BranchComparisonRow {
  branch_id: string;
  branch_name: string;
  revenue_total: number;
  revenue_by_category: Record<string, number>;
  counter_sales: number;
  paid_transaction_count: number;
  bookings_availed_total: number;
  bookings_availed_by_category: Record<string, number>;
  new_customers: number;
}

/** Custom change (Goals page): Superadmin-only, read and configure alike. */
export const GOALS_ROLES: readonly string[] = ['Superadmin'];

/** One period's block of get_goal_stats() (20261011258). */
export interface GoalPeriodStats {
  appointments: number;
  by_category: Record<string, number>;
  revenue: number;
  /** Booking payments only - counter sales belong to no service. */
  revenue_by_category: Record<string, number>;
  new_customers: number;
  packages: Record<string, number>;
}

export interface GoalStats {
  current: GoalPeriodStats;
  previous: GoalPeriodStats;
}

/** One goal line: a metric's actual for the selected month, the month
 * before, and the goal it's measured against. */
export interface GoalRow {
  /** metric_key - what a saved growth rate/target is stored under. */
  key: string;
  label: string;
  actual: number;
  previous: number;
  goal: number;
  /** 'target' = an exact number typed for this month; 'growth' = previous
   * month + growth_rate %. */
  goal_source: 'target' | 'growth';
  growth_rate: number;
  target: number | null;
}

export interface GoalsReport {
  /** YYYY-MM */
  month: string;
  branch_id: string | null;
  appointments: GoalRow;
  services: GoalRow[];
  revenue: GoalRow;
  revenue_services: GoalRow[];
  new_customers: GoalRow;
  packages: GoalRow[];
}
