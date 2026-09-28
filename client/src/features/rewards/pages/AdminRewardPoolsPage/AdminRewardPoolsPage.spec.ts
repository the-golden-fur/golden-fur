import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as rewardsApi from '../../api/rewards.api';
import type { RewardPool, SpinWheelReward } from '../../rewards.types';
import { AdminRewardPoolsPage } from './AdminRewardPoolsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/rewards.api', () => ({
  listRewardPools: vi.fn(),
  listSpinWheelRewards: vi.fn(),
  createRewardPool: vi.fn(),
  updateRewardPool: vi.fn(),
  archiveRewardPool: vi.fn(),
}));

function buildReward(
  overrides: Partial<SpinWheelReward> = {}
): SpinWheelReward {
  return {
    id: 'reward-1',
    label: 'Ten Percent Off',
    discount_type: 'Percentage',
    value: 10,
    rarity_tier: 'Common',
    weight: 10,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildPool(overrides: Partial<RewardPool> = {}): RewardPool {
  return {
    id: 'pool-1',
    name: 'Standard',
    description: null,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    rewards: [{ ...buildReward(), chance_percent: 100 }],
    active_reward_count: 1,
    rarest_tier: 'Common',
    promos: [{ id: 'promo-1', name: 'Loyalty Spin', is_active: true }],
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/pools'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/pools',
            element: createElement(AdminRewardPoolsPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AdminRewardPoolsPage (session 114)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(rewardsApi.listRewardPools).mockResolvedValue({
      data: [buildPool()],
      error: null,
    });
    vi.mocked(rewardsApi.listSpinWheelRewards).mockResolvedValue({
      data: [buildReward()],
      error: null,
    });
  });

  it('redirects a non-Admin/Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Cashier' } as never],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it("lists pools with each reward's chance and the promos using them", async () => {
    renderPage();

    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Ten Percent Off (100%)')).toBeInTheDocument();
    expect(screen.getByText('Loyalty Spin')).toBeInTheDocument();
  });

  it('flags a pool with no active rewards', async () => {
    vi.mocked(rewardsApi.listRewardPools).mockResolvedValue({
      data: [
        buildPool({
          rewards: [],
          active_reward_count: 0,
          rarest_tier: null,
          promos: [],
        }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('No active rewards')).toBeInTheDocument();
  });

  it('"Add New Reward Pool" opens the builder and creates the pool', async () => {
    vi.mocked(rewardsApi.createRewardPool).mockResolvedValue({
      data: buildPool({ id: 'pool-2', name: 'Rare Rewards', promos: [] }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard');

    await user.click(
      screen.getByRole('button', { name: 'Add New Reward Pool' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Add New Reward Pool' });
    await user.type(within(dialog).getByLabelText('Pool name'), 'Rare Rewards');
    await user.click(
      within(dialog).getByRole('checkbox', { name: /Ten Percent Off/ })
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create pool' })
    );

    await waitFor(() =>
      expect(rewardsApi.createRewardPool).toHaveBeenCalledWith('token', {
        name: 'Rare Rewards',
        description: null,
        reward_ids: ['reward-1'],
      })
    );
    expect(await screen.findByText('Reward pool created.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a row offers Configure, Rename and Archive - never Deactivate/Activate', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Standard' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
  });

  it('Rename saves only the pool name', async () => {
    vi.mocked(rewardsApi.updateRewardPool).mockResolvedValue({
      data: buildPool({ name: 'Premium' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Standard' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', {
      name: /new reward pool name/i,
    });
    await user.clear(input);
    await user.type(input, 'Premium');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(rewardsApi.updateRewardPool).toHaveBeenCalledWith(
        'pool-1',
        'token',
        { name: 'Premium' }
      )
    );
    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });

  it("shows the server's refusal when archiving a pool an active promo uses", async () => {
    vi.mocked(rewardsApi.archiveRewardPool).mockResolvedValue({
      data: null,
      error: 'This pool is used by active spin-wheel promo(s): Loyalty Spin.',
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Standard' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(
      await screen.findByText(
        'This pool is used by active spin-wheel promo(s): Loyalty Spin.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('archives a pool after confirming and removes it from the list', async () => {
    vi.mocked(rewardsApi.archiveRewardPool).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Standard' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(rewardsApi.archiveRewardPool).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(rewardsApi.archiveRewardPool).toHaveBeenCalledWith(
        'pool-1',
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Standard')).not.toBeInTheDocument()
    );
  });
});
