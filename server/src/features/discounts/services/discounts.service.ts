import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type {
  Discount,
  DiscountBranchAvailability,
} from '../discounts.types.ts';
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

// Mirrors PACKAGE_SELECT/SERVICE_SELECT - joins the many-to-many branch
// availability table (migration 20260820140) instead of a plain branch_id
// column.
const DISCOUNT_SELECT = '*, discount_branch_availability(*)';

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

interface SetDiscountBranchAvailabilityParams {
  discountId: string;
  branchId: string;
  isAvailable: boolean;
}

/**
 * Discounts default to is_active = false project-wide ('production-ready
 * but switched off by default'), so the default list returns ALL rows -
 * the #48 management UI must show inactive mandated rows so an Admin can
 * enable them. activeOnly is the consumer view (M08 checkout, Sprint 5).
 */
/**
 * branchId now filters on the joined availability rows (post-fetch, same as
 * services.service.ts's listServices) rather than a DB-level eq - a
 * discount belongs to whichever branches have an is_available = true row.
 */
export async function listDiscounts({
  branchId,
  activeOnly,
}: ListDiscountsParams): Promise<Discount[]> {
  let query = supabase
    .from('discounts')
    .select(DISCOUNT_SELECT)
    .is('archived_at', null);

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  const discounts = (data ?? []) as Discount[];

  if (!branchId) {
    return discounts;
  }

  return discounts.filter((discount) =>
    (discount.discount_branch_availability ?? []).some(
      (row) => row.branch_id === branchId && row.is_available
    )
  );
}

export async function getDiscountById(discountId: string): Promise<Discount> {
  const { data, error } = await supabase
    .from('discounts')
    .select(DISCOUNT_SELECT)
    .eq('id', discountId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Discount not found');

  return data as Discount;
}

/**
 * Custom discounts only - is_mandated is never accepted from the API
 * (mandated rows exist solely via the #44 seed). branch_ids (custom change)
 * is inserted as its own set of discount_branch_availability rows in the
 * same call, mirroring createPackage/createService.
 *
 * Custom change (unify active/available): is_active is no longer an
 * independent switch - it is derived from branch availability everywhere
 * ("if a discount is not available at a branch, it is not active"). Since
 * branch_ids is required to be non-empty, a newly created discount is
 * always available somewhere and therefore always starts active; there is
 * no longer a separate "created but switched off" state to opt into.
 */
export async function createDiscount({
  requesterId,
  input,
}: CreateDiscountParams): Promise<Discount> {
  const { branch_ids: branchIds, ...discountFields } = input;

  const { data, error } = await supabase
    .from('discounts')
    .insert({
      ...discountFields,
      scope_service_id: input.scope_service_id ?? null,
      scope_package_id: input.scope_package_id ?? null,
      scope_category: input.scope_category ?? null,
      is_mandated: false,
      is_active: true,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create discount');
  }

  const { error: availabilityError } = await supabase
    .from('discount_branch_availability')
    .insert(
      branchIds.map((branchId) => ({
        discount_id: data.id,
        branch_id: branchId,
        is_available: true,
      }))
    );

  if (availabilityError) throwWithStatus(400, availabilityError.message);

  return getDiscountById(data.id);
}

/**
 * Per-branch availability toggle via its own endpoint, mirroring
 * setServiceBranchAvailability/setPackageBranchAvailability.
 *
 * Custom change (unify active/available): also keeps discounts.is_active in
 * sync with the resulting availability set - active whenever at least one
 * branch is available, inactive when none are. This is the single place
 * that flips is_active now that it is no longer independently settable via
 * updateDiscount.
 */
export async function setDiscountBranchAvailability({
  discountId,
  branchId,
  isAvailable,
}: SetDiscountBranchAvailabilityParams): Promise<DiscountBranchAvailability> {
  const { data: existing, error: lookupError } = await supabase
    .from('discounts')
    .select('id')
    .eq('id', discountId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Discount not found');

  const { data, error } = await supabase
    .from('discount_branch_availability')
    .upsert(
      {
        discount_id: discountId,
        branch_id: branchId,
        is_available: isAvailable,
      },
      { onConflict: 'discount_id,branch_id' }
    )
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update availability');
  }

  const { data: allRows, error: allRowsError } = await supabase
    .from('discount_branch_availability')
    .select('is_available')
    .eq('discount_id', discountId);

  if (allRowsError) throwWithStatus(400, allRowsError.message);

  const isActive = (allRows ?? []).some((row) => row.is_available);

  const { error: syncError } = await supabase
    .from('discounts')
    .update({ is_active: isActive })
    .eq('id', discountId);

  if (syncError) throwWithStatus(400, syncError.message);

  return data as DiscountBranchAvailability;
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

  const { error } = await supabase
    .from('discounts')
    .update({
      ...updates,
      ...scopeReset,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', discountId);

  if (error) throwWithStatus(400, error.message);

  return getDiscountById(discountId);
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
