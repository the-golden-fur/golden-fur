import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CustomerCoupon } from '../rewards.types.ts';
import {
  resolveTargetCustomerId,
  type RequesterScopedParams,
} from './rewardsAccess.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** "My Rewards" - a customer's own unredeemed, unexpired coupons (or, for
 * staff, the named customer's - see resolveTargetCustomerId). Redeemed/
 * expired coupons are still returned (the customer-facing page separates
 * them into a "used" section) - only booking.service.ts's
 * resolveDiscountAndPromos filters strictly to spendable ones. */
export async function listMyCoupons(
  params: RequesterScopedParams
): Promise<CustomerCoupon[]> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { data, error } = await supabase
    .from('customer_coupons')
    .select('*')
    .eq('customer_id', targetCustomerId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as CustomerCoupon[];
}

/**
 * Batch-fetch + ownership/eligibility check, used by
 * booking.service.ts/bookingGroup.service.ts's resolveDiscountAndPromos
 * when a customer/receptionist selects one or more coupons at the new
 * Promos & Coupons booking step. Throws naming the specific coupon on any
 * failure, mirroring resolveDiscountAndPromo's existing promo/discount
 * error style.
 */
export async function getCouponsByIds(
  customerId: string,
  couponIds: string[]
): Promise<CustomerCoupon[]> {
  if (couponIds.length === 0) return [];

  const { data, error } = await supabase
    .from('customer_coupons')
    .select('*')
    .in('id', couponIds);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as CustomerCoupon[];
  const now = new Date();

  return couponIds.map((couponId) => {
    const row = rows.find((r) => r.id === couponId);

    if (!row) throwWithStatus(404, `Coupon ${couponId} not found`);
    if (row.customer_id !== customerId) {
      throwWithStatus(
        403,
        `Coupon ${couponId} does not belong to this customer`
      );
    }
    if (row.is_redeemed) {
      throwWithStatus(400, `Coupon ${couponId} has already been redeemed`);
    }
    if (row.expires_at && new Date(row.expires_at) < now) {
      throwWithStatus(400, `Coupon ${couponId} has expired`);
    }

    return row;
  });
}

/** Locks a set of coupons to the booking/booking_group that just applied
 * them - called from createBooking/createBookingGroup right after their own
 * insert succeeds, same "resolve, then lock in" order as
 * selected_discount_id/selected_promo_id today. Exactly one of
 * bookingId/bookingGroupId is expected, mirroring
 * booking_promo_selections' own CHECK constraint. */
export async function markCouponsRedeemed(
  couponIds: string[],
  redemption: { bookingId?: string; bookingGroupId?: string }
): Promise<void> {
  if (couponIds.length === 0) return;

  const { error } = await supabase
    .from('customer_coupons')
    .update({
      is_redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by_booking_id: redemption.bookingId ?? null,
      redeemed_by_booking_group_id: redemption.bookingGroupId ?? null,
    })
    .in('id', couponIds);

  if (error) throwWithStatus(400, error.message);
}
