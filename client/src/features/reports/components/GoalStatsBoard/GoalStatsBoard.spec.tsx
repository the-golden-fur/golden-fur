import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoals } from '../../api/reports.api';
import type { GoalRow, GoalsReport } from '../../reports.types';
import { currentGoalMonth } from '../../utils/goalMonth';
import { GoalStatsBoard } from './GoalStatsBoard';

vi.mock('../../api/reports.api', () => ({ getGoals: vi.fn() }));

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

const GOALS: GoalsReport = {
  month: currentGoalMonth(),
  branch_id: null,
  appointments: row({ actual: 2, previous: 3, goal: 3 }),
  services: [
    row({ key: 'service:Grooming', label: 'Grooming', actual: 1, previous: 2 }),
    row({ key: 'service:Hotel', label: 'Pet Hotel', previous: 1, goal: 1 }),
  ],
  revenue: row({
    key: 'revenue',
    label: 'Revenue',
    actual: 1200,
    previous: 1000,
    goal: 1100,
  }),
  revenue_services: [],
  new_customers: row({ key: 'new_customers', label: 'New customers' }),
  packages: [],
};

function renderBoard() {
  return render(
    <MemoryRouter>
      <GoalStatsBoard accessToken="token" />
    </MemoryRouter>
  );
}

describe('GoalStatsBoard', () => {
  beforeEach(() => {
    vi.mocked(getGoals).mockResolvedValue({ data: GOALS, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads this month across every branch', async () => {
    renderBoard();

    await screen.findByRole('row', { name: /All appointments/ });
    expect(getGoals).toHaveBeenCalledWith(currentGoalMonth(), null, 'token');
  });

  it('shows this month, last month and the configured goal', async () => {
    renderBoard();

    const appointments = await screen.findByRole('row', {
      name: /All appointments/,
    });
    const cells = within(appointments).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('2');
    expect(cells[1]).toHaveTextContent('3');
    expect(cells[2]).toHaveTextContent('3');

    const hotel = screen.getByRole('row', { name: /Pet Hotel/ });
    expect(within(hotel).getAllByRole('cell')[1]).toHaveTextContent('1');
  });

  it('formats revenue as currency and marks a met goal', async () => {
    renderBoard();

    const revenue = await screen.findByRole('row', { name: /Revenue/ });
    const cells = within(revenue).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('₱1,200.00');
    expect(cells[0]).toHaveAttribute('data-met', 'true');
    expect(cells[2]).toHaveTextContent('₱1,100.00');
  });

  it('links through to the full Goals page', async () => {
    renderBoard();

    expect(
      await screen.findByRole('link', { name: 'View all goals' })
    ).toHaveAttribute('href', '/staff/reports/goals');
  });

  it('surfaces a load error', async () => {
    vi.mocked(getGoals).mockResolvedValue({ data: null, error: 'boom' });

    renderBoard();

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
