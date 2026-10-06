/** Client mirror of the server's reports.types.ts shapes. */
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

export interface TransactionRecord {
  id: string;
  booking_id: string | null;
  /** Set instead of booking_id for a multi-booking checkout transaction
   * (exactly one of the two is ever non-null) - see
   * checkoutAggregation.service.ts. */
  booking_group_id: string | null;
  customer_id: string;
  /** The owner's display name (customer_profiles.full_name), resolved
   * server-side by listTransactionHistory. Null only if that profile row is
   * missing. Both /reports/transaction-history and /my-transaction-history
   * now send this. */
  customer_name: string | null;
  branch_id: string;
  transaction_type: string;
  payment_method: string;
  payment_status: string;
  /** 'full' | 'downpayment' | 'balance' | null (older rows / misc sales). */
  payment_choice: string | null;
  total_amount: number;
  misc_sale_description: string | null;
  created_at: string;
  bookings: {
    pet_id: string;
    service_category: string;
    /** The parent booking's payment-status rollup + pricing snapshot -
     * lets the transaction pages work out a partly-paid booking's
     * remaining balance for the "add a balance payment" action. */
    payment_status: string;
    total_price: number;
    discount_amount: number;
    promo_amount: number;
    /** Labels a booking group on the staff Transactions page's "Group by:
     * Booking" view. Optional so older fixtures/callers stay valid. */
    scheduled_start?: string;
    pets?: { name: string } | null;
  } | null;
}

export type AnalyticsTimeFilter =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'all_time';

/** Shared by AnalyticsDashboardPage and BranchComparisonPage - the five
 * presets get_analytics_summary()/get_branch_comparison() accept. */
export const ANALYTICS_TIME_FILTERS: {
  value: AnalyticsTimeFilter;
  label: string;
}[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

export interface AnalyticsSummary {
  branch_id: string | null;
  time_filter: AnalyticsTimeFilter;
  total_revenue: number;
  booking_count: number;
  cancelled_count: number;
  cancellation_rate: number;
}

/** One branch from GET /reports/branch-comparison - one per non-archived
 * branch. *_by_category maps only carry categories with activity in the
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

export type BranchComparisonMetric =
  | 'revenue'
  | 'bookings'
  | 'avg_sale'
  | 'new_customers';
