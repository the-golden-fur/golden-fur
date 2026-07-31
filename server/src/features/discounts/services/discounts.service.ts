import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { Discount } from '../discounts.types.ts';
import type {
  CreateDiscountInput,
  UpdateDiscountInput,
} from '../modules/validators/discounts.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

interface ListDiscountsParams {
  branchId?: string;
  activeOnly?: boolean;
}

interface CreateDiscountParams {
  requesterId: string;
  input: CreateDiscountInput;
}

interface UpdateDiscountParams {
  requesterId: string;
  discountId: string;
  updates: UpdateDiscountInput;
}

/**
 * Discounts default to is_active = false project-wide ('production-ready
 * but switched off by default'), so the default list returns ALL rows -
 * the #48 management UI must show inactive mandated rows so an Admin can
 * enable them. activeOnly is the consumer view (M08 checkout, Sprint 5).
 */
export async function listDiscounts({
  branchId,
  activeOnly,
}: ListDiscountsParams): Promise<Discount[]> {
  let query = supabase.from('discounts').select('*').is('archived_at', null);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Discount[];
}

export async function getDiscountById(discountId: string): Promise<Discount> {
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .eq('id', discountId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Discount not found');

  return data as Discount;
}

/**
 * Custom discounts only - is_mandated is never accepted from the API
 * (mandated rows exist solely via the #44 seed), and every new discount is
 * created inactive per Modules-Features' switched-off-by-default rule.
 */
export async function createDiscount({
  requesterId,
  input,
}: CreateDiscountParams): Promise<Discount> {
  const { data, error } = await supabase
    .from('discounts')
    .insert({
      ...input,
      scope_service_id: input.scope_service_id ?? null,
      scope_package_id: input.scope_package_id ?? null,
      scope_category: input.scope_category ?? null,
      is_mandated: false,
      is_active: false,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create discount');
  }

  return data as Discount;
}

/**
 * Any discount (mandated or custom) can be toggled via is_active, and a
 * custom discount's value/scope edited (#43 AC-3). A mandated row's name is
 * immutable - renaming it would let 'Senior Citizen Discount' silently
 * become something else (is_mandated itself is already unreachable: the
 * validator's `.strict()` rejects the key on any payload).
 */
export async function updateDiscount({
  requesterId,
  discountId,
  updates,
}: UpdateDiscountParams): Promise<Discount> {
  const existing = await getDiscountById(discountId);

  if (
    existing.is_mandated &&
    updates.name !== undefined &&
    updates.name !== existing.name
  ) {
    throwWithStatus(400, "A mandated discount's name cannot be changed");
  }

  // When the scope shape changes, null out the other scope columns so the
  // discounts_scope_matches_type CHECK holds (exactly one non-null).
  const scopeReset =
    updates.scope_type !== undefined
      ? {
          scope_service_id: updates.scope_service_id ?? null,
          scope_package_id: updates.scope_package_id ?? null,
          scope_category: updates.scope_category ?? null,
        }
      : {};

  const { data, error } = await supabase
    .from('discounts')
    .update({
      ...updates,
      ...scopeReset,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', discountId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Discount not found');

  return data as Discount;
}

/**
 * Deactivate-first CRUD safety (archive workflow), mirroring
 * productCatalog.service.ts's archiveProduct: archiving is soft - the row
 * moves to the archive list via archived_at, it is not deleted. A mandated
 * discount can still be archived once deactivated - is_mandated only
 * protects its name (updateDiscount above), not its lifecycle.
 */
export async function archiveDiscount(discountId: string): Promise<void> {
  const discount = await getDiscountById(discountId);
  assertInactiveBeforeArchive(discount.is_active, 'This discount');

  const { error } = await supabase
    .from('discounts')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', discountId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreDiscount(discountId: string): Promise<void> {
  const { error } = await supabase
    .from('discounts')
    .update({ archived_at: null })
    .eq('id', discountId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedDiscounts(): Promise<Discount[]> {
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Discount[];
}

export async function hardDeleteDiscount(discountId: string): Promise<void> {
  const discount = await getDiscountById(discountId);
  assertArchivedBeforeHardDelete(discount.archived_at, 'This discount');

  const { error } = await supabase
    .from('discounts')
    .delete()
    .eq('id', discountId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This discount is still referenced elsewhere (a booking or a sale) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
