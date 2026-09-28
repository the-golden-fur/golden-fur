import { randomUUID } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  archivePatch,
  assertArchivedBeforeHardDelete,
} from '../../../shared/archive/archiveGuard.ts';
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
    .is('archived_at', null)
    .order('created_at');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as ServiceType[];
}

export async function listArchivedServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase
    .from('service_types')
    .select(SERVICE_TYPE_SELECT)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as ServiceType[];
}

/**
 * Creates the service type and, in the same call, an is_available = true
 * service_type_branch_availability row for every branch - same "disable is
 * opt-out, not opt-in" convention as createService's own branch-availability
 * seeding.
 *
 * `key` is no longer client-supplied (admin backlog: it was redundant
 * busywork alongside the auto-generated `id`, and showed up unhelpfully in
 * the admin list) - it's generated here instead. It still does real internal
 * work as the join point cagePicker.service.ts and the customer-facing
 * booking flow use to match a row to its ServiceCategory, so it can't just
 * disappear - only its admin-facing presence does.
 */
export async function createServiceType(
  input: CreateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('service_types')
    .insert({
      key: randomUUID(),
      name: input.name,
      staff_picker_enabled: input.staff_picker_enabled ?? false,
      cage_picker_enabled: input.cage_picker_enabled ?? false,
      eligible_staff_roles: input.eligible_staff_roles ?? [],
      icon: input.icon ?? null,
      image_url: input.image_url ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Practically unreachable with a randomUUID() key - kept as
      // defense-in-depth against a manual/out-of-band insert.
      throwWithStatus(409, 'A service type with that key already exists');
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

async function assertServiceTypeNotArchived(
  serviceTypeId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('service_types')
    .select('archived_at')
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (data?.archived_at) {
    throwWithStatus(
      409,
      'This service type is archived - restore it to edit it'
    );
  }
}

export async function updateServiceType(
  serviceTypeId: string,
  updates: UpdateServiceTypeInput,
  requesterId: string
): Promise<ServiceType> {
  await assertServiceTypeNotArchived(serviceTypeId);

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
    .select('id, archived_at')
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Service type not found');
  // The is_active sync below would otherwise silently un-hide an archived
  // service type the moment any branch toggle is touched.
  if (existing.archived_at) {
    throwWithStatus(409, 'This service type is archived - restore it first');
  }

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

async function loadServiceTypeForArchiveAction(
  serviceTypeId: string
): Promise<{ id: string; key: string; archived_at: string | null }> {
  const { data, error } = await supabase
    .from('service_types')
    .select('id, key, archived_at')
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service type not found');

  return data;
}

async function reloadServiceType(serviceTypeId: string): Promise<ServiceType> {
  const { data, error } = await supabase
    .from('service_types')
    .select(SERVICE_TYPE_SELECT)
    .eq('id', serviceTypeId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Service type not found');

  return data as ServiceType;
}

/** Config-menu consistency change: archive hides the type from the booking
 * flow's type picker and the admin list; existing services keep their
 * category. */
export async function archiveServiceType(
  serviceTypeId: string,
  requesterId: string
): Promise<ServiceType> {
  const existing = await loadServiceTypeForArchiveAction(serviceTypeId);

  if (existing.archived_at) {
    throwWithStatus(409, 'Service type is already archived');
  }

  const { error } = await supabase
    .from('service_types')
    .update({
      ...archivePatch(),
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceTypeId);

  if (error) throwWithStatus(400, error.message);

  return reloadServiceType(serviceTypeId);
}

/** is_active is derived from branch availability for service types, so
 * restore recomputes it rather than blindly setting it true. */
export async function restoreServiceType(
  serviceTypeId: string,
  requesterId: string
): Promise<ServiceType> {
  const existing = await loadServiceTypeForArchiveAction(serviceTypeId);

  if (!existing.archived_at) {
    throwWithStatus(409, 'Service type is not archived');
  }

  const { data: rows, error: rowsError } = await supabase
    .from('service_type_branch_availability')
    .select('is_available')
    .eq('service_type_id', serviceTypeId);

  if (rowsError) throwWithStatus(400, rowsError.message);

  const { error } = await supabase
    .from('service_types')
    .update({
      archived_at: null,
      is_active: (rows ?? []).some((row) => row.is_available),
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceTypeId);

  if (error) throwWithStatus(400, error.message);

  return reloadServiceType(serviceTypeId);
}

const BUILT_IN_SERVICE_TYPE_KEYS = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Assessment',
];

/** Built-in types (Grooming, Hotel, ...) are joined to code by `key` and
 * services.category is an enum of exactly those keys, so those types can only
 * ever be archived. Custom (UUID-keyed) types can't own services at all, so
 * they're safe to delete once archived. */
export async function hardDeleteServiceType(
  serviceTypeId: string
): Promise<void> {
  const existing = await loadServiceTypeForArchiveAction(serviceTypeId);

  assertArchivedBeforeHardDelete(existing.archived_at, 'This service type');

  if (BUILT_IN_SERVICE_TYPE_KEYS.includes(existing.key)) {
    throwWithStatus(
      409,
      'Built-in service types are used by the booking system and can only be archived, not permanently deleted'
    );
  }

  const { error } = await supabase
    .from('service_types')
    .delete()
    .eq('id', serviceTypeId);

  if (error) {
    if (error.code === '23503') {
      throwWithStatus(
        409,
        'This service type is still referenced and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
