import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  Service,
  ServiceBranchAvailability,
} from '../maintenance.types.ts';
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '../modules/validators/maintenance.validator.ts';

const SERVICE_SELECT =
  '*, service_pricing_tiers(*), service_branch_availability(*)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListServicesParams {
  category?: string;
  branchId?: string;
  includeInactive?: boolean;
}

interface CreateServiceParams {
  requesterId: string;
  input: CreateServiceInput;
}

interface UpdateServiceParams {
  requesterId: string;
  serviceId: string;
  updates: UpdateServiceInput;
}

interface SetBranchAvailabilityParams {
  serviceId: string;
  branchId: string;
  isAvailable: boolean;
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
}: ListServicesParams): Promise<Service[]> {
  let query = supabase.from('services').select(SERVICE_SELECT);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  const services = (data ?? []) as Service[];

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

  return data as Service;
}

/**
 * Creates the service and, in the same call (#40 AC-1): its full size-coat
 * tier set when Grooming, and an is_available = true
 * service_branch_availability row for every branch. Defaulting both branches
 * to available follows the Guide's recommendation - Modules-Features frames
 * branch availability as a toggle to disable a branch, not an opt-in.
 */
export async function createService({
  requesterId,
  input,
}: CreateServiceParams): Promise<Service> {
  const { pricing_tiers: pricingTiers, ...serviceFields } = input;

  const { data: service, error } = await supabase
    .from('services')
    .insert({
      ...serviceFields,
      duration_minutes: serviceFields.duration_minutes ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !service) {
    throwWithStatus(400, error?.message ?? 'Failed to create service');
  }

  if (pricingTiers?.length) {
    const { error: tierError } = await supabase
      .from('service_pricing_tiers')
      .insert(
        pricingTiers.map((tier) => ({ ...tier, service_id: service.id }))
      );

    if (tierError) throwWithStatus(400, tierError.message);
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

/**
 * PATCH semantics per #40 AC-2: any field editable; pricing_tiers upserts
 * individual (weight_class, coat_type) cells without requiring the full set.
 * Tier upserts are rejected for non-Grooming services here in the service
 * layer (#40 Dev Notes) - the effective category is the updated one when the
 * PATCH changes it, otherwise the stored one.
 */
export async function updateService({
  requesterId,
  serviceId,
  updates,
}: UpdateServiceParams): Promise<Service> {
  const { pricing_tiers: pricingTiers, ...serviceFields } = updates;

  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id, category')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');

  const effectiveCategory = serviceFields.category ?? existing.category;

  if (pricingTiers?.length && effectiveCategory !== 'Grooming') {
    throwWithStatus(400, 'Pricing tiers only apply to Grooming services');
  }

  if (Object.keys(serviceFields).length > 0) {
    const { error: updateError } = await supabase
      .from('services')
      .update({
        ...serviceFields,
        updated_by: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serviceId);

    if (updateError) throwWithStatus(400, updateError.message);
  }

  if (pricingTiers?.length) {
    const { error: tierError } = await supabase
      .from('service_pricing_tiers')
      .upsert(
        pricingTiers.map((tier) => ({ ...tier, service_id: serviceId })),
        { onConflict: 'service_id,weight_class,coat_type' }
      );

    if (tierError) throwWithStatus(400, tierError.message);
  }

  return getServiceById(serviceId);
}

/** Per-branch availability toggle via its own endpoint (#40 AC-4). */
export async function setServiceBranchAvailability({
  serviceId,
  branchId,
  isAvailable,
}: SetBranchAvailabilityParams): Promise<ServiceBranchAvailability> {
  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');

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

  return data as ServiceBranchAvailability;
}
