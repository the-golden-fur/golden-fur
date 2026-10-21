import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DaycareBillBreakdown } from './DaycareBillBreakdown';

// Booked 1 hour (₱100), picked up the next morning: 1 overdue hour before
// closing (₱50) and 1 night at the Hotel rate (₱850).
const OVERDUE_OVERNIGHT = {
  first_hour_fee: 100,
  succeeding_hours: 0,
  succeeding_hour_fee: 50,
  hourly_charge: 100,
  overdue_hours: 1,
  overdue_hour_fee: 50,
  overdue_charge: 50,
  nights: 1,
  nightly_rate: 850,
  overnight_charge: 850,
  total: 1000,
};

function amountFor(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('DaycareBillBreakdown', () => {
  it('lists the overdue hours and the night not picked up, each with its rate', () => {
    render(
      <DaycareBillBreakdown
        breakdown={OVERDUE_OVERNIGHT}
        total={1000}
        bookedCharge={100}
        addedAtCheckout={900}
        amountDue={900}
      />
    );

    expect(amountFor('First hour')).toBe('₱100');
    expect(amountFor('Overdue checkout - 1 hour × ₱50')).toBe('₱50');
    expect(
      amountFor('Not picked up before closing - 1 night × ₱850 (Hotel rate)')
    ).toBe('₱850');
    expect(amountFor('Total')).toBe('₱1000');
    expect(amountFor('Charged at booking')).toBe('₱100');
    expect(amountFor('Added to the bill at checkout')).toBe('₱900');
    expect(amountFor('To collect at the cashier')).toBe('₱900');
  });

  it('a walk-in reads as just its lines and Total', () => {
    render(
      <DaycareBillBreakdown
        breakdown={{
          ...OVERDUE_OVERNIGHT,
          succeeding_hours: 2,
          hourly_charge: 200,
          overdue_hours: 0,
          overdue_charge: 0,
          nights: 0,
          nightly_rate: null,
          overnight_charge: 0,
          total: 200,
        }}
        total={200}
      />
    );

    expect(amountFor('2 succeeding hours × ₱50')).toBe('₱100');
    expect(amountFor('Total')).toBe('₱200');
    expect(screen.queryByText(/Overdue checkout/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not picked up/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('To collect at the cashier')
    ).not.toBeInTheDocument();
  });
});
