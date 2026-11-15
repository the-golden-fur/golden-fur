import { describe, expect, it } from 'vitest';
import { friendlyBookingError } from './bookingErrors';

describe('friendlyBookingError', () => {
  it('collapses a raw PostgREST schema-cache error to a generic message', () => {
    const result = friendlyBookingError(
      "Could not find the 'downpayment_due_at' column of 'bookings' in the schema cache"
    );
    expect(result).not.toMatch(/downpayment_due_at|schema cache|column/i);
    expect(result).toMatch(/something went wrong on our end/i);
  });

  it('collapses constraint / relation leakage too', () => {
    expect(
      friendlyBookingError('new row violates check constraint "bookings_x"')
    ).toMatch(/something went wrong/i);
    expect(
      friendlyBookingError('relation "public.foo" does not exist')
    ).toMatch(/something went wrong/i);
  });

  it('passes a server-authored message through unchanged', () => {
    expect(
      friendlyBookingError('That time was just taken. Please pick another one.')
    ).toBe('That time was just taken. Please pick another one.');

    expect(
      friendlyBookingError('Only staff may create a walk-in booking')
    ).toBe('Only staff may create a walk-in booking');
  });

  it('falls back to a default when there is no message', () => {
    expect(friendlyBookingError(undefined)).toMatch(/please try again/i);
    expect(friendlyBookingError('')).toMatch(/please try again/i);
    expect(friendlyBookingError(null)).toMatch(/please try again/i);
  });
});
