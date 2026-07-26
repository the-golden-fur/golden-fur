import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PromoCard } from './PromoCard';
import type { Promo } from '../../maintenance.types';

const PROMO: Promo = {
  id: 'promo-1',
  name: 'Summer Sale',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  condition_note: null,
  discount_type: 'Percentage',
  value: 15,
  scope_type: 'all_services',
  branch_scope: 'makati',
  is_active: true,
  created_by: null,
  updated_by: null,
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
  promo_scope: [],
};

describe('PromoCard', () => {
  it('shows name, branch badge, timing badge, value, window, and status', () => {
    // Far enough in the past that this is "Ended" regardless of the real
    // system clock the test runs under.
    render(
      createElement(PromoCard, {
        promo: { ...PROMO, start_date: '2020-01-01', end_date: '2020-01-31' },
        onToggle: vi.fn(),
        onEdit: vi.fn(),
      })
    );

    expect(screen.getByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('15% off')).toBeInTheDocument();
    expect(screen.getByText('2020-01-01 to 2020-01-31')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows a condition note in place of a date window', () => {
    render(
      createElement(PromoCard, {
        promo: {
          ...PROMO,
          start_date: null,
          end_date: null,
          condition_note: 'First booking of the month',
        },
        onToggle: vi.fn(),
        onEdit: vi.fn(),
      })
    );

    expect(screen.getByText('First booking of the month')).toBeInTheDocument();
    expect(screen.getByText('Active now')).toBeInTheDocument();
  });

  it('calls onToggle when the switch is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(PromoCard, { promo: PROMO, onToggle, onEdit: vi.fn() })
    );

    await user.click(
      screen.getByRole('switch', { name: 'Disable Summer Sale' })
    );

    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('calls onEdit when Edit is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(PromoCard, { promo: PROMO, onToggle: vi.fn(), onEdit })
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalled();
  });
});
