import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMySpinCredits, spin } from './spinWheel.service.ts';
import { recordCheckIn } from './checkIn.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRoleOrNull: vi.fn(),
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
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);
    return builder as never;
  });
}

const CUSTOMER_ID = 'customer-1';

const UNCONSUMED_CREDITS = [
  { promo_id: 'promo-loyalty', promos: { name: 'Loyalty Spin' } },
  { promo_id: 'promo-loyalty', promos: { name: 'Loyalty Spin' } },
  { promo_id: 'promo-monthly', promos: { name: 'Monthly Login Bonus' } },
];

describe('spinWheel.service / checkIn.service (session 114)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
  });

  it('getMySpinCredits groups unconsumed credits by promo, with a total', async () => {
    queueFromResults({ data: UNCONSUMED_CREDITS, error: null });

    const summary = await getMySpinCredits({ requesterId: CUSTOMER_ID });

    expect(summary).toEqual({
      total: 3,
      byPromo: [
        { promoId: 'promo-loyalty', promoName: 'Loyalty Spin', count: 2 },
        {
          promoId: 'promo-monthly',
          promoName: 'Monthly Login Bonus',
          count: 1,
        },
      ],
    });
  });

  it('spin passes the chosen promo to the RPC and maps the result', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          reward_id: 'reward-1',
          was_pity: true,
          coupon_id: 'coupon-1',
          history_id: 'history-1',
          wheel_promo_id: 'promo-monthly',
        },
      ],
      error: null,
    } as never);

    const result = await spin({
      requesterId: CUSTOMER_ID,
      promoId: 'promo-monthly',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('spin_wheel', {
      p_customer_id: CUSTOMER_ID,
      p_promo_id: 'promo-monthly',
    });
    expect(result).toEqual({
      rewardId: 'reward-1',
      wasPity: true,
      couponId: 'coupon-1',
      historyId: 'history-1',
      promoId: 'promo-monthly',
    });
  });

  it('spin maps "no credit" to 400 and "empty pool" to 409', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'spin_wheel: no available spin credit for customer x' },
    } as never);
    await expect(spin({ requesterId: CUSTOMER_ID })).rejects.toMatchObject({
      statusCode: 400,
      message: 'No spin credits available',
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'spin_wheel: reward pool has no active rewards' },
    } as never);
    await expect(spin({ requesterId: CUSTOMER_ID })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('a customer cannot spin on behalf of another customer', async () => {
    await expect(
      spin({ requesterId: CUSTOMER_ID, customerId: 'customer-2' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('recordCheckIn refuses staff accounts', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');

    await expect(recordCheckIn('staff-1')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('recordCheckIn calls record_customer_login and returns grants plus the credit summary', async () => {
    queueFromResults(
      { data: { id: CUSTOMER_ID }, error: null }, // customer profile
      { data: UNCONSUMED_CREDITS, error: null } // credit summary
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          granted_promo_id: 'promo-monthly',
          granted_source: 'monthly_login_streak',
          granted_credit_id: 'credit-9',
        },
      ],
      error: null,
    } as never);

    const result = await recordCheckIn(CUSTOMER_ID);

    expect(supabase.rpc).toHaveBeenCalledWith('record_customer_login', {
      p_customer_id: CUSTOMER_ID,
    });
    expect(result.granted).toEqual([
      { promoId: 'promo-monthly', source: 'monthly_login_streak' },
    ]);
    expect(result.credits.total).toBe(3);
  });
});
