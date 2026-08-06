import type {
  AnalyticsSummary,
  CageOccupancyRow,
  DailySalesReport,
  TransactionRecord,
} from '../reports.types';

interface ReportsApiResult<T> {
  data: T | null;
  error: string | null;
}

// reports.routes.ts (server) is mounted at the server root, same as
// billing.routes.ts / hotel.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<ReportsApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getDailySalesReport(
  reportDate: string,
  branchId: string | null,
  accessToken: string
): Promise<ReportsApiResult<DailySalesReport>> {
  const params = new URLSearchParams({ report_date: reportDate });
  if (branchId) params.set('branch_id', branchId);

  const response = await fetch(
    `${API_BASE_URL}/reports/dsr?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ report: DailySalesReport }>(response);
  return { data: result.data?.report ?? null, error: result.error };
}

export async function getCageOccupancyReport(
  branchId: string | null,
  accessToken: string
): Promise<ReportsApiResult<CageOccupancyRow[]>> {
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', branchId);
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(
    `${API_BASE_URL}/reports/cage-occupancy${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ rows: CageOccupancyRow[] }>(response);
  return { data: result.data?.rows ?? null, error: result.error };
}

export interface TransactionHistoryFilters {
  branchId?: string;
  customerId?: string;
  petId?: string;
  dateFrom?: string;
  dateTo?: string;
  serviceCategory?: string;
}

export async function getTransactionHistory(
  filters: TransactionHistoryFilters,
  accessToken: string
): Promise<ReportsApiResult<TransactionRecord[]>> {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branch_id', filters.branchId);
  if (filters.customerId) params.set('customer_id', filters.customerId);
  if (filters.petId) params.set('pet_id', filters.petId);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.serviceCategory)
    params.set('service_category', filters.serviceCategory);
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(
    `${API_BASE_URL}/reports/transaction-history${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ transactions: TransactionRecord[] }>(
    response
  );
  return { data: result.data?.transactions ?? null, error: result.error };
}

export async function getAnalyticsSummary(
  timeFilter: string,
  branchId: string | null,
  accessToken: string
): Promise<ReportsApiResult<AnalyticsSummary>> {
  const params = new URLSearchParams({ time_filter: timeFilter });
  if (branchId) params.set('branch_id', branchId);

  const response = await fetch(
    `${API_BASE_URL}/reports/analytics?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ summary: AnalyticsSummary }>(response);
  return { data: result.data?.summary ?? null, error: result.error };
}
