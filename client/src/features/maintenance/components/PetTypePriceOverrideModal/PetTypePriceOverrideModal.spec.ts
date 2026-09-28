import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PetTypePriceOverrideModal } from './PetTypePriceOverrideModal';

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: false },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: true },
];

const OVERRIDES = [
  { id: 'override-1', pet_type: 'Cat', branch_id: null, fixed_price: 800 },
];

function renderModal(
  overrides: Partial<Parameters<typeof PetTypePriceOverrideModal>[0]> = {}
) {
  render(
    createElement(PetTypePriceOverrideModal, {
      isOpen: true,
      petTypeName: 'Cat',
      branches: BRANCHES,
      overrides: OVERRIDES,
      onSave: vi.fn(),
      onClear: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    })
  );
}

describe('PetTypePriceOverrideModal', () => {
  it('without lockedBranchId, shows the default row and every branch (Superadmin view)', () => {
    renderModal();

    expect(screen.getByText('All branches (default)')).toBeInTheDocument();
    expect(screen.getByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('Southwoods')).toBeInTheDocument();
  });

  it("lockedBranchId: only shows the locked branch's row - no default row, no other branches", () => {
    renderModal({ lockedBranchId: 'branch-makati' });

    expect(
      screen.queryByText('All branches (default)')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Makati')).toBeInTheDocument();
    expect(screen.queryByText('Southwoods')).not.toBeInTheDocument();
  });
});
