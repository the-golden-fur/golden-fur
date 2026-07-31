import { supabase } from '../../../config/supabase/supabase.config.ts';
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

/** Discounts/promos have no branch_id/name lookup table of their own for
 * 'makati'/'southwoods' - branches.name is 'Makati'/'Southwoods' (M01
 * account-creation copy), lowercased here to match promos.branch_scope's
 * vocabulary, mirroring how promos.service.ts's own branchScope filter is
 * already fed a lowercase string by its caller. */
function branchScopeFromName(branchName: string): 'makati' | 'southwoods' {
  return branchName.toLowerCase() === 'makati' ? 'makati' : 'southwoods';
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
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .eq('branch_id', booking.branch_id)
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  const lines: DraftLineItem[] = [];

  for (const discount of (data ?? []) as DiscountRow[]) {
    const scopeMatches =
      (discount.scope_type === 'service' &&
        discount.scope_service_id === booking.service_id) ||
      (discount.scope_type === 'package' &&
        discount.scope_package_id === booking.package_id) ||
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
  start_date: string | null;
  end_date: string | null;
  discount_type: 'Percentage' | 'Flat';
  value: number;
  scope_type: 'all_services' | 'specific';
  promo_scope: Array<{ service_id: string | null; package_id: string | null }>;
}

export interface EvaluatedPromo {
  promoId: string;
  line: DraftLineItem;
}

/**
 * Auto-applies every active, in-window, scope-matching promo (Issue #84
 * AC-2), then caps the combined contribution at promo_cap_configuration
 * (branch-specific row if one exists, else the system-wide default -
 * mirrors policy_configurations' own override pattern). When the uncapped
 * total exceeds the cap, promos are applied largest-value-first and the
 * last one that would cross the cap is trimmed to exactly fill the
 * remaining headroom; nothing beyond it is applied. This is a judgment call
 * (the Guide doesn't specify a tie-break order for which promos "win" under
 * a cap) - flagged here and in the verification doc.
 */
export async function evaluatePromos(
  booking: BookingForBilling,
  subtotal: number
): Promise<EvaluatedPromo[]> {
  const scope = branchScopeFromName(booking.branchName);
  const today = new Date().toISOString().slice(0, 10);

  const { data: promos, error } = await supabase
    .from('promos')
    .select('*, promo_scope(*)')
    .eq('is_active', true)
    .in('branch_scope', [scope, 'both']);

  if (error) throwWithStatus(400, error.message);

  const matched = ((promos ?? []) as PromoRow[]).filter((promo) => {
    if (promo.start_date && promo.start_date > today) return false;
    if (promo.end_date && promo.end_date < today) return false;
    if (promo.scope_type === 'all_services') return true;

    return promo.promo_scope.some(
      (scopeRow) =>
        (scopeRow.service_id && scopeRow.service_id === booking.service_id) ||
        (scopeRow.package_id && scopeRow.package_id === booking.package_id)
    );
  });

  if (matched.length === 0) return [];

  const capRow = await getEffectivePromoCap(booking.branch_id);
  const capAmount =
    capRow.cap_type === 'percentage'
      ? (subtotal * Number(capRow.cap_value)) / 100
      : Number(capRow.cap_value);

  const withAmounts = matched
    .map((promo) => ({
      promo,
      amount: round2(
        promo.discount_type === 'Percentage'
          ? (subtotal * Number(promo.value)) / 100
          : Number(promo.value)
      ),
    }))
    .sort((a, b) => b.amount - a.amount);

  const applied: EvaluatedPromo[] = [];
  let remainingCap = capAmount;

  for (const { promo, amount } of withAmounts) {
    if (remainingCap <= 0) break;

    const appliedAmount = Math.min(amount, remainingCap);
    remainingCap = round2(remainingCap - appliedAmount);

    applied.push({
      promoId: promo.id,
      line: {
        line_item_type: 'promo',
        reference_id: promo.id,
        description: promo.name,
        quantity: 1,
        unit_price: -appliedAmount,
        line_total: -appliedAmount,
      },
    });
  }

  return applied;
}

interface PromoCapRow {
  cap_type: 'percentage' | 'flat';
  cap_value: number;
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
