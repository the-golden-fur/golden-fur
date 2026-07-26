import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PricingConfiguration } from '../maintenance.types.ts';
import type { UpdatePricingConfigurationInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface UpdatePricingConfigurationParams {
  requesterId: string;
  updates: UpdatePricingConfigurationInput;
}

/**
 * Singleton row, seeded by migration 20260726047 (#80) - there is always
 * exactly one. Read by the service form/PricingConfigurationPage preview and
 * by services.service.ts's derived matrix (#81).
 */
export async function getPricingConfiguration(): Promise<PricingConfiguration> {
  const { data, error } = await supabase
    .from('pricing_configuration')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(500, 'Pricing configuration is not seeded');

  return data as PricingConfiguration;
}

export async function updatePricingConfiguration({
  requesterId,
  updates,
}: UpdatePricingConfigurationParams): Promise<PricingConfiguration> {
  const existing = await getPricingConfiguration();

  const { data, error } = await supabase
    .from('pricing_configuration')
    .update({
      ...updates,
      updated_by_staff_id: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pricing configuration not found');

  return data as PricingConfiguration;
}
