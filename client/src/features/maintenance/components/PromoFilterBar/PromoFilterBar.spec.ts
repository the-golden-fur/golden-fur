import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PromoFilterBar } from './PromoFilterBar';

const BRANCHES = [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }];

function renderBar(
  overrides: Partial<Parameters<typeof PromoFilterBar>[0]> = {}
) {
  return render(
    createElement(PromoFilterBar, {
      search: '',
      onSearchChange: vi.fn(),
      branches: BRANCHES,
      branchFilter: 'All',
      onBranchFilterChange: vi.fn(),
      timingFilter: 'All',
      onTimingFilterChange: vi.fn(),
      statusFilter: 'All',
      onStatusFilterChange: vi.fn(),
      ...overrides,
    })
  );
}

describe('PromoFilterBar', () => {
  it('emits each typed search keystroke', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onSearchChange });

    await user.type(screen.getByLabelText('Search'), 'Sale');

    expect(onSearchChange).toHaveBeenCalledTimes(4);
    expect(onSearchChange).toHaveBeenLastCalledWith('e');
  });

  it('emits the selected branch filter', async () => {
    const onBranchFilterChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onBranchFilterChange });

    await user.selectOptions(screen.getByLabelText('Branch'), 'branch-makati');

    expect(onBranchFilterChange).toHaveBeenCalledWith('branch-makati');
  });

  it('emits the selected timing filter', async () => {
    const onTimingFilterChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onTimingFilterChange });

    await user.selectOptions(screen.getByLabelText('Timing'), 'Upcoming');

    expect(onTimingFilterChange).toHaveBeenCalledWith('Upcoming');
  });

  it('emits the selected status filter', async () => {
    const onStatusFilterChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onStatusFilterChange });

    await user.selectOptions(screen.getByLabelText('Status'), 'Active');

    expect(onStatusFilterChange).toHaveBeenCalledWith('Active');
  });
});
