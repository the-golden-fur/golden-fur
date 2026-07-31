import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { Promo } from '../maintenance.types.ts';
import type {
  CreatePromoInput,
  UpdatePromoInput,
} from '../modules/validators/maintenance.validator.ts';

const PROMO_SELECT = '*, promo_scope(*)';

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
  branchScope?: string;
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

/**
 * The active list applies the defensive read-time expiry filter (#42 AC-5):
 * a promo whose end_date has passed is never returned as active, even if the
 * scheduled deactivation job hasn't run yet. includeInactive is the admin
 * management view (#47's list filter) and skips both filters.
 */
export async function listPromos({
  branchScope,
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

  if (branchScope && branchScope !== 'both') {
    // A promo scoped to 'both' matches either branch filter.
    query = query.in('branch_scope', [branchScope, 'both']);
  }

  const { data, error } = await query.order('name');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Promo[];
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

export async function createPromo({
  requesterId,
  input,
}: CreatePromoParams): Promise<Promo> {
  const { scope, ...promoFields } = input;

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

  return getPromoById(created.id);
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
