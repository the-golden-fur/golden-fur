import type { Transaction } from '../billing/billing.types.ts';
import type {
  BookingStatus,
  ServiceCategory,
} from '../booking/booking.types.ts';

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

/** Custom change (Trends page): same audience as the DSR - Admin/Supervisor
 * for their own branch, Superadmin for any branch or all of them. Kept as
 * its own name so Trends can be widened/narrowed without touching the DSR. */
export const TRENDS_READ_ROLES: readonly string[] = REPORTS_READ_ROLES;

export interface TrendsCountRow {
  name: string;
  count: number;
}

export interface TrendsStaffRow {
  /** null for the per-role 'Unassigned' row. */
  staff_id: string | null;
  display_name: string;
  role: 'Groomer' | 'Veterinarian';
  bookings: number;
  completed: number;
}

/** Shape of get_trends() (20261021276). Maps are keyed by category/pet
 * type/archive reason; lists come already sorted. */
export interface TrendsReport {
  bookings_total: number;
  bookings_by_category: Record<string, number>;
  bookings_by_pet_type: Record<string, number>;
  registered_pets_by_type: Record<string, number>;
  new_pets_by_type: Record<string, number>;
  packages_booked: TrendsCountRow[];
  top_grooming_services: TrendsCountRow[];
  staff_bookings: TrendsStaffRow[];
  deleted_pet_reasons: Record<string, number>;
  deleted_pet_other_notes: { note: string; archived_at: string }[];
}

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

/** Custom change (Booking Activity Report): bookings, check-ins, check-outs,
 * no-shows and lates for a date range - reuses REPORTS_READ_ROLES rather
 * than a dedicated role list since the viewer set is identical to the DSR's. */
export interface BookingActivityRecord {
  id: string;
  branch_id: string;
  customer_name: string | null;
  pet_name: string | null;
  service_category: ServiceCategory;
  scheduled_start: string;
  scheduled_end: string;
  status: BookingStatus;
  /** Set once the booking is checked in (status moves to 'In Progress') -
   * null means it never has been, regardless of its current status. */
  started_at: string | null;
  /** Set once the booking is checked out (status 'Completed'). */
  completed_at: string | null;
}

export interface BookingActivityTotals {
  total_bookings: number;
  pending: number;
  late: number;
  checked_in: number;
  checked_out: number;
  no_show: number;
  cancelled: number;
}

export interface BookingActivityReport {
  branch_id: string | null;
  date_from: string;
  date_to: string;
  totals: BookingActivityTotals;
  records: BookingActivityRecord[];
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
