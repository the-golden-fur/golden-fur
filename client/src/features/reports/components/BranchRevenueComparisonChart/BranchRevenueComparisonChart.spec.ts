import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as reportsApi from '../../api/reports.api';
import type { AnalyticsSummary } from '../../reports.types';
import { BranchRevenueComparisonChart } from './BranchRevenueComparisonChart';

vi.mock('../../api/reports.api', () => ({
  getAnalyticsSummary: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
];

function summary(totalRevenue: number): AnalyticsSummary {
  return {
    branch_id: null,
    time_filter: 'today',
    total_revenue: totalRevenue,
    booking_count: 0,
    cancelled_count: 0,
    cancellation_rate: 0,
  };
}

function renderChart(props: { filterable?: boolean } = {}) {
  return render(
    createElement(BranchRevenueComparisonChart, {
      branches: BRANCHES,
      timeFilter: 'today',
      accessToken: 'token',
      ...props,
    })
  );
}

describe('BranchRevenueComparisonChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.getAnalyticsSummary).mockImplementation(
      (timeFilter, branchId) =>
        Promise.resolve({
          // Makati 300 / Southwoods 100 today; 9,000 / 1,000 this month.
          data: summary(
            timeFilter === 'this_month'
              ? branchId === 'branch-makati'
                ? 9000
                : 1000
              : branchId === 'branch-makati'
                ? 300
                : 100
          ),
          error: null,
        })
    );
  });

  it('shows no time period control unless it is filterable', async () => {
    renderChart();

    expect(await screen.findByText('₱300.00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time period')).not.toBeInTheDocument();
  });

  it('when filterable, offers a time period and starts on the one it was given', async () => {
    renderChart({ filterable: true });

    expect(await screen.findByText('₱300.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Time period')).toHaveValue('today');
    expect(reportsApi.getAnalyticsSummary).toHaveBeenCalledWith(
      'today',
      'branch-makati',
      'token'
    );
  });

  it('reloads both branches for the chosen time period', async () => {
    renderChart({ filterable: true });
    await screen.findByText('₱300.00');

    await userEvent.selectOptions(
      screen.getByLabelText('Time period'),
      'this_month'
    );

    expect(await screen.findByText('₱9,000.00')).toBeInTheDocument();
    expect(screen.getByText('₱1,000.00')).toBeInTheDocument();
    expect(reportsApi.getAnalyticsSummary).toHaveBeenCalledWith(
      'this_month',
      'branch-makati',
      'token'
    );
    expect(reportsApi.getAnalyticsSummary).toHaveBeenCalledWith(
      'this_month',
      'branch-southwoods',
      'token'
    );
  });

  it('recovers from a failed period when another one loads', async () => {
    vi.mocked(reportsApi.getAnalyticsSummary).mockImplementation((timeFilter) =>
      Promise.resolve(
        timeFilter === 'today'
          ? { data: null, error: 'Could not load analytics.' }
          : { data: summary(500), error: null }
      )
    );

    renderChart({ filterable: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load analytics.'
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Time period'),
      'this_week'
    );

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
    expect(screen.getAllByText('₱500.00')).toHaveLength(2);
  });

  it('keeps the time period control available when a period has no revenue', async () => {
    vi.mocked(reportsApi.getAnalyticsSummary).mockResolvedValue({
      data: summary(0),
      error: null,
    });

    renderChart({ filterable: true });

    expect(
      await screen.findByText('No revenue recorded for this period.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Time period')).toBeInTheDocument();
  });
});
