import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BranchMultiSelect } from './BranchMultiSelect';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: false },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: true },
];

describe('BranchMultiSelect', () => {
  it('renders one checkbox per branch, reflecting the current selection', () => {
    render(
      createElement(BranchMultiSelect, {
        label: 'Available at',
        branches: BRANCHES,
        selectedBranchIds: ['branch-makati'],
        onChange: vi.fn(),
      })
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Makati' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Southwoods' })
    ).not.toBeChecked();
  });

  it('emits the added branch id when checking', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(BranchMultiSelect, {
        label: 'Available at',
        branches: BRANCHES,
        selectedBranchIds: ['branch-makati'],
        onChange,
      })
    );

    await user.click(screen.getByRole('checkbox', { name: 'Southwoods' }));

    expect(onChange).toHaveBeenCalledWith([
      'branch-makati',
      'branch-southwoods',
    ]);
  });

  it('filters the visible branches by the search box without losing a hidden selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(BranchMultiSelect, {
        label: 'Available at',
        branches: BRANCHES,
        selectedBranchIds: ['branch-southwoods'],
        onChange,
      })
    );

    await user.type(
      screen.getByPlaceholderText('Search branches...'),
      'Makati'
    );

    expect(
      screen.queryByRole('checkbox', { name: 'Southwoods' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Makati' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Makati' }));

    expect(onChange).toHaveBeenCalledWith([
      'branch-makati',
      'branch-southwoods',
    ]);
  });
});
