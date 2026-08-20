import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { Promo, PromoBranchAvailability } from '../maintenance.types.ts';
import type {
  CreatePromoInput,
  UpdatePromoInput,
} from '../modules/validators/maintenance.validator.ts';

// promo_branch_availability(*) mirrors package_branch_availability's own
// SELECT shape (custom change: promos moved off the old branch_scope enum
// onto the same many-to-many join, migration 20260820141).
const PROMO_SELECT = '*, promo_scope(*), promo_branch_availability(*)';

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ListPromosParams {
  branchId?: string;
  includeInactive?: boolean;
}

interface CreatePromoParams {
  requesterId: string;
  input: CreatePromoInput;
}

interface UpdatePromoParams {
  requesterId: string;
  promoId: string;
  updates: UpdatePromoInput;
}

interface SetPromoBranchAvailabilityParams {
  promoId: string;
  branchId: string;
  isAvailable: boolean;
}

/**
 * The active list applies the defensive read-time expiry filter (#42 AC-5):
 * a promo whose end_date has passed is never returned as active, even if the
 * scheduled deactivation job hasn't run yet. includeInactive is the admin
 * management view (#47's list filter) and skips both filters.
 *
 * Custom change: branchId now filters on the joined availability rows
 * (post-fetch, same as services.service.ts's listServices) rather than a
 * DB-level eq against the old branch_scope enum.
 */
export async function listPromos({
  branchId,
  includeInactive,
}: ListPromosParams): Promise<Promo[]> {
  let query = supabase
    .from('promos')
    .select(PROMO_SELECT)
    .is('archived_at', null);

  if (!includeInactive) {
    query = query
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${todayDateString()}`);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  const promos = (data ?? []) as Promo[];

  if (!branchId) {
    return promos;
  }

  return promos.filter((promo) =>
    (promo.promo_branch_availability ?? []).some(
      (row) => row.branch_id === branchId && row.is_available
    )
  );
}

export async function getPromoById(promoId: string): Promise<Promo> {
  const { data, error } = await supabase
    .from('promos')
    .select(PROMO_SELECT)
    .eq('id', promoId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Promo not found');

  return data as Promo;
}

/** branch_ids (custom change) is inserted as its own set of
 * promo_branch_availability rows in the same call, mirroring
 * createPackage/createDiscount. */
export async function createPromo({
  requesterId,
  input,
}: CreatePromoParams): Promise<Promo> {
  const { scope, branch_ids: branchIds, ...promoFields } = input;

  const { data: created, error } = await supabase
    .from('promos')
    .insert({
      ...promoFields,
      start_date: promoFields.start_date ?? null,
      end_date: promoFields.end_date ?? null,
      condition_note: promoFields.condition_note ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !created) {
    throwWithStatus(400, error?.message ?? 'Failed to create promo');
  }

  if (scope?.length) {
    const { error: scopeError } = await supabase.from('promo_scope').insert(
      scope.map((item) => ({
        promo_id: created.id,
        service_id: item.service_id ?? null,
        package_id: item.package_id ?? null,
      }))
    );

    if (scopeError) throwWithStatus(400, scopeError.message);
  }

  const { error: availabilityError } = await supabase
    .from('promo_branch_availability')
    .insert(
      branchIds.map((branchId) => ({
        promo_id: created.id,
        branch_id: branchId,
        is_available: true,
      }))
    );

  if (availabilityError) throwWithStatus(400, availabilityError.message);

  return getPromoById(created.id);
}

/** Per-branch availability toggle via its own endpoint, mirroring
 * setServiceBranchAvailability/setPackageBranchAvailability. Unlike those,
 * this does NOT sync promos.is_active - see the Promo type's own doc
 * comment on why is_active stays independent for promos. */
export async function setPromoBranchAvailability({
  promoId,
  branchId,
  isAvailable,
}: SetPromoBranchAvailabilityParams): Promise<PromoBranchAvailability> {
  const { data: existing, error: lookupError } = await supabase
    .from('promos')
    .select('id')
    .eq('id', promoId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Promo not found');

  const { data, error } = await supabase
    .from('promo_branch_availability')
    .upsert(
      { promo_id: promoId, branch_id: branchId, is_available: isAvailable },
      { onConflict: 'promo_id,branch_id' }
    )
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update availability');
  }

  return data as PromoBranchAvailability;
}

/**
 * Cross-field rules the validator can't see on a partial payload are
 * enforced against the merged (existing + updates) state here:
 * date/condition exclusivity, date ordering, and scope_type consistency.
 * Manual deactivation (is_active = false) must always remain available
 * regardless of the expiry mechanism (#42 AC-4) - nothing here blocks it.
 */
export async function updatePromo({
  requesterId,
  promoId,
  updates,
}: UpdatePromoParams): Promise<Promo> {
  const { scope, ...promoFields } = updates;

  const existing = await getPromoById(promoId);

  const effective = {
    start_date:
      promoFields.start_date !== undefined
        ? promoFields.start_date
        : existing.start_date,
    end_date:
      promoFields.end_date !== undefined
        ? promoFields.end_date
        : existing.end_date,
    condition_note:
      promoFields.condition_note !== undefined
        ? promoFields.condition_note
        : existing.condition_note,
    scope_type: promoFields.scope_type ?? existing.scope_type,
  };

  if (
    effective.condition_note &&
    (effective.start_date || effective.end_date)
  ) {
    throwWithStatus(
      400,
      'A promo is either date-bounded or condition-based, not both'
    );
  }

  if (
    effective.start_date &&
    effective.end_date &&
    effective.end_date < effective.start_date
  ) {
    throwWithStatus(400, 'end_date must be on or after start_date');
  }

  if (effective.scope_type === 'all_services' && scope?.length) {
    throwWithStatus(
      400,
      "scope must be empty when scope_type is 'all_services'"
    );
  }

  if (
    effective.scope_type === 'specific' &&
    !scope?.length &&
    !(existing.promo_scope ?? []).length
  ) {
    throwWithStatus(
      400,
      "scope_type 'specific' requires at least one scope item"
    );
  }

  if (Object.keys(promoFields).length > 0) {
    const { error: updateError } = await supabase
      .from('promos')
      .update({
        ...promoFields,
        updated_by: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promoId);

    if (updateError) throwWithStatus(400, updateError.message);
  }

  // Scope rows are replaced when a new set is provided, and cleared when the
  // promo switches to 'all_services' (which requires no promo_scope rows).
  const clearingScope =
    effective.scope_type === 'all_services' &&
    (existing.promo_scope ?? []).length > 0;

  if (scope?.length || clearingScope) {
    const { error: deleteError } = await supabase
      .from('promo_scope')
      .delete()
      .eq('promo_id', promoId);

    if (deleteError) throwWithStatus(400, deleteError.message);
  }

  if (scope?.length && effective.scope_type === 'specific') {
    const { error: insertError } = await supabase.from('promo_scope').insert(
      scope.map((item) => ({
        promo_id: promoId,
        service_id: item.service_id ?? null,
        package_id: item.package_id ?? null,
      }))
    );

    if (insertError) throwWithStatus(400, insertError.message);
  }

  return getPromoById(promoId);
}

/**
 * Deactivate-first CRUD safety (archive workflow), mirroring
 * productCatalog.service.ts's archiveProduct: archiving is soft - the row
 * moves to the archive list via archived_at, it is not deleted.
 */
export async function archivePromo(promoId: string): Promise<void> {
  const promo = await getPromoById(promoId);
  assertInactiveBeforeArchive(promo.is_active, 'This promo');

  const { error } = await supabase
    .from('promos')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', promoId);

  if (error) throwWithStatus(400, error.message);
}

export async function restorePromo(promoId: string): Promise<void> {
  const { error } = await supabase
    .from('promos')
    .update({ archived_at: null })
    .eq('id', promoId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedPromos(): Promise<Promo[]> {
  const { data, error } = await supabase
    .from('promos')
    .select(PROMO_SELECT)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Promo[];
}

export async function hardDeletePromo(promoId: string): Promise<void> {
  const promo = await getPromoById(promoId);
  assertArchivedBeforeHardDelete(promo.archived_at, 'This promo');

  const { error } = await supabase.from('promos').delete().eq('id', promoId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This promo is still referenced elsewhere (a sale) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
