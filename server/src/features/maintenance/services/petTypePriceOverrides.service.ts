import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PetTypePriceOverride } from '../maintenance.types.ts';
import type { UpsertPetTypePriceOverrideInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListPetTypePriceOverridesParams {
  branchId?: string;
}

/**
 * Pet Type Pricing (20260912192) - list every override row, optionally
 * narrowed to a single branch plus the system-wide default rows (same "or"
 * shape as staffPicker.service.ts's resolveEffectivePolicy), for the admin
 * page's per-branch price editor.
 */
export async function listPetTypePriceOverrides({
  branchId,
}: ListPetTypePriceOverridesParams): Promise<PetTypePriceOverride[]> {
  let query = supabase.from('pet_type_price_overrides').select('*');

  query = branchId
    ? query.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    : query.is('branch_id', null);

  const { data, error } = await query.order('pet_type');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/**
 * Single resolution point booking.service.ts's resolveServicePrice/
 * resolvePackagePrice call: does this pet type have a fixed-price override
 * for this branch? Branch-specific row wins over the system-wide default
 * row; null means no override applies, so normal service/package pricing
 * (base_price, or the weight/coat matrix) proceeds unchanged - this is the
 * fallback every pet type (including a brand-new admin-created one) gets
 * unless an override is explicitly configured.
 */
export async function getFixedPrice(
  petType: string,
  branchId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('pet_type_price_overrides')
    .select('branch_id, fixed_price')
    .eq('pet_type', petType)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as Array<{
    branch_id: string | null;
    fixed_price: number;
  }>;
  const branchRow = rows.find((row) => row.branch_id === branchId);
  const defaultRow = rows.find((row) => row.branch_id === null);
  const resolved = branchRow ?? defaultRow;

  return resolved ? Number(resolved.fixed_price) : null;
}

/**
 * Insert-or-update keyed by the two partial unique indexes
 * (pet_type_price_overrides_default_uniq / _branch_uniq) - branch_id null
 * upserts the system-wide default row, a uuid upserts that branch's row.
 * Supabase's onConflict needs the exact matching unique index; since the
 * two indexes are partial (different WHERE clauses) rather than one
 * composite unique constraint, resolve which row already exists first,
 * then insert or update accordingly rather than relying on a single
 * .upsert() call.
 */
export async function upsertPetTypePriceOverride(
  input: UpsertPetTypePriceOverrideInput
): Promise<PetTypePriceOverride> {
  let existingQuery = supabase
    .from('pet_type_price_overrides')
    .select('id')
    .eq('pet_type', input.pet_type);

  existingQuery =
    input.branch_id === null
      ? existingQuery.is('branch_id', null)
      : existingQuery.eq('branch_id', input.branch_id);

  const { data: existing, error: existingError } =
    await existingQuery.maybeSingle();

  if (existingError) throwWithStatus(400, existingError.message);

  if (existing) {
    const { data, error } = await supabase
      .from('pet_type_price_overrides')
      .update({ fixed_price: input.fixed_price })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) throwWithStatus(400, error.message);
    if (!data) throwWithStatus(404, 'Pet type price override not found');

    return data;
  }

  const { data, error } = await supabase
    .from('pet_type_price_overrides')
    .insert({
      pet_type: input.pet_type,
      branch_id: input.branch_id,
      fixed_price: input.fixed_price,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create pet type price override');

  return data;
}

export async function deletePetTypePriceOverride(
  overrideId: string
): Promise<void> {
  const { error } = await supabase
    .from('pet_type_price_overrides')
    .delete()
    .eq('id', overrideId);

  if (error) throwWithStatus(400, error.message);
}
