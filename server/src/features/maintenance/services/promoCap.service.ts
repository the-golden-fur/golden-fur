import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PromoCapConfiguration } from '../maintenance.types.ts';
import type { UpsertPromoCapConfigurationInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface UpsertPromoCapConfigurationParams {
  requesterId: string;
  input: UpsertPromoCapConfigurationInput;
}

/**
 * One row per branch plus one system-wide default (branch_id = null), same
 * shape as policy_configurations. Ordered null-first so the default row
 * always sorts first for display.
 */
export async function listPromoCapConfigurations(): Promise<
  PromoCapConfiguration[]
> {
  const { data, error } = await supabase
    .from('promo_cap_configuration')
    .select('*')
    .order('branch_id', { nullsFirst: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as PromoCapConfiguration[];
}

/**
 * Upsert-by-scope: a branch (or the default) either already has a cap row
 * from the migration seed / a prior edit, or gets one created here. There is
 * no client-visible row id to PATCH against beforehand, so the branch_id
 * itself is the natural key (#84 AC-4: "Admin/Superadmin can view and edit
 * the per-branch promo cap").
 */
export async function upsertPromoCapConfiguration({
  requesterId,
  input,
}: UpsertPromoCapConfigurationParams): Promise<PromoCapConfiguration> {
  const branchId = input.branch_id ?? null;

  let lookup = supabase.from('promo_cap_configuration').select('id');
  lookup = branchId ? lookup.eq('branch_id', branchId) : lookup.is('branch_id', null);

  const { data: existing, error: lookupError } = await lookup.maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);

  if (existing) {
    const { data, error } = await supabase
      .from('promo_cap_configuration')
      .update({
        cap_type: input.cap_type,
        cap_value: input.cap_value,
        updated_by_staff_id: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) throwWithStatus(400, error.message);
    if (!data) throwWithStatus(404, 'Promo cap configuration not found');

    return data as PromoCapConfiguration;
  }

  const { data, error } = await supabase
    .from('promo_cap_configuration')
    .insert({
      branch_id: branchId,
      cap_type: input.cap_type,
      cap_value: input.cap_value,
      updated_by_staff_id: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create promo cap configuration');
  }

  return data as PromoCapConfiguration;
}
