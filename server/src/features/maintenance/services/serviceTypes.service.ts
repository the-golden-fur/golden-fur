import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  ServiceType,
  ServiceTypeBranchAvailability,
} from '../maintenance.types.ts';
import type {
  CreateServiceTypeInput,
  UpdateServiceTypeInput,
} from '../modules/validators/maintenance.validator.ts';

const SERVICE_TYPE_SELECT = '*, service_type_branch_availability(*)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export async function listServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase
    .from('service_types')
    .select(SERVICE_TYPE_SELECT)
    .order('created_at');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as ServiceType[];
}

/**
 * Creates the service type and, in the same call, an is_available = true
 * service_type_branch_availability row for every branch - same "disable is
 * opt-out, not opt-in" convention as createService's own branch-availability
 * seeding.
 */
export async function createServiceType(
  input: CreateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('service_types')
    .insert({
      key: input.key,
      name: input.name,
      staff_picker_enabled: input.staff_picker_enabled ?? false,
      cage_picker_enabled: input.cage_picker_enabled ?? false,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `A service type with key "${input.key}" already exists`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create service type');

  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id');

  if (branchError) throwWithStatus(400, branchError.message);

  if (branches?.length) {
    const { error: availabilityError } = await supabase
      .from('service_type_branch_availability')
      .insert(
        branches.map((branch) => ({
          service_type_id: data.id,
          branch_id: branch.id,
          is_available: true,
        }))
      );

    if (availabilityError) throwWithStatus(400, availabilityError.message);
  }

  const { data: withAvailability, error: reloadError } = await supabase
    .from('service_types')
    .select(SERVICE_TYPE_SELECT)
    .eq('id', data.id)
    .maybeSingle();

  if (reloadError) throwWithStatus(400, reloadError.message);
  if (!withAvailability) throwWithStatus(404, 'Service type not found');

  return withAvailability as ServiceType;
}

export async function updateServiceType(
  serviceTypeId: string,
  updates: UpdateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  const { error } = await supabase
    .from('service_types')
    .update({
      ...updates,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceTypeId);

  if (error) throwWithStatus(400, error.message);

  const { data, error: reloadError } = await supabase
    .from('service_types')
    .select(SERVICE_TYPE_SELECT)
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (reloadError) throwWithStatus(400, reloadError.message);
  if (!data) throwWithStatus(404, 'Service type not found');

  return data as ServiceType;
}

interface SetServiceTypeBranchAvailabilityParams {
  serviceTypeId: string;
  branchId: string;
  isAvailable: boolean;
}

/**
 * Per-branch availability toggle via its own endpoint - mirrors
 * setServiceBranchAvailability (services.service.ts). Replaces the row-level
 * Activate/Deactivate action on the admin Service Types page.
 *
 * Custom change (unify active/available): also keeps service_types.is_active
 * in sync with the resulting availability set - active whenever at least
 * one branch is available, inactive when none are. This is the only place
 * is_active changes now that it is no longer independently settable via
 * updateServiceType.
 */
export async function setServiceTypeBranchAvailability({
  serviceTypeId,
  branchId,
  isAvailable,
}: SetServiceTypeBranchAvailabilityParams): Promise<ServiceTypeBranchAvailability> {
  const { data: existing, error: lookupError } = await supabase
    .from('service_types')
    .select('id')
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service type not found');

  const { data, error } = await supabase
    .from('service_type_branch_availability')
    .upsert(
      {
        service_type_id: serviceTypeId,
        branch_id: branchId,
        is_available: isAvailable,
      },
      { onConflict: 'service_type_id,branch_id' }
    )
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update availability');
  }

  const { data: allRows, error: allRowsError } = await supabase
    .from('service_type_branch_availability')
    .select('is_available')
    .eq('service_type_id', serviceTypeId);

  if (allRowsError) throwWithStatus(400, allRowsError.message);

  const { error: syncError } = await supabase
    .from('service_types')
    .update({ is_active: (allRows ?? []).some((row) => row.is_available) })
    .eq('id', serviceTypeId);

  if (syncError) throwWithStatus(400, syncError.message);

  return data as ServiceTypeBranchAvailability;
}
