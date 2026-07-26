import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PackagePricingConfiguration } from '../maintenance.types.ts';
import type { UpdatePackagePricingConfigurationInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface UpdatePackagePricingConfigurationParams {
  requesterId: string;
  updates: UpdatePackagePricingConfigurationInput;
}

/**
 * Singleton row, seeded by migration 20260726048 (#82) - there is always
 * exactly one. Read by the package form/PackagePricingPreview and by
 * packages.service.ts's derived bundled_price (#83).
 */
export async function getPackagePricingConfiguration(): Promise<PackagePricingConfiguration> {
  const { data, error } = await supabase
    .from('package_pricing_configuration')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(500, 'Package pricing configuration is not seeded');

  return data as PackagePricingConfiguration;
}

export async function updatePackagePricingConfiguration({
  requesterId,
  updates,
}: UpdatePackagePricingConfigurationParams): Promise<PackagePricingConfiguration> {
  const existing = await getPackagePricingConfiguration();

  const { data, error } = await supabase
    .from('package_pricing_configuration')
    .update({
      ...updates,
      updated_by_staff_id: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Package pricing configuration not found');

  return data as PackagePricingConfiguration;
}
