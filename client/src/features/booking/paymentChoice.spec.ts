import { describe, expect, it } from 'vitest';
import {
  isPayAtCheckoutAvailable,
  resolvePaymentChoice,
} from './paymentChoice';

const WALK_IN_HOTEL = { category: 'Hotel', bookingSource: 'Walk-in' } as const;
const WALK_IN_DAYCARE = {
  category: 'Daycare',
  bookingSource: 'Walk-in',
} as const;

describe('isPayAtCheckoutAvailable', () => {
  it('is offered to staff for walk-in Hotel and Daycare bookings when the branch allows it', () => {
    expect(
      isPayAtCheckoutAvailable({
        isStaff: true,
        enabled: true,
        bookings: [WALK_IN_HOTEL, WALK_IN_DAYCARE],
      })
    ).toBe(true);
  });

  it('is never offered on the customer portal', () => {
    expect(
      isPayAtCheckoutAvailable({
        isStaff: false,
        enabled: true,
        bookings: [WALK_IN_HOTEL],
      })
    ).toBe(false);
  });

  it('is not offered when the branch has it switched off', () => {
    expect(
      isPayAtCheckoutAvailable({
        isStaff: true,
        enabled: false,
        bookings: [WALK_IN_HOTEL],
      })
    ).toBe(false);
  });

  it('is not offered when any booking is Online', () => {
    expect(
      isPayAtCheckoutAvailable({
        isStaff: true,
        enabled: true,
        bookings: [
          WALK_IN_HOTEL,
          { category: 'Daycare', bookingSource: 'Online' },
        ],
      })
    ).toBe(false);
  });

  it('is not offered when any booking is Grooming or Veterinary', () => {
    expect(
      isPayAtCheckoutAvailable({
        isStaff: true,
        enabled: true,
        bookings: [
          WALK_IN_HOTEL,
          { category: 'Grooming', bookingSource: 'Walk-in' },
        ],
      })
    ).toBe(false);
  });

  it('is not offered for an empty list', () => {
    expect(
      isPayAtCheckoutAvailable({ isStaff: true, enabled: true, bookings: [] })
    ).toBe(false);
  });
});

describe('resolvePaymentChoice', () => {
  it('keeps a choice that is still on offer', () => {
    expect(
      resolvePaymentChoice('pay_at_checkout', {
        downpaymentRequired: false,
        payAtCheckoutAvailable: true,
      })
    ).toBe('pay_at_checkout');
    expect(
      resolvePaymentChoice('downpayment', {
        downpaymentRequired: true,
        payAtCheckoutAvailable: false,
      })
    ).toBe('downpayment');
  });

  it('falls back to full payment when pay at checkout is no longer on offer', () => {
    expect(
      resolvePaymentChoice('pay_at_checkout', {
        downpaymentRequired: true,
        payAtCheckoutAvailable: false,
      })
    ).toBe('full');
  });

  it('falls back to full payment when no down payment applies', () => {
    expect(
      resolvePaymentChoice('downpayment', {
        downpaymentRequired: false,
        payAtCheckoutAvailable: true,
      })
    ).toBe('full');
  });
});
