import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { Package } from '../maintenance.types.ts';
import type {
  CreatePackageInput,
  UpdatePackageInput,
} from '../modules/validators/maintenance.validator.ts';
import { getPackagePricingConfiguration } from './packagePricing.service.ts';
import { deriveBundledPrice } from '../utils/deriveBundledPrice.ts';

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

// Epic B (#82/#83): pulls each included service's base_price in the same
// query so bundled_price can be derived without an N+1 follow-up lookup.
const PACKAGE_SELECT = '*, package_services(service_id, services(base_price))';

interface RawPackageServiceLink {
  service_id: string;
  services: { base_price: number } | null;
}

/** The shape PACKAGE_SELECT actually returns - packages no longer has a
 * bundled_price column, and package_services carries the nested service join
 * used to derive it. */
type RawPackage = Omit<Package, 'bundled_price' | 'package_services'> & {
  package_services?: RawPackageServiceLink[];
};

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Epic B (#83): bundled_price is derived from the included services'
 * base_price and package_pricing_configuration, not a stored column. The
 * nested services(base_price) join is stripped back down to the
 * { service_id } shape existing consumers expect on package_services.
 */
function attachBundledPrice(
  pkg: RawPackage,
  pricingConfiguration: Awaited<
    ReturnType<typeof getPackagePricingConfiguration>
  >
): Package {
  const links = pkg.package_services ?? [];
  const basePrices = links.map((link) =>
    Number(link.services?.base_price ?? 0)
  );

  return {
    ...pkg,
    bundled_price: deriveBundledPrice(basePrices, pricingConfiguration),
    package_services: links.map((link) => ({ service_id: link.service_id })),
  };
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
  let query = supabase
    .from('packages')
    .select(PACKAGE_SELECT)
    .is('archived_at', null);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  const pricingConfiguration = await getPackagePricingConfiguration();

  return ((data ?? []) as RawPackage[]).map((pkg) =>
    attachBundledPrice(pkg, pricingConfiguration)
  );
}

export async function getPackageById(packageId: string): Promise<Package> {
  const { data, error } = await supabase
    .from('packages')
    .select(PACKAGE_SELECT)
    .eq('id', packageId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Package not found');

  const pricingConfiguration = await getPackagePricingConfiguration();

  return attachBundledPrice(data as RawPackage, pricingConfiguration);
}

/**
 * A package is always scoped to exactly one branch (MA22) - branch_id is a
 * required create field, and "the same" package at both branches means two
 * rows. Epic B (#83): bundled_price is no longer accepted as input - it is
 * derived from the included services' base_price on read.
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
 * PATCH per #41 AC-3: name/active status edits, and service_ids as a full
 * replacement of the included-services set when provided.
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

/**
 * Deactivate-first CRUD safety (archive workflow), mirroring
 * productCatalog.service.ts's archiveProduct: archiving is soft - the row
 * moves to the archive list via archived_at, it is not deleted.
 */
export async function archivePackage(packageId: string): Promise<void> {
  const pkg = await getPackageById(packageId);
  assertInactiveBeforeArchive(pkg.is_active, 'This package');

  const { error } = await supabase
    .from('packages')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', packageId);

  if (error) throwWithStatus(400, error.message);
}

export async function restorePackage(packageId: string): Promise<void> {
  const { error } = await supabase
    .from('packages')
    .update({ archived_at: null })
    .eq('id', packageId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select(PACKAGE_SELECT)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  const pricingConfiguration = await getPackagePricingConfiguration();

  return ((data ?? []) as RawPackage[]).map((pkg) =>
    attachBundledPrice(pkg, pricingConfiguration)
  );
}

export async function hardDeletePackage(packageId: string): Promise<void> {
  const pkg = await getPackageById(packageId);
  assertArchivedBeforeHardDelete(pkg.archived_at, 'This package');

  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This package is still referenced elsewhere (a booking or a sale) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
