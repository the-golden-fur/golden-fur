import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as rewardsApi from '../../api/rewards.api';
import type { SpinWheelReward } from '../../rewards.types';
import { AdminRewardsPage } from './AdminRewardsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/rewards.api', () => ({
  listSpinWheelRewards: vi.fn(),
  createSpinWheelReward: vi.fn(),
  updateSpinWheelReward: vi.fn(),
  archiveSpinWheelReward: vi.fn(),
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
    weight: 60,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    pools: [],
    ...overrides,
  };
}

function stubDefaults(rewards: SpinWheelReward[] = [buildReward()]) {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [{ id: 'staff-1', role: 'Admin' } as never],
    error: null,
  });
  vi.mocked(rewardsApi.listSpinWheelRewards).mockResolvedValue({
    data: rewards,
    error: null,
  });
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
      { initialEntries: ['/staff/admin/rewards'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/rewards',
            element: createElement(AdminRewardsPage),
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

describe('AdminRewardsPage (session 114)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a non-Admin/Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' } as never],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('lists rewards with their tier, weight, and pools in the default Table view', async () => {
    stubDefaults([
      buildReward({
        id: '1',
        label: 'Ten Percent Off',
        pools: [{ id: 'pool-1', name: 'Standard' }],
      }),
      buildReward({
        id: '2',
        label: 'Flat 50',
        discount_type: 'Flat',
        value: 50,
        rarity_tier: 'Legendary',
        weight: 2,
      }),
    ]);

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Ten Percent Off')).toBeInTheDocument();
    expect(screen.getByText('Legendary')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Not in any pool')).toBeInTheDocument();
  });

  it('never shows a "must total 100%" rule', async () => {
    stubDefaults([buildReward({ weight: 7 })]);

    renderPage();
    await screen.findByText('Ten Percent Off');

    expect(screen.queryByText(/must equal 100/)).not.toBeInTheDocument();
  });

  it('"Add New Reward" opens a modal and saves title, tier, weight, and value', async () => {
    stubDefaults([]);
    vi.mocked(rewardsApi.createSpinWheelReward).mockResolvedValue({
      data: buildReward({ id: 'reward-new', label: 'New Reward' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Rewards' });
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add New Reward' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Reward' });
    await user.type(within(dialog).getByLabelText('Title'), 'New Reward');
    await user.type(within(dialog).getByLabelText(/^Value/), '10');
    await user.selectOptions(within(dialog).getByLabelText('Rarity'), 'Epic');
    // Picking a tier nudges the untouched suggested weight to that tier's
    // suggestion (Epic = 5).
    expect(within(dialog).getByLabelText(/^Weight/)).toHaveValue(5);
    await user.clear(within(dialog).getByLabelText(/^Weight/));
    await user.type(within(dialog).getByLabelText(/^Weight/), '3');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add reward' })
    );

    await waitFor(() =>
      expect(rewardsApi.createSpinWheelReward).toHaveBeenCalledWith('token', {
        label: 'New Reward',
        discount_type: 'Percentage',
        value: 10,
        rarity_tier: 'Epic',
        weight: 3,
      })
    );
    expect(await screen.findByText('New Reward')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects a weight of 0', async () => {
    stubDefaults([]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Rewards' });

    await user.click(screen.getByRole('button', { name: 'Add New Reward' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Reward' });
    await user.type(within(dialog).getByLabelText('Title'), 'Zero');
    await user.type(within(dialog).getByLabelText(/^Value/), '5');
    await user.clear(within(dialog).getByLabelText(/^Weight/));
    await user.type(within(dialog).getByLabelText(/^Weight/), '0');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add reward' })
    );

    // The input's own min blocks the submit before handleRewardSubmit's
    // guard even runs - either way, nothing is saved.
    expect(within(dialog).getByLabelText(/^Weight/)).toBeInvalid();
    expect(rewardsApi.createSpinWheelReward).not.toHaveBeenCalled();
  });

  it('searching narrows the visible rewards', async () => {
    stubDefaults([
      buildReward({ id: '1', label: 'Ten Percent Off' }),
      buildReward({ id: '2', label: 'Flat 50' }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.type(screen.getByPlaceholderText('Search rewards...'), 'flat');

    expect(screen.queryByText('Ten Percent Off')).not.toBeInTheDocument();
    expect(screen.getByText('Flat 50')).toBeInTheDocument();
  });

  it('switches to Board view, grouped by Rarity by default', async () => {
    stubDefaults([
      buildReward({ id: '1', label: 'Ten Percent Off', rarity_tier: 'Common' }),
      buildReward({ id: '2', label: 'Flat 50', rarity_tier: 'Epic' }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(screen.getByLabelText('Group by')).toHaveValue('tier');
    expect(screen.getByText(/Ten Percent Off/)).toBeInTheDocument();
    expect(screen.getByText(/Flat 50/)).toBeInTheDocument();
  });

  it('toggles a reward active/inactive from the "..." menu', async () => {
    stubDefaults();
    vi.mocked(rewardsApi.updateSpinWheelReward).mockResolvedValue({
      data: buildReward({ is_active: false }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Ten Percent Off' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(rewardsApi.updateSpinWheelReward).toHaveBeenCalledWith(
        'reward-1',
        'token',
        { is_active: false }
      )
    );
  });

  it('archives a reward from the "..." menu once it is inactive', async () => {
    stubDefaults([buildReward({ is_active: false })]);
    vi.mocked(rewardsApi.archiveSpinWheelReward).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Ten Percent Off' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(rewardsApi.archiveSpinWheelReward).toHaveBeenCalledWith(
        'reward-1',
        'token'
      )
    );
    expect(screen.queryByText('Ten Percent Off')).not.toBeInTheDocument();
  });

  it('Configure opens a pre-filled edit modal and saves via updateSpinWheelReward', async () => {
    stubDefaults([buildReward({ rarity_tier: 'Rare', weight: 12 })]);
    vi.mocked(rewardsApi.updateSpinWheelReward).mockResolvedValue({
      data: buildReward({ label: 'Fifteen Percent Off', value: 15 }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Ten Percent Off' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit reward' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue(
      'Ten Percent Off'
    );
    expect(within(dialog).getByLabelText('Rarity')).toHaveValue('Rare');
    expect(within(dialog).getByLabelText(/^Weight/)).toHaveValue(12);

    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(
      within(dialog).getByLabelText('Title'),
      'Fifteen Percent Off'
    );
    await user.clear(within(dialog).getByLabelText(/^Value/));
    await user.type(within(dialog).getByLabelText(/^Value/), '15');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() =>
      expect(rewardsApi.updateSpinWheelReward).toHaveBeenCalledWith(
        'reward-1',
        'token',
        {
          label: 'Fifteen Percent Off',
          discount_type: 'Percentage',
          value: 15,
          rarity_tier: 'Rare',
          weight: 12,
        }
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
