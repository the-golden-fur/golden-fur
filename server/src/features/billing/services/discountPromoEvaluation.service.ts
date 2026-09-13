import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  isPromoCurrentlyEligible,
  type PromoType,
} from '../../../shared/services/promoEligibility/promoEligibility.service.ts';
import {
  applyPromoCap,
  type PromoCapRow,
} from '../../../shared/services/promoCap/promoCap.service.ts';
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
  discount_type: 'Percentage' | 'Flat';
  value: number;
  scope_type: 'service' | 'package' | 'category';
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
 * flags are an *additional* gate on top of that, not a replacement -
 * matching by exact name is safe here because updateDiscount
 * (discounts.service.ts) already blocks renaming a mandated row.
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
        discount.name === 'Senior Citizen Discount' &&
        !eligibility.seniorCitizenEligible
      ) {
        continue;
      }
      if (discount.name === 'PWD Discount' && !eligibility.pwdEligible) {
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
  scope_type: 'all_services' | 'specific';
  promo_scope: Array<{ service_id: string | null; package_id: string | null }>;
  promo_branch_availability: Array<{
    branch_id: string;
    is_available: boolean;
  }>;
}

/** Custom change (promos/coupons multiselect booking step): widened so the
 * same shape can represent either an auto-evaluated promo (this file) or a
 * booking-time-locked-in promo/coupon selection read back from
 * booking_promo_selections (checkoutAggregation.service.ts) - exactly one
 * of promoId/couponId is ever set. evaluatePromos below only ever produces
 * promo entries (couponId always null) - see its own doc comment on why
 * coupons never reach this auto-evaluate path. */
export interface EvaluatedPromo {
  promoId: string | null;
  couponId: string | null;
  line: DraftLineItem;
}

/**
 * Auto-applies every active, in-window, scope-matching promo (Issue #84
 * AC-2), then caps the combined contribution at promo_cap_configuration
 * (branch-specific row if one exists, else the system-wide default -
 * mirrors policy_configurations' own override pattern).
 *
 * A 'percentage'/'flat' cap trims by amount: promos are applied
 * largest-value-first and the last one that would cross the cap is trimmed
 * to exactly fill the remaining headroom; nothing beyond it is applied. This
 * is a judgment call (the Guide doesn't specify a tie-break order for which
 * promos "win" under a cap) - flagged here and in the verification doc.
 *
 * A 'count' cap instead limits how many promos may combine, at their full
 * value - the largest-value cap_value promos are applied in full and the
 * rest are dropped entirely (no partial-amount trimming, since a "count"
 * has no notion of a fractional promo).
 */
/**
 * Custom change (promo variations): coupons are deliberately NOT evaluated
 * here. A coupon (a per-customer, single-use spin-wheel reward - see
 * customer_coupons/rewards.types.ts) is only ever applied by explicit
 * customer/receptionist choice at the new booking-time Promos & Coupons
 * step (resolveDiscountAndPromos in booking.service.ts) - unlike a promo,
 * it never gets auto-applied at checkout when nothing was pre-selected,
 * since silently spending a customer's coupon without their say-so would be
 * surprising.
 */
export async function evaluatePromos(
  booking: BookingForBilling,
  subtotal: number
): Promise<EvaluatedPromo[]> {
  const { data: promos, error } = await supabase
    .from('promos')
    .select(
      '*, promo_scope(*), promo_branch_availability(branch_id, is_available)'
    )
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  const matched = ((promos ?? []) as PromoRow[]).filter((promo) => {
    const availableAtBranch = promo.promo_branch_availability.some(
      (row) => row.branch_id === booking.branch_id && row.is_available
    );
    if (!availableAtBranch) return false;

    if (!isPromoCurrentlyEligible(promo)) return false;
    if (promo.scope_type === 'all_services') return true;

    return promo.promo_scope.some((scopeRow) =>
      booking.items.some(
        (item) =>
          (scopeRow.service_id && scopeRow.service_id === item.service_id) ||
          (scopeRow.package_id && scopeRow.package_id === item.package_id)
      )
    );
  });

  if (matched.length === 0) return [];

  const capRow = await getEffectivePromoCap(booking.branch_id);

  const candidates = matched.map((promo) => ({
    key: promo,
    amount: round2(
      promo.discount_type === 'Percentage'
        ? (subtotal * Number(promo.value)) / 100
        : Number(promo.value)
    ),
  }));

  return applyPromoCap(candidates, capRow, subtotal).map(
    ({ key: promo, amount }) => ({
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
    })
  );
}

async function getEffectivePromoCap(branchId: string): Promise<PromoCapRow> {
  const { data: branchRow, error: branchError } = await supabase
    .from('promo_cap_configuration')
    .select('cap_type, cap_value')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);
  if (branchRow) return branchRow;

  const { data: defaultRow, error: defaultError } = await supabase
    .from('promo_cap_configuration')
    .select('cap_type, cap_value')
    .is('branch_id', null)
    .maybeSingle();

  if (defaultError) throwWithStatus(400, defaultError.message);
  if (!defaultRow) {
    throwWithStatus(500, 'No default promo cap configuration row exists');
  }

  return defaultRow;
}
