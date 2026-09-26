import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as rewardsApi from '../../api/rewards.api';
import {
  SpinCreditsContext,
  type SpinCreditsContextValue,
} from '../../providers/SpinCreditsContext';
import type {
  CustomerCoupon,
  PromoWheel,
  SpinCreditSummary,
} from '../../rewards.types';
import { CustomerRewardsPage } from './CustomerRewardsPage';

vi.mock('../../api/rewards.api', () => ({
  getMyCoupons: vi.fn(),
  getPromoWheel: vi.fn(),
  spinTheWheel: vi.fn(),
}));

vi.mock('../../components/SpinWheel/SpinWheel', () => ({
  SpinWheel: ({ rewards }: { rewards: Array<{ label: string }> }) =>
    createElement(
      'div',
      { 'data-testid': 'wheel' },
      rewards.map((reward) => reward.label).join(', ')
    ),
}));

function buildCoupon(overrides: Partial<CustomerCoupon> = {}): CustomerCoupon {
  return {
    id: 'coupon-1',
    customer_id: 'customer-1',
    spin_wheel_reward_id: 'reward-1',
    spin_history_id: null,
    discount_type: 'Percentage',
    value: 10,
    is_redeemed: false,
    redeemed_at: null,
    redeemed_by_booking_id: null,
    redeemed_by_booking_group_id: null,
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    reward_label: 'Ten Percent Off',
    ...overrides,
  };
}

function buildWheel(promoId: string, label: string): PromoWheel {
  return {
    promoId,
    promoName: promoId,
    rarestTier: 'Rare',
    pityThreshold: 10,
    rewards: [
      {
        id: `${promoId}-reward`,
        label,
        discount_type: 'Percentage',
        value: 10,
        rarity_tier: 'Rare',
        chance_percent: 100,
      },
    ],
  };
}

const TWO_PROMOS: SpinCreditSummary = {
  total: 3,
  byPromo: [
    { promoId: 'promo-loyalty', promoName: 'Loyalty Spin', count: 2 },
    { promoId: 'promo-monthly', promoName: 'Monthly Login Bonus', count: 1 },
  ],
};

function renderPage(summary: SpinCreditSummary = TWO_PROMOS) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };
  const spinValue: SpinCreditsContextValue = {
    summary,
    total: summary.total,
    isLoading: false,
    refresh: vi.fn(),
  };

  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(
        SpinCreditsContext.Provider,
        { value: spinValue },
        createElement(CustomerRewardsPage)
      )
    )
  );
}

function stubDefaults(coupons: CustomerCoupon[] = [buildCoupon()]) {
  vi.mocked(rewardsApi.getMyCoupons).mockResolvedValue({
    data: coupons,
    error: null,
  });
  vi.mocked(rewardsApi.getPromoWheel).mockImplementation(
    async (_token, promoId) => ({
      data: buildWheel(
        promoId,
        promoId === 'promo-monthly' ? 'Rare Prize' : 'Common Prize'
      ),
      error: null,
    })
  );
}

describe('CustomerRewardsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when the customer has no coupons', async () => {
    stubDefaults([]);

    renderPage();

    expect(
      await screen.findByText('No coupons yet - spin a wheel to win one!')
    ).toBeInTheDocument();
  });

  it('lists coupons in a combined table, with the reward title from the server', async () => {
    stubDefaults([
      buildCoupon({ id: '1' }),
      buildCoupon({ id: '2', is_redeemed: true, redeemed_at: '2026-02-01' }),
    ]);

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('10% off').length).toBe(2);
    expect(screen.getAllByText('Ten Percent Off').length).toBe(2);
  });

  it('a Status filter tile narrows to Used coupons', async () => {
    stubDefaults([
      buildCoupon({ id: '1', is_redeemed: false }),
      buildCoupon({ id: '2', is_redeemed: true }),
    ]);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table');
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Status' }));

    // Status defaults to Available - only the unredeemed coupon remains.
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('switches to Board view, grouped by Status', async () => {
    stubDefaults([
      buildCoupon({ id: '1', is_redeemed: false }),
      buildCoupon({ id: '2', is_redeemed: true }),
    ]);

    const user = userEvent.setup();
    const { container } = renderPage();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(container.querySelectorAll('section[class*="column"]')).toHaveLength(
      2
    );
  });

  describe('per-promo wheels (session 114)', () => {
    it('shows the total spin count and one button per promo with its count', async () => {
      stubDefaults();

      renderPage();

      expect(await screen.findByText('3')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Loyalty Spin ×2' })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByRole('button', { name: 'Monthly Login Bonus ×1' })
      ).toBeInTheDocument();
      expect(await screen.findByTestId('wheel')).toHaveTextContent(
        'Common Prize'
      );
    });

    it("switching promos loads that promo's own wheel and spins it", async () => {
      stubDefaults();
      vi.mocked(rewardsApi.spinTheWheel).mockResolvedValue({
        data: {
          rewardId: 'promo-monthly-reward',
          wasPity: false,
          couponId: 'coupon-9',
          historyId: 'history-9',
          promoId: 'promo-monthly',
        },
        error: null,
      });

      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('wheel');

      await user.click(
        screen.getByRole('button', { name: 'Monthly Login Bonus ×1' })
      );
      expect(await screen.findByTestId('wheel')).toHaveTextContent(
        'Rare Prize'
      );

      await user.click(screen.getByRole('button', { name: 'Spin the wheel' }));

      await waitFor(() =>
        expect(rewardsApi.spinTheWheel).toHaveBeenCalledWith('token', {
          promoId: 'promo-monthly',
        })
      );
    });

    it('with no spins, shows how to earn one and disables spinning', async () => {
      stubDefaults();

      renderPage({ total: 0, byPromo: [] });

      expect(
        await screen.findByText(
          'No spins right now - keep booking and logging in to earn one!'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Spin the wheel' })
      ).toBeDisabled();
    });
  });
});
