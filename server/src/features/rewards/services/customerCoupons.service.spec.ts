import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCouponsByIds,
  markCouponsRedeemed,
} from './customerCoupons.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const CUSTOMER_ID = 'customer-1';
const OTHER_CUSTOMER_ID = 'customer-2';

function buildCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    customer_id: CUSTOMER_ID,
    spin_wheel_reward_id: 'reward-1',
    spin_history_id: 'history-1',
    discount_type: 'Percentage',
    value: 10,
    is_redeemed: false,
    redeemed_at: null,
    redeemed_by_booking_id: null,
    redeemed_by_booking_group_id: null,
    expires_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('customerCoupons.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCouponsByIds', () => {
    it('returns [] without a query when no ids are given', async () => {
      const result = await getCouponsByIds(CUSTOMER_ID, []);

      expect(result).toEqual([]);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns the matching, owned, unredeemed, unexpired coupons', async () => {
      queueFromResults({ data: [buildCoupon()], error: null });

      const result = await getCouponsByIds(CUSTOMER_ID, ['coupon-1']);

      expect(result).toEqual([buildCoupon()]);
    });

    it('rejects a coupon id that does not exist', async () => {
      queueFromResults({ data: [], error: null });

      await expect(
        getCouponsByIds(CUSTOMER_ID, ['missing-coupon'])
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects a coupon that belongs to a different customer', async () => {
      queueFromResults({
        data: [buildCoupon({ customer_id: OTHER_CUSTOMER_ID })],
        error: null,
      });

      await expect(
        getCouponsByIds(CUSTOMER_ID, ['coupon-1'])
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an already-redeemed coupon', async () => {
      queueFromResults({
        data: [
          buildCoupon({
            is_redeemed: true,
            redeemed_at: '2026-09-05T00:00:00.000Z',
          }),
        ],
        error: null,
      });

      await expect(
        getCouponsByIds(CUSTOMER_ID, ['coupon-1'])
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects an expired coupon', async () => {
      queueFromResults({
        data: [buildCoupon({ expires_at: '2020-01-01T00:00:00.000Z' })],
        error: null,
      });

      await expect(
        getCouponsByIds(CUSTOMER_ID, ['coupon-1'])
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('markCouponsRedeemed', () => {
    it('does nothing when no ids are given', async () => {
      await markCouponsRedeemed([], { bookingId: 'booking-1' });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('resolves when every requested coupon was actually updated', async () => {
      queueFromResults({
        data: [{ id: 'coupon-1' }, { id: 'coupon-2' }],
        error: null,
      });

      await expect(
        markCouponsRedeemed(['coupon-1', 'coupon-2'], {
          bookingId: 'booking-1',
        })
      ).resolves.toBeUndefined();
    });

    it('throws 409 when fewer coupons were updated than requested (TOCTOU guard - one was already redeemed by another request)', async () => {
      queueFromResults({ data: [{ id: 'coupon-1' }], error: null });

      await expect(
        markCouponsRedeemed(['coupon-1', 'coupon-2'], {
          bookingId: 'booking-1',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
