import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HotelBillBreakdown } from './HotelBillBreakdown';
import type { HotelBillBreakdown as HotelBill } from '../../hotel.types';

// Booked 3 nights at ₱850, picked up 2 nights late at the same rate.
const LATE_STAY: HotelBill = {
  nights: 3,
  nightly_rate: 850,
  stay_charge: 2550,
  discount: 0,
  late_nights: 2,
  late_rate: 850,
  late_charge: 1700,
  total: 4250,
  pay_at_checkout: false,
};

function amountFor(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('HotelBillBreakdown', () => {
  it('lists the booked nights and the late nights, each with its rate', () => {
    render(
      <HotelBillBreakdown
        breakdown={LATE_STAY}
        downpaymentCollected={500}
        addedAtCheckout={1700}
        amountDue={3750}
      />
    );

    expect(amountFor('Hotel stay - 3 nights × ₱850')).toBe('₱2550');
    expect(amountFor('Late checkout - 2 nights × ₱850')).toBe('₱1700');
    expect(amountFor('Total')).toBe('₱4250');
    expect(amountFor('Downpayment already collected')).toBe('₱500');
    expect(amountFor('Added to the bill at checkout')).toBe('₱1700');
    expect(amountFor('To collect at the cashier')).toBe('₱3750');
  });

  it('an on-time stay has no late line, and reads as just its Total without a summary', () => {
    render(
      <HotelBillBreakdown
        breakdown={{
          ...LATE_STAY,
          late_nights: 0,
          late_rate: null,
          late_charge: 0,
          total: 2550,
        }}
      />
    );

    expect(screen.queryByText(/Late checkout/)).toBeNull();
    expect(screen.queryByText('To collect at the cashier')).toBeNull();
    expect(amountFor('Total')).toBe('₱2550');
  });

  it('shows a discount and labels a pay-at-checkout stay by the nights stayed', () => {
    render(
      <HotelBillBreakdown
        breakdown={{
          ...LATE_STAY,
          late_nights: 0,
          late_rate: null,
          late_charge: 0,
          discount: 300,
          total: 2250,
          pay_at_checkout: true,
        }}
        amountDue={2250}
      />
    );

    expect(amountFor('Hotel stay (nights stayed) - 3 nights × ₱850')).toBe(
      '₱2550'
    );
    expect(amountFor('Discount / promo')).toBe('-₱300');
    expect(screen.queryByText('Downpayment already collected')).toBeNull();
  });
});
