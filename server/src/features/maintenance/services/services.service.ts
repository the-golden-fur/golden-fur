import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  Service,
  ServiceBranchAvailability,
} from '../maintenance.types.ts';
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '../modules/validators/maintenance.validator.ts';
import { getPricingConfiguration } from './pricingConfiguration.service.ts';
import { deriveGroomingMatrix } from '../utils/deriveGroomingMatrix.ts';

const SERVICE_SELECT = '*, service_branch_availability(*)';

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
 * Epic B (#80/#81): the Grooming size/coat matrix is no longer stored per
 * cell - it is derived on read from base_price + pricing_configuration and
 * attached under the same service_pricing_tiers key existing consumers
 * already read (booking.service.ts's resolveServicePrice, this feature's own
 * client pages), with a synthesized id/service_id since there is no longer a
 * real row behind each cell.
 */
function attachPricingMatrix(
  service: Service,
  pricingConfiguration: Awaited<ReturnType<typeof getPricingConfiguration>>
): Service {
  if (service.category !== 'Grooming') {
    return { ...service, service_pricing_tiers: [] };
  }

  const matrix = deriveGroomingMatrix(
    Number(service.base_price),
    pricingConfiguration
  );

  return {
    ...service,
    service_pricing_tiers: matrix.map((cell) => ({
      id: `${service.id}:${cell.weight_class}:${cell.coat_type}`,
      service_id: service.id,
      weight_class: cell.weight_class,
      coat_type: cell.coat_type,
      price: cell.price,
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
  input,
}: CreateServiceParams): Promise<Service> {
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
  serviceId,
  updates,
}: UpdateServiceParams): Promise<Service> {
  const { data: existing, error: lookupError } = await supabase
    .from('services')
    .select('id, category, first_hour_fee')
    .eq('id', serviceId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service not found');

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
