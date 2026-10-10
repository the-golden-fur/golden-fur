import { describe, expect, it } from 'vitest';
import {
  ALL_STAFF_ROLES,
  STAFF_BOOKING_RESTRICTED_FIELD_ROLES,
} from './staff.types.ts';
import { BOOKING_MARK_PAID_ROLES } from '../booking/booking.types.ts';
import { BILLING_STAFF_ROLES } from '../billing/billing.types.ts';

describe('Front Desk role propagation', () => {
  it('is a recognized staff role', () => {
    expect(ALL_STAFF_ROLES).toContain('Front Desk');
  });

  it('absorbs the Receptionist/Groomer walk-and-play-only booking restriction', () => {
    expect(STAFF_BOOKING_RESTRICTED_FIELD_ROLES).toContain('Front Desk');
  });

  it('gets the money-handling access Receptionist and Cashier already share', () => {
    expect(BOOKING_MARK_PAID_ROLES).toContain('Front Desk');
    expect(BILLING_STAFF_ROLES).toContain('Front Desk');
  });
});
