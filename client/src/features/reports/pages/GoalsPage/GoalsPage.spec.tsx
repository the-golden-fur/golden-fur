import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as reportsApi from '../../api/reports.api';
import type { GoalRow, GoalsReport } from '../../reports.types';
import { currentGoalMonth, shiftGoalMonth } from '../../utils/goalMonth';
import { GoalsPage } from './GoalsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({
  getGoals: vi.fn(),
  saveGoalGrowthRate: vi.fn(),
  saveGoalTarget: vi.fn(),
}));

function buildStaff(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'boss',
    registered_email: 'boss@example.com',
    display_name: 'Boss',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function row(overrides: Partial<GoalRow>): GoalRow {
  return {
    key: 'appointments',
    label: 'All appointments',
    actual: 0,
    previous: 0,
    goal: 0,
    goal_source: 'growth',
    growth_rate: 10,
    target: null,
    ...overrides,
  };
}

const MONTH = currentGoalMonth();

const GOALS: GoalsReport = {
  month: MONTH,
  branch_id: null,
  appointments: row({ actual: 6, previous: 10, goal: 11 }),
  services: [
    row({ key: 'service:Grooming', label: 'Grooming', actual: 4, goal: 4 }),
  ],
  revenue: row({
    key: 'revenue',
    label: 'Revenue',
    actual: 5000,
    previous: 8000,
    goal: 20000,
    goal_source: 'target',
    target: 20000,
  }),
  revenue_services: [
    row({
      key: 'revenue:Hotel',
      label: 'Pet Hotel',
      actual: 1500,
      previous: 1000,
      goal: 1100,
    }),
  ],
  new_customers: row({ key: 'new_customers', label: 'New customers' }),
  packages: [
    row({ key: 'package:Spa Day', label: 'Spa Day', actual: 2, goal: 4 }),
    row({ key: 'package:Puppy Starter', label: 'Puppy Starter' }),
  ],
};

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'boss@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Routes>
          <Route path="/" element={<GoalsPage />} />
          <Route
            path="/staff/settings"
            element={<div>Staff settings page</div>}
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('GoalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Superadmin')],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [
        { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
      ],
      error: null,
    });
    vi.mocked(reportsApi.getGoals).mockResolvedValue({
      data: GOALS,
      error: null,
    });
    vi.mocked(reportsApi.saveGoalGrowthRate).mockResolvedValue({
      data: true,
      error: null,
    });
    vi.mocked(reportsApi.saveGoalTarget).mockResolvedValue({
      data: true,
      error: null,
    });
  });

  it('redirects an Admin away - Superadmin only', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
    expect(reportsApi.getGoals).not.toHaveBeenCalled();
  });

  it('loads the current month for all branches and shows every goal set', async () => {
    renderPage();

    const revenue = await screen.findByRole('row', { name: /Revenue/ });
    expect(reportsApi.getGoals).toHaveBeenCalledWith(MONTH, null, 'token');

    // An exact target is tagged as such; a growth goal shows its %.
    expect(revenue).toHaveTextContent('₱20,000.00');
    expect(revenue).toHaveTextContent('exact');
    expect(revenue).toHaveTextContent('25%');
    expect(
      screen.getByRole('row', { name: /All appointments/ })
    ).toHaveTextContent('+10%');

    expect(screen.getByRole('row', { name: /New customers/ })).toBeVisible();
    expect(screen.getByRole('row', { name: /Grooming/ })).toBeVisible();
    // Revenue per service reads as money.
    expect(screen.getByRole('row', { name: /Pet Hotel/ })).toHaveTextContent(
      '₱1,500.00'
    );
    // One row per package, whatever packages exist.
    expect(screen.getByRole('row', { name: /Spa Day/ })).toHaveTextContent(
      '50%'
    );
    expect(
      screen.getByRole('row', { name: /Puppy Starter/ })
    ).toHaveTextContent('No goal');
  });

  it('moves between months', async () => {
    renderPage();
    await screen.findByRole('row', { name: /Revenue/ });

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous month' })
    );

    expect(reportsApi.getGoals).toHaveBeenLastCalledWith(
      shiftGoalMonth(MONTH, -1),
      null,
      'token'
    );
  });

  it('switches to one branch', async () => {
    renderPage();
    await screen.findByRole('row', { name: /Revenue/ });

    await userEvent.selectOptions(
      screen.getByLabelText('Branch'),
      'branch-southwoods'
    );

    expect(reportsApi.getGoals).toHaveBeenLastCalledWith(
      MONTH,
      'branch-southwoods',
      'token'
    );
  });

  it('saves a new growth rate and exact target, then reloads', async () => {
    renderPage();
    await screen.findByRole('row', { name: /All appointments/ });

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit goal for All appointments' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Goal: All appointments',
    });
    const growth = within(dialog).getByLabelText(/Growth over the previous/);
    await userEvent.clear(growth);
    await userEvent.type(growth, '20');
    await userEvent.type(within(dialog).getByLabelText(/Exact target/), '15');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save goal' })
    );

    expect(reportsApi.saveGoalGrowthRate).toHaveBeenCalledWith(
      { metricKey: 'appointments', branchId: null, growthRate: 20 },
      'token'
    );
    expect(reportsApi.saveGoalTarget).toHaveBeenCalledWith(
      {
        metricKey: 'appointments',
        branchId: null,
        month: MONTH,
        targetValue: 15,
      },
      'token'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reportsApi.getGoals).toHaveBeenCalledTimes(2);
  });

  it('clears an exact target, leaving the growth rate alone', async () => {
    renderPage();
    await screen.findByRole('row', { name: /Revenue/ });

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit goal for Revenue' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Goal: Revenue' });
    await userEvent.clear(within(dialog).getByLabelText(/Exact target/));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save goal' })
    );

    expect(reportsApi.saveGoalTarget).toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: 'revenue', targetValue: null }),
      'token'
    );
    expect(reportsApi.saveGoalGrowthRate).not.toHaveBeenCalled();
  });

  it('rejects a part-number target for a count', async () => {
    renderPage();
    await screen.findByRole('row', { name: /Spa Day/ });

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit goal for Spa Day' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Goal: Spa Day' });
    await userEvent.type(within(dialog).getByLabelText(/Exact target/), '2.5');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save goal' })
    );

    expect(within(dialog).getByRole('alert')).toHaveTextContent('whole number');
    expect(reportsApi.saveGoalTarget).not.toHaveBeenCalled();
  });
});
