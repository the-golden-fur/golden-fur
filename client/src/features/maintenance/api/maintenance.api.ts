import { getSupabaseClient } from '../../../shared/auth/api/auth.api';
import type {
  BranchAvailabilityPayload,
  BranchSummary,
  CreatePackagePayload,
  CreatePromoPayload,
  CreateServicePayload,
  Package,
  Promo,
  Service,
  ServiceBranchAvailability,
  UpdatePackagePayload,
  UpdatePromoPayload,
  UpdateServicePayload,
} from '../maintenance.types';

interface MaintenanceApiResult<T> {
  data: T | null;
  error: string | null;
}

// maintenance.routes.ts is mounted at the server root (not under /auth),
// same as staff.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<MaintenanceApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', ...authHeaders(accessToken) };
}

/**
 * No Express endpoint exposes branches (see #26's "Branch filter labels"
 * scope note), but branches RLS grants SELECT to every authenticated user -
 * read the two rows directly via the Supabase client, the same pattern
 * UnavailabilityBlockBadge uses for staff_unavailability_blocks.
 */
export async function listBranches(): Promise<
  MaintenanceApiResult<BranchSummary[]>
> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { data: null, error: 'Supabase client is not configured.' };
  }

  const { data, error } = await supabase
    .from('branches')
    .select('id, name, is_vet_branch')
    .order('name');

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as BranchSummary[], error: null };
}

export interface ListServicesFilters {
  category?: string;
  branchId?: string;
  includeInactive?: boolean;
}

export async function listServices(
  accessToken: string,
  filters: ListServicesFilters = {}
): Promise<MaintenanceApiResult<Service[]>> {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set('category', filters.category);
  }

  if (filters.branchId) {
    params.set('branch_id', filters.branchId);
  }

  if (filters.includeInactive) {
    params.set('include_inactive', 'true');
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/maintenance/services${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ services: Service[] }>(response);
  return { data: result.data?.services ?? null, error: result.error };
}

export async function createService(
  accessToken: string,
  payload: CreateServicePayload
): Promise<MaintenanceApiResult<Service>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/services`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ service: Service }>(response);
  return { data: result.data?.service ?? null, error: result.error };
}

export async function updateService(
  serviceId: string,
  accessToken: string,
  payload: UpdateServicePayload
): Promise<MaintenanceApiResult<Service>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/services/${serviceId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ service: Service }>(response);
  return { data: result.data?.service ?? null, error: result.error };
}

export async function setServiceBranchAvailability(
  serviceId: string,
  accessToken: string,
  payload: BranchAvailabilityPayload
): Promise<MaintenanceApiResult<ServiceBranchAvailability>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/services/${serviceId}/branch-availability`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ availability: ServiceBranchAvailability }>(
    response
  );
  return { data: result.data?.availability ?? null, error: result.error };
}

export interface ListPackagesFilters {
  branchId?: string;
  includeInactive?: boolean;
}

export async function listPackages(
  accessToken: string,
  filters: ListPackagesFilters = {}
): Promise<MaintenanceApiResult<Package[]>> {
  const params = new URLSearchParams();

  if (filters.branchId) {
    params.set('branch_id', filters.branchId);
  }

  if (filters.includeInactive) {
    params.set('include_inactive', 'true');
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/maintenance/packages${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ packages: Package[] }>(response);
  return { data: result.data?.packages ?? null, error: result.error };
}

export async function createPackage(
  accessToken: string,
  payload: CreatePackagePayload
): Promise<MaintenanceApiResult<Package>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/packages`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ package: Package }>(response);
  return { data: result.data?.package ?? null, error: result.error };
}

export async function updatePackage(
  packageId: string,
  accessToken: string,
  payload: UpdatePackagePayload
): Promise<MaintenanceApiResult<Package>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/${packageId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ package: Package }>(response);
  return { data: result.data?.package ?? null, error: result.error };
}

export interface ListPromosFilters {
  branchScope?: string;
  includeInactive?: boolean;
}

export async function listPromos(
  accessToken: string,
  filters: ListPromosFilters = {}
): Promise<MaintenanceApiResult<Promo[]>> {
  const params = new URLSearchParams();

  if (filters.branchScope) {
    params.set('branch_scope', filters.branchScope);
  }

  if (filters.includeInactive) {
    params.set('include_inactive', 'true');
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/maintenance/promos${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ promos: Promo[] }>(response);
  return { data: result.data?.promos ?? null, error: result.error };
}

export async function createPromo(
  accessToken: string,
  payload: CreatePromoPayload
): Promise<MaintenanceApiResult<Promo>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/promos`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ promo: Promo }>(response);
  return { data: result.data?.promo ?? null, error: result.error };
}

export async function updatePromo(
  promoId: string,
  accessToken: string,
  payload: UpdatePromoPayload
): Promise<MaintenanceApiResult<Promo>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promos/${promoId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ promo: Promo }>(response);
  return { data: result.data?.promo ?? null, error: result.error };
}
