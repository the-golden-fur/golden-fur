import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiscountFilterBar } from './DiscountFilterBar';

const BRANCHES = [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }];

function renderBar(
  overrides: Partial<Parameters<typeof DiscountFilterBar>[0]> = {}
) {
  return render(
    createElement(DiscountFilterBar, {
      branches: BRANCHES,
      branchFilter: 'All',
      onBranchFilterChange: vi.fn(),
      search: '',
      onSearchChange: vi.fn(),
      scopeTypeFilter: 'All',
      onScopeTypeFilterChange: vi.fn(),
      statusFilter: 'All',
      onStatusFilterChange: vi.fn(),
      ...overrides,
    })
  );
}

describe('DiscountFilterBar', () => {
  it('#85 AC-2: emits the typed search text', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    // The input is controlled by `search` - a static prop would reset the DOM
    // value on every keystroke, so this asserts each individual keystroke
    // reaches the callback rather than requiring the caller to manage state.
    renderBar({ onSearchChange });

    await user.type(screen.getByLabelText('Search'), 'PWD');

    expect(onSearchChange).toHaveBeenCalledTimes(3);
    expect(onSearchChange).toHaveBeenNthCalledWith(1, 'P');
    expect(onSearchChange).toHaveBeenNthCalledWith(2, 'W');
    expect(onSearchChange).toHaveBeenNthCalledWith(3, 'D');
  });

  it('#85 AC-3: emits the selected scope-type filter', async () => {
    const onScopeTypeFilterChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onScopeTypeFilterChange });

    await user.selectOptions(screen.getByLabelText('Scope type'), 'category');

    expect(onScopeTypeFilterChange).toHaveBeenCalledWith('category');
  });

  it('emits the selected status filter', async () => {
    const onStatusFilterChange = vi.fn();
    const user = userEvent.setup();

    renderBar({ onStatusFilterChange });

    await user.selectOptions(screen.getByLabelText('Status'), 'Active');

    expect(onStatusFilterChange).toHaveBeenCalledWith('Active');
  });
});
