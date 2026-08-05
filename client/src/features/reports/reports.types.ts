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
  customer_id: string;
  branch_id: string;
  transaction_type: string;
  payment_method: string;
  payment_status: string;
  total_amount: number;
  misc_sale_description: string | null;
  created_at: string;
  bookings: { pet_id: string; service_category: string } | null;
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
