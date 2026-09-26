import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import {
  isDiscountPromo,
  isPromoCurrentlyEligible,
} from '../../../shared/services/promoEligibility/promoEligibility.service.ts';
import type {
  Promo,
  PromoBranchAvailability,
  SpinWheelPromoSettings,
} from '../maintenance.types.ts';
import {
  spinWheelSettingsProblems,
  type CreatePromoInput,
  type SpinWheelSettingsInput,
  type UpdatePromoInput,
} from '../modules/validators/maintenance.validator.ts';

// promo_branch_availability(*) mirrors package_branch_availability's own
// SELECT shape (custom change: promos moved off the old branch_scope enum
// onto the same many-to-many join, migration 20260820141).
// spin_wheel_promo_settings (session 114) carries a spin_wheel promo's
// pool/pity/trigger settings, plus the pool's name for list display.
const PROMO_SELECT =
  '*, promo_scope(*), promo_branch_availability(*), spin_wheel_promo_settings(*, reward_pools(id, name))';

/** PostgREST returns a one-to-one embed as an object, but older
 * relationship detection can hand back a single-element array - normalize
 * so callers always see an object or null. */
function normalizePromo(row: Promo): Promo {
  const settings = row.spin_wheel_promo_settings as
    | SpinWheelPromoSettings
    | SpinWheelPromoSettings[]
    | null
    | undefined;

  return {
    ...row,
    spin_wheel_promo_settings: Array.isArray(settings)
      ? (settings[0] ?? null)
      : (settings ?? null),
  };
}

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListPromosParams {
  branchId?: string;
  includeInactive?: boolean;
  /** Session 114: spin-wheel promos are excluded unless asked for - only
   * the admin Promos tab wants them; the booking catalog and public catalog
   * list discount promos only. */
  includeSpinWheel?: boolean;
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
 * management view (#47's list filter) and skips this filter entirely.
 *
 * Custom change (promo variations): the old DB-level `.or(end_date...)`
 * filter only ever understood date_range promos - now that a
 * weekly_recurring promo can be "currently eligible" or not independent of
 * end_date, the eligibility check is done post-fetch via the shared
 * isPromoCurrentlyEligible predicate (also used by
 * resolveDiscountAndPromos/evaluatePromos) instead.
 *
 * Custom change: branchId now filters on the joined availability rows
 * (post-fetch, same as services.service.ts's listServices) rather than a
 * DB-level eq against the old branch_scope enum.
 */
export async function listPromos({
  branchId,
  includeInactive,
  includeSpinWheel,
}: ListPromosParams): Promise<Promo[]> {
  const { data, error } = await supabase
    .from('promos')
    .select(PROMO_SELECT)
    .is('archived_at', null)
    .order('name');

  if (error) throwWithStatus(400, error.message);

  let promos = ((data ?? []) as Promo[]).map(normalizePromo);

  if (!includeSpinWheel) {
    promos = promos.filter((promo) => isDiscountPromo(promo));
  }

  if (!includeInactive) {
    promos = promos.filter((promo) => isPromoCurrentlyEligible(promo));
  }

  if (!branchId) {
    return promos;
  }

  // Spin-wheel promos have no per-branch availability rows (their triggers
  // are customer-wide), so they match every branch.
  return promos.filter(
    (promo) =>
      !isDiscountPromo(promo) ||
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

  return normalizePromo(data as Promo);
}

/**
 * Session 114: a spin-wheel promo can only be live if its pool exists, isn't
 * archived, and has at least one active reward - otherwise it would grant
 * spins nobody can spin. Checked on create (when active) and whenever an
 * update leaves the promo active.
 */
async function assertPoolUsable(
  poolId: string,
  { requireLandable }: { requireLandable: boolean }
): Promise<void> {
  const { data, error } = await supabase
    .from('reward_pools')
    .select(
      'id, is_active, archived_at, reward_pool_rewards(spin_wheel_rewards(is_active, archived_at))'
    )
    .eq('id', poolId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  const pool = data as {
    is_active: boolean;
    archived_at: string | null;
    reward_pool_rewards?: Array<{
      spin_wheel_rewards: {
        is_active: boolean;
        archived_at: string | null;
      } | null;
    }>;
  } | null;

  if (!pool || pool.archived_at) {
    throwWithStatus(400, 'The selected reward pool does not exist');
  }

  if (!requireLandable) return;

  if (!pool.is_active) {
    throwWithStatus(
      400,
      'The selected reward pool is deactivated - activate it or pick another pool'
    );
  }

  const hasLandable = (pool.reward_pool_rewards ?? []).some(
    (member) =>
      member.spin_wheel_rewards?.is_active &&
      member.spin_wheel_rewards.archived_at === null
  );

  if (!hasLandable) {
    throwWithStatus(
      400,
      'The selected reward pool has no active rewards - add some before turning this spin wheel on'
    );
  }
}

function settingsRow(settings: Partial<SpinWheelSettingsInput>) {
  return {
    reward_pool_id: settings.reward_pool_id,
    pity_threshold: settings.pity_threshold ?? null,
    booking_milestone_interval: settings.booking_milestone_interval ?? null,
    spend_threshold_amount: settings.spend_threshold_amount ?? null,
    login_trigger: settings.login_trigger ?? null,
    login_streak_days: settings.login_streak_days ?? null,
  };
}

/** branch_ids (custom change) is inserted as its own set of
 * promo_branch_availability rows in the same call, mirroring
 * createPackage/createDiscount. */
export async function createPromo({
  requesterId,
  input,
}: CreatePromoParams): Promise<Promo> {
  const {
    scope,
    branch_ids: branchIds,
    spin_wheel: spinWheel,
    ...promoFields
  } = input;

  if (promoFields.promo_type === 'spin_wheel') {
    if (!spinWheel) {
      throwWithStatus(400, 'A spin wheel promo needs a reward pool');
    }
    await assertPoolUsable(spinWheel.reward_pool_id, {
      requireLandable: true,
    });
  }

  const { data: created, error } = await supabase
    .from('promos')
    .insert({
      ...promoFields,
      start_date: promoFields.start_date ?? null,
      end_date: promoFields.end_date ?? null,
      days_of_week: promoFields.days_of_week ?? null,
      condition_note: promoFields.condition_note ?? null,
      created_by: requesterId,
      updated_by: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !created) {
    throwWithStatus(400, error?.message ?? 'Failed to create promo');
  }

  if (spinWheel) {
    const { error: settingsError } = await supabase
      .from('spin_wheel_promo_settings')
      .insert({ promo_id: created.id, ...settingsRow(spinWheel) });

    if (settingsError) {
      // Don't leave a spin_wheel promo with no settings behind.
      await supabase.from('promos').delete().eq('id', created.id);
      throwWithStatus(400, settingsError.message);
    }

    return getPromoById(created.id);
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
      (branchIds ?? []).map((branchId) => ({
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
    .select('id, promo_type')
    .eq('id', promoId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!existing) throwWithStatus(404, 'Promo not found');
  if (existing.promo_type === 'spin_wheel') {
    throwWithStatus(
      400,
      'A spin wheel promo applies to every branch - it has no branch availability'
    );
  }

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
  const { scope, spin_wheel: spinWheelUpdates, ...promoFields } = updates;

  const existing = await getPromoById(promoId);

  if (existing.promo_type === 'spin_wheel') {
    return updateSpinWheelPromo({
      requesterId,
      existing,
      promoFields,
      scope,
      spinWheelUpdates,
    });
  }

  if (spinWheelUpdates !== undefined) {
    throwWithStatus(
      400,
      "spin_wheel settings can only be set on a 'spin_wheel' promo"
    );
  }

  const effective = {
    start_date:
      promoFields.start_date !== undefined
        ? promoFields.start_date
        : existing.start_date,
    end_date:
      promoFields.end_date !== undefined
        ? promoFields.end_date
        : existing.end_date,
    // Immutable after creation - updatePromoValidator never accepts
    // promo_type, so the effective value is always the stored one.
    promo_type: existing.promo_type,
    days_of_week:
      promoFields.days_of_week !== undefined
        ? promoFields.days_of_week
        : existing.days_of_week,
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

  // Custom change (promo variations): days_of_week only ever belongs to a
  // weekly_recurring promo, and (since promo_type can't change after
  // creation) that promo must always have at least one day set.
  if (effective.promo_type === 'weekly_recurring') {
    if (effective.condition_note) {
      throwWithStatus(
        400,
        'A weekly recurring promo cannot have a condition_note'
      );
    }
    if (!(effective.days_of_week ?? []).length) {
      throwWithStatus(
        400,
        'A weekly recurring promo needs at least one day of the week'
      );
    }
  } else if (promoFields.days_of_week !== undefined) {
    throwWithStatus(
      400,
      "days_of_week can only be set on a 'weekly_recurring' promo"
    );
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
 * Session 114: update path for a promo_type = 'spin_wheel' promo. Discount
 * and scope fields never apply; the spin_wheel settings patch is merged over
 * the stored settings row and the merged result re-checked as a whole
 * (spinWheelSettingsProblems) - the same "validate the merged state" rule
 * updatePromo already uses for dates/scope.
 */
async function updateSpinWheelPromo({
  requesterId,
  existing,
  promoFields,
  scope,
  spinWheelUpdates,
}: {
  requesterId: string;
  existing: Promo;
  promoFields: Omit<UpdatePromoInput, 'scope' | 'spin_wheel'>;
  scope: UpdatePromoInput['scope'];
  spinWheelUpdates: UpdatePromoInput['spin_wheel'];
}): Promise<Promo> {
  const forbidden = (
    ['discount_type', 'value', 'scope_type', 'days_of_week'] as const
  ).filter((field) => promoFields[field] !== undefined);

  if (forbidden.length > 0 || scope !== undefined) {
    throwWithStatus(
      400,
      `A spin wheel promo has no ${[...forbidden, ...(scope !== undefined ? ['scope'] : [])].join(', ')}`
    );
  }

  if (promoFields.condition_note) {
    throwWithStatus(400, 'A spin wheel promo cannot have a condition_note');
  }

  const startDate =
    promoFields.start_date !== undefined
      ? promoFields.start_date
      : existing.start_date;
  const endDate =
    promoFields.end_date !== undefined
      ? promoFields.end_date
      : existing.end_date;

  if (startDate && endDate && endDate < startDate) {
    throwWithStatus(400, 'end_date must be on or after start_date');
  }

  const stored = existing.spin_wheel_promo_settings;
  const merged: Partial<SpinWheelSettingsInput> = {
    reward_pool_id: stored?.reward_pool_id,
    pity_threshold: stored?.pity_threshold ?? null,
    booking_milestone_interval: stored?.booking_milestone_interval ?? null,
    spend_threshold_amount:
      stored?.spend_threshold_amount != null
        ? Number(stored.spend_threshold_amount)
        : null,
    login_trigger: stored?.login_trigger ?? null,
    login_streak_days: stored?.login_streak_days ?? null,
    ...spinWheelUpdates,
  };

  const problems = spinWheelSettingsProblems(merged);
  if (problems.length > 0) {
    throwWithStatus(400, problems.map((problem) => problem.message).join('; '));
  }

  const willBeActive = promoFields.is_active ?? existing.is_active;
  const poolChanged = merged.reward_pool_id !== stored?.reward_pool_id;

  // Re-check the pool whenever the promo ends up (or stays) switched on and
  // either the pool changed or the promo is being turned on now.
  if (poolChanged || (willBeActive && !existing.is_active)) {
    await assertPoolUsable(merged.reward_pool_id as string, {
      requireLandable: willBeActive,
    });
  }

  // condition_note can only be null/absent here (rejected above otherwise).
  if (Object.keys(promoFields).length > 0) {
    const { error: updateError } = await supabase
      .from('promos')
      .update({
        ...promoFields,
        updated_by: requesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) throwWithStatus(400, updateError.message);
  }

  if (spinWheelUpdates !== undefined) {
    const { error: settingsError } = await supabase
      .from('spin_wheel_promo_settings')
      .upsert(
        {
          promo_id: existing.id,
          ...settingsRow(merged),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'promo_id' }
      );

    if (settingsError) throwWithStatus(400, settingsError.message);
  }

  return getPromoById(existing.id);
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
