import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as rewardsApi from '../../api/rewards.api';
import type { SpinWheelConfig, SpinWheelReward } from '../../rewards.types';
import { AdminSpinWheelConfigPage } from './AdminSpinWheelConfigPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/rewards.api', () => ({
  getSpinWheelConfig: vi.fn(),
  updateSpinWheelConfig: vi.fn(),
  listSpinWheelRewards: vi.fn(),
  createSpinWheelReward: vi.fn(),
  updateSpinWheelReward: vi.fn(),
  archiveSpinWheelReward: vi.fn(),
}));

const CONFIG: SpinWheelConfig = {
  id: 'config-1',
  bookings_milestone_interval: 5,
  spend_threshold_amount: 5000,
  pity_threshold: 10,
  updated_by_staff_id: null,
  updated_at: '',
};

function buildReward(
  overrides: Partial<SpinWheelReward> = {}
): SpinWheelReward {
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

function stubDefaults(rewards: SpinWheelReward[] = [buildReward()]) {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [{ id: 'staff-1', role: 'Admin' } as never],
    error: null,
  });
  vi.mocked(rewardsApi.getSpinWheelConfig).mockResolvedValue({
    data: CONFIG,
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
      { initialEntries: ['/staff/admin/spin-wheel-config'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/spin-wheel-config',
            element: createElement(AdminSpinWheelConfigPage),
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

describe('AdminSpinWheelConfigPage', () => {
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

  it('lists rewards in the default Table view', async () => {
    stubDefaults([
      buildReward({ id: '1', label: 'Ten Percent Off' }),
      buildReward({
        id: '2',
        label: 'Flat 50',
        discount_type: 'Flat',
        value: 50,
        rarity_percent: 40,
      }),
    ]);

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Ten Percent Off')).toBeInTheDocument();
    expect(screen.getByText('Flat 50')).toBeInTheDocument();
  });

  it('adds a reward via the Add a reward form', async () => {
    stubDefaults([]);
    vi.mocked(rewardsApi.createSpinWheelReward).mockResolvedValue({
      data: buildReward({ id: 'reward-new', label: 'New Reward' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Reward pool');
    await user.type(screen.getByLabelText('Label'), 'New Reward');
    await user.type(screen.getByLabelText(/^Value/), '10');
    await user.type(screen.getByLabelText('Rarity (%)'), '100');
    await user.click(screen.getByRole('button', { name: 'Add reward' }));

    await waitFor(() =>
      expect(rewardsApi.createSpinWheelReward).toHaveBeenCalledWith('token', {
        label: 'New Reward',
        discount_type: 'Percentage',
        value: 10,
        rarity_percent: 100,
      })
    );
    expect(await screen.findByText('New Reward')).toBeInTheDocument();
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

  it('adding a Status filter tile narrows to Active rewards', async () => {
    stubDefaults([
      buildReward({ id: '1', label: 'Ten Percent Off', is_active: true }),
      buildReward({ id: '2', label: 'Flat 50', is_active: false }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');
    expect(screen.getByText('Flat 50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Status' }));

    expect(screen.getByText('Ten Percent Off')).toBeInTheDocument();
    expect(screen.queryByText('Flat 50')).not.toBeInTheDocument();
  });

  it('switches to Board view, grouped by Status by default', async () => {
    stubDefaults([
      buildReward({ id: '1', label: 'Ten Percent Off', is_active: true }),
      buildReward({ id: '2', label: 'Flat 50', is_active: false }),
    ]);

    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      container.querySelectorAll('section:not(.formPanel)')
    ).not.toHaveLength(0);
    // Board-view cards keep the label/value/rarity combined in one span
    // (matching the page's original card text), so match by substring.
    expect(screen.getByText(/Ten Percent Off/)).toBeInTheDocument();
    expect(screen.getByText(/Flat 50/)).toBeInTheDocument();
  });

  it('toggles a reward active/inactive from the row action', async () => {
    stubDefaults();
    vi.mocked(rewardsApi.updateSpinWheelReward).mockResolvedValue({
      data: buildReward({ is_active: false }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(rewardsApi.updateSpinWheelReward).toHaveBeenCalledWith(
        'reward-1',
        'token',
        { is_active: false }
      )
    );
  });

  it('archives a reward', async () => {
    stubDefaults();
    vi.mocked(rewardsApi.archiveSpinWheelReward).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ten Percent Off');

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(rewardsApi.archiveSpinWheelReward).toHaveBeenCalledWith(
        'reward-1',
        'token'
      )
    );
    expect(screen.queryByText('Ten Percent Off')).not.toBeInTheDocument();
  });
});
