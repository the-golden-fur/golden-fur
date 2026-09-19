import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as rewardsApi from '../../api/rewards.api';
import type { CustomerCoupon, SpinWheelReward } from '../../rewards.types';
import { CustomerRewardsPage } from './CustomerRewardsPage';

vi.mock('../../api/rewards.api', () => ({
  listSpinWheelRewards: vi.fn(),
  getMyCoupons: vi.fn(),
  getMySpinCredits: vi.fn(),
  spinTheWheel: vi.fn(),
}));

vi.mock('../../components/SpinWheel/SpinWheel', () => ({
  SpinWheel: () => null,
}));

function buildReward(overrides: Partial<SpinWheelReward> = {}): SpinWheelReward {
  return {
    id: 'reward-1',
    label: 'Ten Percent Off',
    discount_type: 'Percentage',
    value: 10,
    rarity_percent: 60,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

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
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(CustomerRewardsPage)
    )
  );
}

function stubDefaults(coupons: CustomerCoupon[] = [buildCoupon()]) {
  vi.mocked(rewardsApi.listSpinWheelRewards).mockResolvedValue({
    data: [buildReward()],
    error: null,
  });
  vi.mocked(rewardsApi.getMyCoupons).mockResolvedValue({
    data: coupons,
    error: null,
  });
  vi.mocked(rewardsApi.getMySpinCredits).mockResolvedValue({
    data: 2,
    error: null,
  });
}

describe('CustomerRewardsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when the customer has no coupons', async () => {
    stubDefaults([]);

    renderPage();

    expect(
      await screen.findByText('No coupons yet - keep booking to earn a spin!')
    ).toBeInTheDocument();
  });

  it('lists coupons in a combined table, with the linked reward label', async () => {
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

    expect(
      container.querySelectorAll('section[class*="column"]')
    ).toHaveLength(2);
  });
});
