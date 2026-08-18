import { getSupabaseClient } from '../../../shared/auth/api/auth.api';
import type {
  BranchAvailabilityPayload,
  BranchSummary,
  Breed,
  CreateBreedPayload,
  CreatePackagePayload,
  CreatePromoPayload,
  CreateServicePayload,
  CreateServiceTypePayload,
  Package,
  PackageBranchAvailability,
  PackagePricingConfiguration,
  PetType,
  PricingConfiguration,
  Promo,
  PromoCapConfiguration,
  Service,
  ServiceBranchAvailability,
  ServiceType,
  ServiceTypeBranchAvailability,
  UpdateBreedPayload,
  UpdatePackagePayload,
  UpdatePackagePricingConfigurationPayload,
  UpdatePricingConfigurationPayload,
  UpdatePromoPayload,
  UpdateServicePayload,
  UpdateServiceTypePayload,
  UpsertPromoCapConfigurationPayload,
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

/** Soft: moves the package to the archive. Server still requires
 * is_active === false first (see packages.service.ts's archivePackage
 * guard). */
export async function setPackageBranchAvailability(
  packageId: string,
  accessToken: string,
  payload: BranchAvailabilityPayload
): Promise<MaintenanceApiResult<PackageBranchAvailability>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/${packageId}/branch-availability`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ availability: PackageBranchAvailability }>(
    response
  );
  return { data: result.data?.availability ?? null, error: result.error };
}

export async function archivePackage(
  packageId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/${packageId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restorePackage(
  packageId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/${packageId}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedPackages(
  accessToken: string
): Promise<MaintenanceApiResult<Package[]>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/archived`,
    {
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ packages: Package[] }>(response);
  return { data: result.data?.packages ?? null, error: result.error };
}

export async function hardDeletePackage(
  packageId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/packages/${packageId}/permanent`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
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

/** Soft: moves the promo to the archive. Server still requires
 * is_active === false first (see promos.service.ts's archivePromo guard). */
export async function archivePromo(
  promoId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promos/${promoId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restorePromo(
  promoId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promos/${promoId}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedPromos(
  accessToken: string
): Promise<MaintenanceApiResult<Promo[]>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/promos/archived`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ promos: Promo[] }>(response);
  return { data: result.data?.promos ?? null, error: result.error };
}

export async function hardDeletePromo(
  promoId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promos/${promoId}/permanent`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

/** Epic B (#80/#81): the shared, singleton grooming size/coat calculation. */
export async function getPricingConfiguration(
  accessToken: string
): Promise<MaintenanceApiResult<PricingConfiguration>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/pricing-configuration`,
    {
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ configuration: PricingConfiguration }>(
    response
  );
  return { data: result.data?.configuration ?? null, error: result.error };
}

export async function updatePricingConfiguration(
  accessToken: string,
  payload: UpdatePricingConfigurationPayload
): Promise<MaintenanceApiResult<PricingConfiguration>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/pricing-configuration`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ configuration: PricingConfiguration }>(
    response
  );
  return { data: result.data?.configuration ?? null, error: result.error };
}

/** Epic B (#82/#83): the shared, singleton package bundled-price calculation. */
export async function getPackagePricingConfiguration(
  accessToken: string
): Promise<MaintenanceApiResult<PackagePricingConfiguration>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/package-pricing-configuration`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{
    configuration: PackagePricingConfiguration;
  }>(response);
  return { data: result.data?.configuration ?? null, error: result.error };
}

export async function updatePackagePricingConfiguration(
  accessToken: string,
  payload: UpdatePackagePricingConfigurationPayload
): Promise<MaintenanceApiResult<PackagePricingConfiguration>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/package-pricing-configuration`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{
    configuration: PackagePricingConfiguration;
  }>(response);
  return { data: result.data?.configuration ?? null, error: result.error };
}

/** Epic B (#84): one row per branch plus one system-wide default (NULL branch_id). */
export async function listPromoCapConfigurations(
  accessToken: string
): Promise<MaintenanceApiResult<PromoCapConfiguration[]>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promo-cap-configurations`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ configurations: PromoCapConfiguration[] }>(
    response
  );
  return { data: result.data?.configurations ?? null, error: result.error };
}

export async function upsertPromoCapConfiguration(
  accessToken: string,
  payload: UpsertPromoCapConfigurationPayload
): Promise<MaintenanceApiResult<PromoCapConfiguration>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/promo-cap-configurations`,
    {
      method: 'PUT',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ configuration: PromoCapConfiguration }>(
    response
  );
  return { data: result.data?.configuration ?? null, error: result.error };
}

/**
 * Epic A follow-up: breeds admin management (previously seed-only, no CRUD
 * anywhere). Distinct from listBreeds() in customers/api/customer.api.ts,
 * which reads directly via Supabase for the pet-form's BreedSelect - this
 * one goes through the new Express /maintenance/breeds routes, matching
 * every other maintenance (catalog) resource in this file.
 */
export async function listBreedsAdmin(
  accessToken: string,
  petType?: PetType
): Promise<MaintenanceApiResult<Breed[]>> {
  const query = petType ? `?pet_type=${petType}` : '';
  const response = await fetch(`${API_BASE_URL}/maintenance/breeds${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ breeds: Breed[] }>(response);
  return { data: result.data?.breeds ?? null, error: result.error };
}

export async function createBreedAdmin(
  accessToken: string,
  payload: CreateBreedPayload
): Promise<MaintenanceApiResult<Breed>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/breeds`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ breed: Breed }>(response);
  return { data: result.data?.breed ?? null, error: result.error };
}

export async function updateBreedAdmin(
  breedId: string,
  accessToken: string,
  payload: UpdateBreedPayload
): Promise<MaintenanceApiResult<Breed>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/breeds/${breedId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ breed: Breed }>(response);
  return { data: result.data?.breed ?? null, error: result.error };
}

export async function deleteBreedAdmin(
  breedId: string,
  accessToken: string
): Promise<MaintenanceApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/breeds/${breedId}`,
    {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

/** Custom change: Service Types admin CRUD. */
export async function listServiceTypes(
  accessToken: string
): Promise<MaintenanceApiResult<ServiceType[]>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/service-types`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ service_types: ServiceType[] }>(response);
  return { data: result.data?.service_types ?? null, error: result.error };
}

export async function createServiceType(
  accessToken: string,
  payload: CreateServiceTypePayload
): Promise<MaintenanceApiResult<ServiceType>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/service-types`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ service_type: ServiceType }>(response);
  return { data: result.data?.service_type ?? null, error: result.error };
}

export async function updateServiceType(
  serviceTypeId: string,
  accessToken: string,
  payload: UpdateServiceTypePayload
): Promise<MaintenanceApiResult<ServiceType>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/service-types/${serviceTypeId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ service_type: ServiceType }>(response);
  return { data: result.data?.service_type ?? null, error: result.error };
}

export async function setServiceTypeBranchAvailability(
  serviceTypeId: string,
  accessToken: string,
  payload: BranchAvailabilityPayload
): Promise<MaintenanceApiResult<ServiceTypeBranchAvailability>> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/service-types/${serviceTypeId}/branch-availability`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{
    availability: ServiceTypeBranchAvailability;
  }>(response);
  return { data: result.data?.availability ?? null, error: result.error };
}
