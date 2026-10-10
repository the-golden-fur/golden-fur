import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  archivePatch,
  assertArchivedBeforeHardDelete,
} from '../../../shared/archive/archiveGuard.ts';
import type {
  Service,
  ServiceBranchAvailability,
} from '../maintenance.types.ts';
import { mergePriceCells } from '../utils/mergePriceCells.ts';
import { assertCanSetPricingMatrix } from '../utils/assertCanSetPricingMatrix.ts';
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '../modules/validators/maintenance.validator.ts';
import { getPricingConfiguration } from './pricingConfiguration.service.ts';
import { deriveGroomingMatrix } from '../utils/deriveGroomingMatrix.ts';

// service_pricing_cell_overrides (per-item weight x coat pricing) is folded
// into service_pricing_tiers by attachPricingMatrix and never returned raw.
const SERVICE_SELECT =
  '*, service_branch_availability(*), service_pricing_cell_overrides(weight_class, coat_type, price)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListServicesParams {
  category?: string;
  branchId?: string;
  includeInactive?: boolean;
  /** Archived services are hidden by default (Config-menu consistency
   * change). Callers that only resolve names for history/bundles (public
   * catalog package contents) pass includeArchived. */
  includeArchived?: boolean;
  /** Config > Archive tab - only archived rows (implies includeInactive). */
  archivedOnly?: boolean;
}

interface CreateServiceParams {
  requesterId: string;
  /** For the Superadmin-only use_pricing_matrix switch - see
   * assertCanSetPricingMatrix. */
  requesterRole?: string;
  input: CreateServiceInput;
}

interface UpdateServiceParams {
  requesterId: string;
  requesterRole?: string;
  serviceId: string;
  updates: UpdateServiceInput;
}

interface SetBranchAvailabilityParams {
  serviceId: string;
  branchId: string;
  isAvailable: boolean;
  requesterRole: string;
  requesterBranchId: string;
}

/**
 * Epic B (#80/#81): the Grooming size/coat matrix is no longer stored per
 * cell - it is derived on read from base_price + pricing_configuration and
 * attached under the same service_pricing_tiers key existing consumers
 * already read (booking.service.ts's resolveServicePrice, this feature's own
 * client pages), with a synthesized id/service_id since there is no longer a
 * real row behind each cell.
 *
 * Custom change (per-item weight x coat pricing): a cell a Superadmin set for
 * this service (service_pricing_cell_overrides) replaces the formula's price
 * for that cell (is_custom: true). The cells always start from the service's
 * own base_price, never a branch's price - with the grid on, it applies at
 * every branch.
 */
function attachPricingMatrix(
  rawService: Service,
  pricingConfiguration: Awaited<ReturnType<typeof getPricingConfiguration>>
): Service {
  const { service_pricing_cell_overrides: overrides, ...service } = rawService;

  if (service.category !== 'Grooming') {
    return { ...service, service_pricing_tiers: [] };
  }

  const matrix = mergePriceCells(
    deriveGroomingMatrix(Number(service.base_price), pricingConfiguration),
    overrides
  );

  return {
    ...service,
    service_pricing_tiers: matrix.map((cell) => ({
      id: `${service.id}:${cell.weight_class}:${cell.coat_type}`,
      service_id: service.id,
      weight_class: cell.weight_class,
      coat_type: cell.coat_type,
      price: cell.price,
      is_custom: cell.is_custom,
    })),
  };
}

/**
 * Active services by default (#40 AC-3: deactivated rows drop out of the
 * "all active services" GET); pass includeInactive for the admin list view.
 * branchId keeps only services with an is_available = true row at that
 * branch - absence of a row means "not offered there" (#39 schema).
 */
export async function listServices({
  category,
  branchId,
  includeInactive,
  includeArchived,
  archivedOnly,
}: ListServicesParams): Promise<Service[]> {
  let query = supabase.from('services').select(SERVICE_SELECT);

  if (archivedOnly) {
    query = query.not('archived_at', 'is', null);
  } else {
    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  const rawServices = (data ?? []) as Service[];
  const pricingConfiguration = await getPricingConfiguration();
  const services = rawServices.map((service) =>
    attachPricingMatrix(service, pricingConfiguration)
  );

  if (!branchId) {
    return services;
  }

  return services.filter((service) =>
    (service.service_branch_availability ?? []).some(
      (row) => row.branch_id === branchId && row.is_available
    )
  );
}

/** By-id lookup stays available for inactive rows (#40 AC-3). */
export async function getServiceById(serviceId: string): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_SELECT)
    .eq('id', serviceId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service not found');

  const pricingConfiguration = await getPricingConfiguration();

  return attachPricingMatrix(data as Service, pricingConfiguration);
}

/**
 * Creates the service and, in the same call (#40 AC-1): an is_available =
 * true service_branch_availability row for every branch. Defaulting both
 * branches to available follows the Guide's recommendation -
 * Modules-Features frames branch availability as a toggle to disable a
 * branch, not an opt-in. Epic B (#81): no pricing_tiers input anymore - the
 * Grooming matrix is derived from base_price on read.
 */
export async function createService({
  requesterId,
  requesterRole,
  input,
}: CreateServiceParams): Promise<Service> {
  assertCanSetPricingMatrix({
    requesterRole,
    next: input.use_pricing_matrix,
    current: false,
  });

  // Custom change (Daycare fee configuration follow-up): base_price isn't
  // admin-entered for Daycare - the validator requires first_hour_fee
  // instead (requireDaycareFeesOrBasePrice), so it's mirrored into
  // base_price here to satisfy the NOT NULL column and to give Daycare
  // bookings a sensible price snapshot at creation time (before the actual
  // hourly charge is known at checkout - see daycareBilling.service.ts).
  const basePrice =
    input.category === 'Daycare' ? input.first_hour_fee! : input.base_price!;

  const { data: service, error } = await supabase
    .from('services')
    .insert({
      ...input,
      base_price: basePrice,
      duration_minutes: input.duration_minutes ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !service) {
    throwWithStatus(400, error?.message ?? 'Failed to create service');
  }

  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id');

  if (branchError) throwWithStatus(400, branchError.message);

  if (branches?.length) {
    const { error: availabilityError } = await supabase
      .from('service_branch_availability')
      .insert(
        branches.map((branch) => ({
          service_id: service.id,
          branch_id: branch.id,
          is_available: true,
        }))
      );

    if (availabilityError) throwWithStatus(400, availabilityError.message);
  }

  return getServiceById(service.id);
}

/** PATCH semantics per #40 AC-2: any field editable. */
export async function updateService({
  requesterId,
  requesterRole,
  serviceId,
  updates,
}: UpdateServiceParams): Promise<Service> {
  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id, category, first_hour_fee, archived_at, use_pricing_matrix')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');
  if (existing.archived_at) {
    throwWithStatus(409, 'This service is archived - restore it to edit it');
  }

  assertCanSetPricingMatrix({
    requesterRole,
    next: updates.use_pricing_matrix,
    current: Boolean(existing.use_pricing_matrix),
  });

  // Custom change (Daycare fee configuration follow-up): keep base_price
  // mirroring first_hour_fee whenever the (possibly just-updated) category
  // is Daycare, same as createService - covers both "category changed to
  // Daycare" and "first_hour_fee changed on an existing Daycare service".
  const effectiveCategory = updates.category ?? existing.category;
  const effectiveFirstHourFee =
    updates.first_hour_fee !== undefined
      ? updates.first_hour_fee
      : existing.first_hour_fee;

  const finalUpdates =
    effectiveCategory === 'Daycare' && effectiveFirstHourFee != null
      ? { ...updates, base_price: effectiveFirstHourFee }
      : updates;

  if (Object.keys(finalUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('services')
      .update({
        ...finalUpdates,
        updated_by: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serviceId);

    if (updateError) throwWithStatus(400, updateError.message);
  }

  return getServiceById(serviceId);
}

/**
 * Per-branch availability toggle via its own endpoint (#40 AC-4).
 *
 * Custom change (unify active/available): also keeps services.is_active in
 * sync with the resulting availability set - active whenever at least one
 * branch is available, inactive when none are. This is the only place
 * is_active changes now that it is no longer independently settable via
 * updateService.
 */
export async function setServiceBranchAvailability({
  serviceId,
  branchId,
  isAvailable,
  requesterRole,
  requesterBranchId,
}: SetBranchAvailabilityParams): Promise<ServiceBranchAvailability> {
  // Admins are scoped to their own branch; Superadmins may toggle any branch.
  if (requesterRole !== 'Superadmin' && branchId !== requesterBranchId) {
    throwWithStatus(
      403,
      'Admins can only manage branch availability for their own branch'
    );
  }

  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id, archived_at')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');
  // The is_active sync below would otherwise silently un-hide an archived
  // service the moment any branch toggle is touched.
  if (existing.archived_at) {
    throwWithStatus(409, 'This service is archived - restore it first');
  }

  const { data, error } = await supabase
    .from('service_branch_availability')
    .upsert(
      { service_id: serviceId, branch_id: branchId, is_available: isAvailable },
      { onConflict: 'service_id,branch_id' }
    )
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update availability');
  }

  const { data: allRows, error: allRowsError } = await supabase
    .from('service_branch_availability')
    .select('is_available')
    .eq('service_id', serviceId);

  if (allRowsError) throwWithStatus(400, allRowsError.message);

  const { error: syncError } = await supabase
    .from('services')
    .update({ is_active: (allRows ?? []).some((row) => row.is_available) })
    .eq('id', serviceId);

  if (syncError) throwWithStatus(400, syncError.message);

  return data as ServiceBranchAvailability;
}

interface SetBranchPriceParams {
  serviceId: string;
  branchId: string;
  /** null clears the branch's own price, back to the service's base_price. */
  priceOverride: number | null;
  requesterRole: string;
}

/**
 * Sets (or clears) one branch's own price for a service - see
 * servicePriceAtBranch. Superadmin-only, re-checked here on top of the
 * route's requireRole: a price is a cross-branch business decision, unlike
 * the availability toggle above, which an Admin may flip for their own
 * branch. Only the price is written, so the branch's availability is left
 * exactly as it was - and a branch with no availability row yet gets one
 * that stays unavailable, so setting a price can never switch a service on.
 */
export async function setServiceBranchPrice({
  serviceId,
  branchId,
  priceOverride,
  requesterRole,
}: SetBranchPriceParams): Promise<ServiceBranchAvailability> {
  if (requesterRole !== 'Superadmin') {
    throwWithStatus(403, "Only a Superadmin can set a branch's own price");
  }

  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id, archived_at')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');
  if (existing.archived_at) {
    throwWithStatus(409, 'This service is archived - restore it first');
  }

  const { data: updated, error: updateError } = await supabase
    .from('service_branch_availability')
    .update({ price_override: priceOverride })
    .eq('service_id', serviceId)
    .eq('branch_id', branchId)
    .select('*')
    .maybeSingle();

  if (updateError) throwWithStatus(400, updateError.message);
  if (updated) return updated as ServiceBranchAvailability;

  const { data: inserted, error: insertError } = await supabase
    .from('service_branch_availability')
    .insert({
      service_id: serviceId,
      branch_id: branchId,
      is_available: false,
      price_override: priceOverride,
    })
    .select('*')
    .maybeSingle();

  if (insertError || !inserted) {
    throwWithStatus(
      400,
      insertError?.message ?? 'Failed to update the branch price'
    );
  }

  return inserted as ServiceBranchAvailability;
}

async function loadServiceForArchiveAction(
  serviceId: string
): Promise<{ id: string; archived_at: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .select('id, archived_at')
    .eq('id', serviceId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service not found');

  return data;
}

/** Names of every live (non-archived) package, promo, and discount that still
 * depends on the service - archiving is refused while any exist so a bundle
 * or promo scope never silently loses (or keeps selling) a hidden service. */
async function findServiceBlockers(serviceId: string): Promise<string[]> {
  const [packages, promos, discounts] = await Promise.all([
    supabase
      .from('package_services')
      .select('packages!inner(name, archived_at)')
      .eq('service_id', serviceId)
      .is('packages.archived_at', null),
    supabase
      .from('promo_scope')
      .select('promos!inner(name, archived_at)')
      .eq('service_id', serviceId)
      .is('promos.archived_at', null),
    supabase
      .from('discounts')
      .select('name')
      .eq('scope_service_id', serviceId)
      .is('archived_at', null),
  ]);

  const firstError = packages.error ?? promos.error ?? discounts.error;
  if (firstError) throwWithStatus(400, firstError.message);

  const nameOf = (row: unknown, key: string): string | null => {
    const related = (row as Record<string, unknown>)[key] as
      | { name?: string }
      | { name?: string }[]
      | null;
    const record = Array.isArray(related) ? related[0] : related;
    return record?.name ?? null;
  };

  return [
    ...(packages.data ?? []).map(
      (row) => `package "${nameOf(row, 'packages')}"`
    ),
    ...(promos.data ?? []).map((row) => `promo "${nameOf(row, 'promos')}"`),
    ...(discounts.data ?? []).map((row) => `discount "${row.name}"`),
  ];
}

/** Config-menu consistency change: archive is the only way to retire a
 * service (there was no delete route before). Hides it from booking and
 * catalog reads, and deactivates it. Historic bookings/line items keep
 * resolving its name through by-id lookups. */
export async function archiveService(serviceId: string): Promise<Service> {
  const existing = await loadServiceForArchiveAction(serviceId);

  if (existing.archived_at) throwWithStatus(409, 'Service is already archived');

  const blockers = await findServiceBlockers(serviceId);

  if (blockers.length > 0) {
    throwWithStatus(
      409,
      `This service is still used by ${blockers.join(', ')}. Remove it from them (or archive them) before archiving the service.`
    );
  }

  const { error } = await supabase
    .from('services')
    .update({ ...archivePatch(), updated_at: new Date().toISOString() })
    .eq('id', serviceId);

  if (error) throwWithStatus(400, error.message);

  return getServiceById(serviceId);
}

/** is_active is derived from branch availability for services, so restore
 * recomputes it rather than blindly setting it true. */
export async function restoreService(serviceId: string): Promise<Service> {
  const existing = await loadServiceForArchiveAction(serviceId);

  if (!existing.archived_at) throwWithStatus(409, 'Service is not archived');

  const { data: rows, error: rowsError } = await supabase
    .from('service_branch_availability')
    .select('is_available')
    .eq('service_id', serviceId);

  if (rowsError) throwWithStatus(400, rowsError.message);

  const { error } = await supabase
    .from('services')
    .update({
      archived_at: null,
      is_active: (rows ?? []).some((row) => row.is_available),
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceId);

  if (error) throwWithStatus(400, error.message);

  return getServiceById(serviceId);
}

export async function hardDeleteService(serviceId: string): Promise<void> {
  const existing = await loadServiceForArchiveAction(serviceId);

  assertArchivedBeforeHardDelete(existing.archived_at, 'This service');

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', serviceId);

  if (error) {
    if (error.code === '23503') {
      throwWithStatus(
        409,
        'This service has booking history (or is bundled in a package) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
