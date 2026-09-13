import type { DeletedRecordArchiveEntry } from '../staff.types';

interface RecordsArchiveApiResult<T> {
  data: T | null;
  error: string | null;
}

// Mounted under /staff (staff.routes.ts's own prefix), not a separate one.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<RecordsArchiveApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export interface ListDeletedRecordsParams {
  table?: string;
  search?: string;
  from?: string;
  to?: string;
  sort?: 'deleted_at_desc' | 'deleted_at_asc';
  page?: number;
  pageSize?: number;
}

export interface ListDeletedRecordsResult {
  rows: DeletedRecordArchiveEntry[];
  total: number;
}

export async function listDeletedRecords(
  accessToken: string,
  params: ListDeletedRecordsParams = {}
): Promise<RecordsArchiveApiResult<ListDeletedRecordsResult>> {
  const query = new URLSearchParams();
  if (params.table) query.set('table', params.table);
  if (params.search) query.set('search', params.search);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('page_size', String(params.pageSize));

  const response = await fetch(
    `${API_BASE_URL}/staff/deleted-records?${query.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<ListDeletedRecordsResult>(response);
}

export async function listDeletedRecordTables(
  accessToken: string
): Promise<RecordsArchiveApiResult<string[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/deleted-records/tables`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ tables: string[] }>(response);
  return { data: result.data?.tables ?? null, error: result.error };
}

export async function restoreDeletedRecord(
  accessToken: string,
  id: string
): Promise<RecordsArchiveApiResult<DeletedRecordArchiveEntry>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/deleted-records/${id}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ entry: DeletedRecordArchiveEntry }>(
    response
  );
  return { data: result.data?.entry ?? null, error: result.error };
}

export async function purgeDeletedRecord(
  accessToken: string,
  id: string
): Promise<RecordsArchiveApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/staff/deleted-records/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}
