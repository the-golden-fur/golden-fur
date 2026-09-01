import { describe, expect, it } from 'vitest';
import { deriveBookingConfirmationState } from './bookingConfirmation';
import {
  DOWNPAYMENT_EXPIRED_CANCELLATION_REASON,
  type Booking,
} from './booking.types';

type Input = Pick<
  Booking,
  | 'status'
  | 'payment_status'
  | 'booking_source'
  | 'service_category'
  | 'cancellation_reason'
>;

function input(overrides: Partial<Input>): Input {
  return {
    status: 'Pending',
    payment_status: 'Pending',
    booking_source: 'Online',
    service_category: 'Grooming',
    cancellation_reason: null,
    ...overrides,
  };
}

describe('deriveBookingConfirmationState', () => {
  it('an unpaid online Pending booking is Unconfirmed', () => {
    expect(deriveBookingConfirmationState(input({}))).toBe('Unconfirmed');
  });

  it('becomes Confirmed once any payment is recorded', () => {
    expect(
      deriveBookingConfirmationState(
        input({ payment_status: 'Partially Paid' })
      )
    ).toBe('Confirmed');
    expect(
      deriveBookingConfirmationState(input({ payment_status: 'Fully Paid' }))
    ).toBe('Confirmed');
  });

  it('a walk-in Pending booking is Confirmed (customer is present, pays at the counter)', () => {
    expect(
      deriveBookingConfirmationState(input({ booking_source: 'Walk-in' }))
    ).toBe('Confirmed');
  });

  it('a Veterinary Pending booking is Confirmed (price is set during the visit)', () => {
    expect(
      deriveBookingConfirmationState(input({ service_category: 'Veterinary' }))
    ).toBe('Confirmed');
  });

  it('maps In Progress -> In service and Completed -> Completed', () => {
    expect(
      deriveBookingConfirmationState(input({ status: 'In Progress' }))
    ).toBe('In service');
    expect(deriveBookingConfirmationState(input({ status: 'Completed' }))).toBe(
      'Completed'
    );
  });

  it('separates an expiry-swept cancellation (Expired) from a real one (Cancelled)', () => {
    expect(
      deriveBookingConfirmationState(
        input({
          status: 'Cancelled',
          cancellation_reason: DOWNPAYMENT_EXPIRED_CANCELLATION_REASON,
        })
      )
    ).toBe('Expired');
    expect(
      deriveBookingConfirmationState(
        input({ status: 'Cancelled', cancellation_reason: 'Customer request' })
      )
    ).toBe('Cancelled');
  });

  it('passes No-show through unchanged', () => {
    expect(deriveBookingConfirmationState(input({ status: 'No-show' }))).toBe(
      'No-show'
    );
  });
});
