import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  isPromoCurrentlyEligible,
  type PromoType,
} from '../../../shared/services/promoEligibility/promoEligibility.service.ts';
import type { DraftLineItem } from '../billing.types.ts';
import type { BookingForBilling } from './lineItemSources.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface DiscountRow {
  id: string;
  name: string;
  is_mandated: boolean;
  mandated_kind: 'senior_citizen' | 'pwd' | null;
  discount_type: 'Percentage' | 'Flat';
  value: number;
  scope_type: 'service' | 'package' | 'category' | 'misc_sale';
  scope_service_id: string | null;
  scope_package_id: string | null;
  scope_category: string | null;
  discount_branch_availability: Array<{
    branch_id: string;
    is_available: boolean;
  }>;
}

export interface DiscountEligibility {
  seniorCitizenEligible: boolean;
  pwdEligible: boolean;
}

/**
 * Auto-applies every active discount whose scope matches the booking
 * (Issue #84 AC-2 - no manual code entry). Mandated discounts (Senior
 * Citizen 20%, PWD - #44 seed) still must match scope like any other
 * discount (an Admin enables them per branch+category); the eligibility
 * flags are an *additional* gate on top of that, not a replacement. The
 * gate keys on mandated_kind (20260928220), not the display name, so an
 * admin renaming a mandated discount can't silently drop its eligibility
 * check.
 */
export async function evaluateDiscounts(
  booking: BookingForBilling,
  eligibility: DiscountEligibility,
  subtotal: number
): Promise<DraftLineItem[]> {
  // Discounts need staff to have verified an ID in person, which only ever
  // happens for a Cash payment - matches the same rule enforced at booking
  // creation (resolveDiscountAndPromo in booking.service.ts) so a booking
  // that falls through to this auto-evaluate path (nothing pre-selected)
  // can't pick up a discount its payment method wouldn't have allowed.
  if (booking.payment_method !== 'Cash') return [];

  const { data, error } = await supabase
    .from('discounts')
    .select('*, discount_branch_availability(branch_id, is_available)')
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  const lines: DraftLineItem[] = [];

  for (const discount of (data ?? []) as DiscountRow[]) {
    const availableAtBranch = discount.discount_branch_availability.some(
      (row) => row.branch_id === booking.branch_id && row.is_available
    );

    if (!availableAtBranch) continue;

    // Multi-item bookings revision: a discount scoped to a specific
    // service/package matches if ANY selected item matches - a booking with
    // several items can carry multiple applicable discounts (Sprint 5 M08's
    // combinability model per-item, not per-booking).
    const scopeMatches =
      (discount.scope_type === 'service' &&
        booking.items.some(
          (item) => item.service_id === discount.scope_service_id
        )) ||
      (discount.scope_type === 'package' &&
        booking.items.some(
          (item) => item.package_id === discount.scope_package_id
        )) ||
      (discount.scope_type === 'category' &&
        discount.scope_category === booking.service_category);

    if (!scopeMatches) continue;

    if (discount.is_mandated) {
      if (
        discount.mandated_kind === 'senior_citizen' &&
        !eligibility.seniorCitizenEligible
      ) {
        continue;
      }
      if (discount.mandated_kind === 'pwd' && !eligibility.pwdEligible) {
        continue;
      }
    }

    const amount =
      discount.discount_type === 'Percentage'
        ? (subtotal * Number(discount.value)) / 100
        : Number(discount.value);

    lines.push({
      line_item_type: 'discount',
      reference_id: discount.id,
      description: discount.name,
      quantity: 1,
      unit_price: -round2(amount),
      line_total: -round2(amount),
    });
  }

  return lines;
}

/** What the misc-sale wizard's Discount/Promo step lists for the cashier to
 * pick from - see listMiscSaleOptions. */
export interface MiscSaleDiscountOption {
  id: string;
  name: string;
  discount_type: 'Percentage' | 'Flat';
  value: number;
  is_mandated: boolean;
}

export interface MiscSalePromoOption {
  id: string;
  name: string;
  discount_type: 'Percentage' | 'Flat';
  value: number;
  end_date: string | null;
}

/**
 * Session 115: a misc sale has no service_id/package_id/service_category to
 * scope-match against, so only scope_type = 'misc_sale' discounts (migration
 * 20260927217) ever qualify. Deliberately separate from evaluateDiscounts'
 * own scopeMatches check, so a category/service/package-scoped discount can
 * never accidentally apply to a misc sale (or vice versa) through one
 * shared, harder-to-audit branch. Active, not archived, and available at
 * the cashier's branch - exactly what the admin Discounts page configures.
 */
async function loadMiscSaleDiscounts(branchId: string): Promise<DiscountRow[]> {
  const { data, error } = await supabase
    .from('discounts')
    .select('*, discount_branch_availability(branch_id, is_available)')
    .eq('is_active', true)
    .eq('scope_type', 'misc_sale')
    .is('archived_at', null);

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as DiscountRow[]).filter((discount) =>
    discount.discount_branch_availability.some(
      (row) => row.branch_id === branchId && row.is_available
    )
  );
}

/**
 * Cashier-picks model (replaces the session 115 auto-apply + Senior/PWD
 * checkbox gate): only the discounts the cashier ticked are applied, each
 * re-checked against loadMiscSaleDiscounts so a stale or forged id is
 * rejected rather than silently priced. Picking a mandated (Senior Citizen/
 * PWD) discount is the cashier's own ID-verified-onsite assertion, same as
 * a staff-picked discount_id at booking time (resolveDiscountAndPromos).
 * Still Cash-only (paymentMethod.service.ts's rule): a non-Cash sale gets
 * no discount lines even if some were picked.
 */
export async function evaluateMiscSaleDiscounts(params: {
  branchId: string;
  paymentMethod: string;
  discountIds: string[];
  subtotal: number;
}): Promise<DraftLineItem[]> {
  const discountIds = [...new Set(params.discountIds)];
  if (discountIds.length === 0 || params.paymentMethod !== 'Cash') return [];

  const available = await loadMiscSaleDiscounts(params.branchId);

  return discountIds.map((discountId) => {
    const discount = available.find((row) => row.id === discountId);
    if (!discount) {
      throwWithStatus(
        400,
        'A selected discount is no longer available for misc sales at this branch'
      );
    }

    const amount =
      discount.discount_type === 'Percentage'
        ? (params.subtotal * Number(discount.value)) / 100
        : Math.min(Number(discount.value), params.subtotal);

    return {
      line_item_type: 'discount',
      reference_id: discount.id,
      description: discount.name,
      quantity: 1,
      unit_price: -round2(amount),
      line_total: -round2(amount),
    };
  });
}

interface PromoRow {
  id: string;
  name: string;
  is_active: boolean;
  promo_type: PromoType;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null;
  discount_type: 'Percentage' | 'Flat';
  value: number;
  /** The promo cap (minimum order) - see Promo.min_spend (maintenance.types.ts). */
  min_spend: number | null;
  scope_type: 'all_services' | 'specific';
  promo_scope: Array<{ service_id: string | null; package_id: string | null }>;
  promo_branch_availability: Array<{
    branch_id: string;
    is_available: boolean;
  }>;
}

/** Custom change (promos/coupons multiselect booking step): a promo/coupon
 * line - either a booking-time-locked-in selection read back from
 * booking_promo_selections (checkoutAggregation.service.ts) or a cashier's
 * misc-sale pick (evaluateMiscSalePromos below). Exactly one of
 * promoId/couponId is ever set. */
export interface EvaluatedPromo {
  promoId: string | null;
  couponId: string | null;
  line: DraftLineItem;
}

async function loadDiscountPromos(): Promise<PromoRow[]> {
  const { data: promos, error } = await supabase
    .from('promos')
    .select(
      '*, promo_scope(*), promo_branch_availability(branch_id, is_available)'
    )
    .eq('is_active', true)
    // Session 114: spin-wheel promos hand out spins, never a discount; and
    // an archived promo must never auto-apply (a pre-existing gap - archive
    // requires is_active = false first, but a later reactivation of an
    // archived row would otherwise slip through).
    .neq('promo_type', 'spin_wheel')
    .is('archived_at', null);

  if (error) throwWithStatus(400, error.message);

  return (promos ?? []) as PromoRow[];
}

/** Builds the promo line items for promos that already passed their own
 * cap (min_spend): each applies in full, a Flat one limited to the
 * subtotal, and together they never take off more than the subtotal. */
function promoLines(picked: PromoRow[], subtotal: number): EvaluatedPromo[] {
  let remaining = subtotal;

  return picked.map((promo) => {
    const amount = round2(
      Math.min(
        promo.discount_type === 'Percentage'
          ? (subtotal * Number(promo.value)) / 100
          : Number(promo.value),
        remaining
      )
    );
    remaining = round2(remaining - amount);

    return {
      promoId: promo.id,
      couponId: null,
      line: {
        line_item_type: 'promo',
        reference_id: promo.id,
        description: promo.name,
        quantity: 1,
        unit_price: -amount,
        line_total: -amount,
      },
    };
  });
}

/**
 * Session 115: a misc sale has no service_id/package_id to scope-match, so
 * only 'all_services' promos can ever apply to one. Eligibility: active, in
 * its date/weekday window, not a spin wheel, not archived, available at the
 * branch.
 */
async function loadMiscSalePromos(branchId: string): Promise<PromoRow[]> {
  const promos = await loadDiscountPromos();

  return promos.filter(
    (promo) =>
      promo.scope_type === 'all_services' &&
      isPromoCurrentlyEligible(promo) &&
      promo.promo_branch_availability.some(
        (row) => row.branch_id === branchId && row.is_available
      )
  );
}

/**
 * Cashier-picks model: only the promos the cashier ticked, each re-checked
 * against loadMiscSalePromos (a stale/forged id is rejected) and against its
 * own cap (min_spend - the sale must reach it), then applied in full.
 */
export async function evaluateMiscSalePromos(params: {
  branchId: string;
  promoIds: string[];
  subtotal: number;
}): Promise<EvaluatedPromo[]> {
  const promoIds = [...new Set(params.promoIds)];
  if (promoIds.length === 0) return [];

  const available = await loadMiscSalePromos(params.branchId);

  const picked = promoIds.map((promoId) => {
    const promo = available.find((row) => row.id === promoId);
    if (!promo) {
      throwWithStatus(
        400,
        'A selected promo is no longer available for misc sales at this branch'
      );
    }
    if (promo.min_spend != null && params.subtotal < Number(promo.min_spend)) {
      throwWithStatus(
        400,
        `Promo "${promo.name}" needs a minimum order of PHP ${Number(promo.min_spend).toFixed(2)}`
      );
    }
    return promo;
  });

  return promoLines(picked, params.subtotal);
}

/** Backs GET /billing/misc-sale/options: every discount/promo the admin has
 * made available for misc sales at this branch right now, for the wizard's
 * Discount/Promo step to list. */
export async function listMiscSaleOptions(branchId: string): Promise<{
  discounts: MiscSaleDiscountOption[];
  promos: MiscSalePromoOption[];
}> {
  const [discounts, promos] = await Promise.all([
    loadMiscSaleDiscounts(branchId),
    loadMiscSalePromos(branchId),
  ]);

  return {
    discounts: discounts.map((discount) => ({
      id: discount.id,
      name: discount.name,
      discount_type: discount.discount_type,
      value: Number(discount.value),
      is_mandated: discount.is_mandated,
    })),
    promos: promos.map((promo) => ({
      id: promo.id,
      name: promo.name,
      discount_type: promo.discount_type,
      value: Number(promo.value),
      end_date: promo.end_date,
    })),
  };
}
