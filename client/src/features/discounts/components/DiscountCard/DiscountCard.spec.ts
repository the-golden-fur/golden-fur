import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiscountCard } from './DiscountCard';
import type { Discount } from '../../discounts.types';

const DISCOUNT: Discount = {
  id: 'discount-1',
  branch_id: 'branch-makati',
  name: 'Senior Citizen Discount',
  is_mandated: true,
  discount_type: 'Percentage',
  value: 20,
  scope_type: 'category',
  scope_service_id: null,
  scope_package_id: null,
  scope_category: 'Grooming',
  is_active: false,
  created_by: null,
  updated_by: null,
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
};

describe('DiscountCard', () => {
  it('#85 AC-1: shows name, scope badge, value, and status at a glance', () => {
    render(
      createElement(DiscountCard, {
        discount: DISCOUNT,
        branchName: 'Makati',
        scopeDescription: 'Category: Grooming',
        onToggle: vi.fn(),
        onEdit: vi.fn(),
      })
    );

    expect(screen.getByText('Senior Citizen Discount')).toBeInTheDocument();
    expect(screen.getByText('Category', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('Category: Grooming')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('calls onToggle when the switch is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(DiscountCard, {
        discount: DISCOUNT,
        branchName: 'Makati',
        scopeDescription: 'Category: Grooming',
        onToggle,
        onEdit: vi.fn(),
      })
    );

    await user.click(
      screen.getByRole('switch', { name: 'Enable Senior Citizen Discount' })
    );

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('calls onEdit when Edit is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(DiscountCard, {
        discount: DISCOUNT,
        branchName: 'Makati',
        scopeDescription: 'Category: Grooming',
        onToggle: vi.fn(),
        onEdit,
      })
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalled();
  });
});
