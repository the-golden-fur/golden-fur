import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Package } from '../maintenance.types.ts';
import type {
  CreatePackageInput,
  UpdatePackageInput,
} from '../modules/validators/maintenance.validator.ts';

const PACKAGE_SELECT = '*, package_services(service_id)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListPackagesParams {
  branchId?: string;
  includeInactive?: boolean;
}

interface CreatePackageParams {
  requesterId: string;
  input: CreatePackageInput;
}

interface UpdatePackageParams {
  requesterId: string;
  packageId: string;
  updates: UpdatePackageInput;
}

/**
 * Every service id must (a) exist and (b) be is_active = true at the time
 * the package is created or its bundle edited (#41 Dev Notes). A service
 * deactivated AFTER being bundled is deliberately not rejected retroactively
 * - the package keeps the reference; that's what package_services' ON DELETE
 * RESTRICT is for, not a deactivation guard.
 */
async function assertServicesExistAndActive(serviceIds: string[]) {
  const { data, error } = await supabase
    .from('services')
    .select('id')
    .in('id', serviceIds)
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  const foundIds = new Set((data ?? []).map((row) => row.id));
  const missing = serviceIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    throwWithStatus(
      400,
      `Unknown or inactive service id(s): ${missing.join(', ')}`
    );
  }
}

/** Active packages by default, filterable by branch (#41 AC-5). */
export async function listPackages({
  branchId,
  includeInactive,
}: ListPackagesParams): Promise<Package[]> {
  let query = supabase.from('packages').select(PACKAGE_SELECT);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Package[];
}

export async function getPackageById(packageId: string): Promise<Package> {
  const { data, error } = await supabase
    .from('packages')
    .select(PACKAGE_SELECT)
    .eq('id', packageId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Package not found');

  return data as Package;
}

/**
 * A package is always scoped to exactly one branch (MA22) - branch_id is a
 * required create field, and "the same" package at both branches means two
 * rows. bundled_price is stored independently of the sum of the included
 * services' prices (#41 AC-2) - no validation ties the two together.
 */
export async function createPackage({
  requesterId,
  input,
}: CreatePackageParams): Promise<Package> {
  const { service_ids: serviceIds, ...packageFields } = input;

  await assertServicesExistAndActive(serviceIds);

  const { data: created, error } = await supabase
    .from('packages')
    .insert({
      ...packageFields,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !created) {
    throwWithStatus(400, error?.message ?? 'Failed to create package');
  }

  const { error: linkError } = await supabase.from('package_services').insert(
    serviceIds.map((serviceId) => ({
      package_id: created.id,
      service_id: serviceId,
    }))
  );

  if (linkError) throwWithStatus(400, linkError.message);

  return getPackageById(created.id);
}

/**
 * PATCH per #41 AC-3: name/price/active status edits, and service_ids as a
 * full replacement of the included-services set when provided.
 */
export async function updatePackage({
  requesterId,
  packageId,
  updates,
}: UpdatePackageParams): Promise<Package> {
  const { service_ids: serviceIds, ...packageFields } = updates;

  const { data: existing, error: lookupError } = await supabase
    .from('packages')
    .select('id')
    .eq('id', packageId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Package not found');

  if (serviceIds) {
    await assertServicesExistAndActive(serviceIds);
  }

  if (Object.keys(packageFields).length > 0) {
    const { error: updateError } = await supabase
      .from('packages')
      .update({
        ...packageFields,
        updated_by: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', packageId);

    if (updateError) throwWithStatus(400, updateError.message);
  }

  if (serviceIds) {
    const { error: deleteError } = await supabase
      .from('package_services')
      .delete()
      .eq('package_id', packageId);

    if (deleteError) throwWithStatus(400, deleteError.message);

    const { error: insertError } = await supabase
      .from('package_services')
      .insert(
        serviceIds.map((serviceId) => ({
          package_id: packageId,
          service_id: serviceId,
        }))
      );

    if (insertError) throwWithStatus(400, insertError.message);
  }

  return getPackageById(packageId);
}
