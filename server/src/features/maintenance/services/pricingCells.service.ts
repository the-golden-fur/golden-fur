import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  CoatType,
  Package,
  Service,
  WeightClass,
} from '../maintenance.types.ts';
import { getServiceById } from './services.service.ts';
import { getPackageById } from './packages.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface PricingCellInput {
  weight_class: WeightClass;
  coat_type: CoatType;
  /** null = back to the shared formula's price. */
  price: number | null;
}

interface SetPricingCellsParams {
  cells: PricingCellInput[];
  requesterId: string;
  requesterRole: string;
}

function assertSuperadmin(requesterRole: string): void {
  if (requesterRole !== 'Superadmin') {
    throwWithStatus(
      403,
      'Only a Superadmin can set weight class and coat type prices'
    );
  }
}

/**
 * Writes one item's cells: a number upserts that cell's own price, null
 * deletes it so the cell follows the formula again. Cells not listed are
 * left as they are.
 */
async function writeCells(
  table: 'service_pricing_cell_overrides' | 'package_pricing_cell_overrides',
  keyColumn: 'service_id' | 'package_id',
  itemId: string,
  { cells, requesterId }: SetPricingCellsParams
): Promise<void> {
  const upserts = cells
    .filter((cell) => cell.price !== null)
    .map((cell) => ({
      [keyColumn]: itemId,
      weight_class: cell.weight_class,
      coat_type: cell.coat_type,
      price: cell.price,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    }));

  if (upserts.length > 0) {
    const { error } = await supabase
      .from(table)
      .upsert(upserts, { onConflict: `${keyColumn},weight_class,coat_type` });

    if (error) throwWithStatus(400, error.message);
  }

  for (const cell of cells.filter((entry) => entry.price === null)) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(keyColumn, itemId)
      .eq('weight_class', cell.weight_class)
      .eq('coat_type', cell.coat_type);

    if (error) throwWithStatus(400, error.message);
  }
}

/** A Grooming service's own weight x coat prices - Superadmin-only (route +
 * here, same as setServiceBranchPrice). Returns the service with its cells
 * as they now read. */
export async function setServicePricingCells(
  serviceId: string,
  params: SetPricingCellsParams
): Promise<Service> {
  assertSuperadmin(params.requesterRole);

  const service = await getServiceById(serviceId);
  if (service.archived_at) {
    throwWithStatus(409, 'This service is archived - restore it to edit it');
  }
  if (service.category !== 'Grooming') {
    throwWithStatus(
      400,
      'Only Grooming services can be priced by weight class and coat type'
    );
  }

  await writeCells(
    'service_pricing_cell_overrides',
    'service_id',
    serviceId,
    params
  );

  return getServiceById(serviceId);
}

/** A package's own weight x coat prices - Superadmin-only. Returns the
 * package with its cells as they now read. */
export async function setPackagePricingCells(
  packageId: string,
  params: SetPricingCellsParams
): Promise<Package> {
  assertSuperadmin(params.requesterRole);

  const pkg = await getPackageById(packageId);
  if (pkg.archived_at) {
    throwWithStatus(409, 'This package is archived - restore it to edit it');
  }

  await writeCells(
    'package_pricing_cell_overrides',
    'package_id',
    packageId,
    params
  );

  return getPackageById(packageId);
}
