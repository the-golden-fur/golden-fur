import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BranchAvailabilityModal } from './BranchAvailabilityModal';

const ROWS = [
  { branchId: 'branch-makati', branchName: 'Makati', isAvailable: true },
  {
    branchId: 'branch-southwoods',
    branchName: 'Southwoods',
    isAvailable: false,
  },
];

describe('BranchAvailabilityModal', () => {
  it('titles the modal with the item name and renders one toggle per branch row', () => {
    render(
      createElement(BranchAvailabilityModal, {
        isOpen: true,
        itemName: 'Bath',
        rows: ROWS,
        onToggle: vi.fn(),
        onClose: vi.fn(),
      })
    );

    expect(
      screen.getByRole('dialog', { name: 'Branch Availability - Bath' })
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Makati' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('switch', { name: 'Southwoods' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('calls onToggle with the branch id and the new availability', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(BranchAvailabilityModal, {
        isOpen: true,
        itemName: 'Bath',
        rows: ROWS,
        onToggle,
        onClose: vi.fn(),
      })
    );

    await user.click(screen.getByRole('switch', { name: 'Makati' }));

    expect(onToggle).toHaveBeenCalledWith('branch-makati', false);
  });

  it('search narrows the branch list by name', async () => {
    const user = userEvent.setup();

    render(
      createElement(BranchAvailabilityModal, {
        isOpen: true,
        itemName: 'Bath',
        rows: ROWS,
        onToggle: vi.fn(),
        onClose: vi.fn(),
      })
    );

    await user.type(screen.getByPlaceholderText('Search branches...'), 'south');

    expect(
      screen.queryByRole('switch', { name: 'Makati' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Southwoods' })
    ).toBeInTheDocument();
  });

  it('the Status filter narrows to available-only or unavailable-only rows', async () => {
    const user = userEvent.setup();

    render(
      createElement(BranchAvailabilityModal, {
        isOpen: true,
        itemName: 'Bath',
        rows: ROWS,
        onToggle: vi.fn(),
        onClose: vi.fn(),
      })
    );

    await user.selectOptions(screen.getByLabelText('Status'), 'unavailable');

    expect(
      screen.queryByRole('switch', { name: 'Makati' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Southwoods' })
    ).toBeInTheDocument();
  });

  it('shows an empty state when no branch matches the filters', async () => {
    const user = userEvent.setup();

    render(
      createElement(BranchAvailabilityModal, {
        isOpen: true,
        itemName: 'Bath',
        rows: ROWS,
        onToggle: vi.fn(),
        onClose: vi.fn(),
      })
    );

    await user.type(
      screen.getByPlaceholderText('Search branches...'),
      'nowhere'
    );

    expect(
      screen.getByText('No branches match the filters.')
    ).toBeInTheDocument();
  });
});
