import { describe, expect, it } from 'vitest';
import {
  cancelBookingValidator,
  createBookingValidator,
  rescheduleBookingValidator,
  staffPreferenceValidator,
  updatePolicyValidator,
} from './booking.validator.ts';

const BASE_BOOKING = {
  pet_id: '11111111-1111-4111-a111-111111111111',
  branch_id: '22222222-2222-4222-a222-222222222222',
  service_category: 'Grooming' as const,
  service_id: '33333333-3333-4333-a333-333333333333',
  scheduled_start: '2026-08-03T01:00:00+00:00',
  scheduled_end: '2026-08-03T02:00:00+00:00',
};

const PACKAGE_ID = '44444444-4444-4444-a444-444444444444';
const STAFF_ID = '55555555-5555-4555-a555-555555555555';

describe('createBookingValidator', () => {
  it('accepts a service-only booking payload', () => {
    expect(createBookingValidator.safeParse(BASE_BOOKING).success).toBe(true);
  });

  it('accepts a package-only booking payload', () => {
    const { service_id: _serviceId, ...rest } = BASE_BOOKING;

    expect(
      createBookingValidator.safeParse({ ...rest, package_id: PACKAGE_ID })
        .success
    ).toBe(true);
  });

  it('rejects a payload with BOTH service_id and package_id (exactly-one rule)', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        package_id: PACKAGE_ID,
      }).success
    ).toBe(false);
  });

  it('rejects a payload with NEITHER service_id nor package_id', () => {
    const { service_id: _serviceId, ...rest } = BASE_BOOKING;

    expect(createBookingValidator.safeParse(rest).success).toBe(false);
  });

  it('rejects scheduled_end at or before scheduled_start', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        scheduled_end: BASE_BOOKING.scheduled_start,
      }).success
    ).toBe(false);
  });

  it('rejects an unknown payment_method value', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        payment_method: 'Bitcoin',
      }).success
    ).toBe(false);
  });

  it('accepts every documented stub payment_method value', () => {
    for (const method of [
      'Cash',
      'GCash',
      'Maya',
      'Card',
      'Bank Transfer',
      'Grabmart',
      'Pickaroo',
    ]) {
      expect(
        createBookingValidator.safeParse({
          ...BASE_BOOKING,
          payment_method: method,
        }).success
      ).toBe(true);
    }
  });

  it('accepts hotel_preferences on a Hotel booking', () => {
    const { service_category: _category, ...rest } = BASE_BOOKING;

    expect(
      createBookingValidator.safeParse({
        ...rest,
        service_category: 'Hotel',
        hotel_preferences: {
          feeding: [
            { meal_time: 'Morning', food_type: 'Kibble', quantity: '1 cup' },
          ],
          walking: [{ time_block: '07:00', duration_minutes: 15 }],
          medications: [],
        },
      }).success
    ).toBe(true);
  });

  it('rejects hotel_preferences on a non-Hotel booking', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        hotel_preferences: { feeding: [], walking: [], medications: [] },
      }).success
    ).toBe(false);
  });

  it('accepts hotel_preferences with catalog linkage from the staff booking flow', () => {
    const { service_category: _category, ...rest } = BASE_BOOKING;

    expect(
      createBookingValidator.safeParse({
        ...rest,
        service_category: 'Hotel',
        hotel_preferences: {
          feeding: [
            {
              meal_time: 'Morning',
              food_type: 'Kibble',
              quantity: '1',
              food_catalog_id: '11111111-1111-4111-a111-111111111111',
              brought_by_customer: false,
            },
          ],
          walking: [],
          medications: [
            {
              medication_name: 'Amoxicillin',
              dose: '250mg',
              scheduled_times: ['08:00'],
              medication_catalog_id: '22222222-2222-4222-a222-222222222222',
              brought_by_customer: false,
            },
          ],
        },
      }).success
    ).toBe(true);
  });

  it('rejects a malformed hotel_preferences meal_time', () => {
    const { service_category: _category, ...rest } = BASE_BOOKING;

    expect(
      createBookingValidator.safeParse({
        ...rest,
        service_category: 'Hotel',
        hotel_preferences: {
          feeding: [
            { meal_time: 'Midnight', food_type: 'Kibble', quantity: '1 cup' },
          ],
          walking: [],
          medications: [],
        },
      }).success
    ).toBe(false);
  });
});

describe('staffPreferenceValidator', () => {
  it('requires staff_id for a "specific" preference', () => {
    expect(
      staffPreferenceValidator.safeParse({ type: 'specific' }).success
    ).toBe(false);
    expect(
      staffPreferenceValidator.safeParse({
        type: 'specific',
        staff_id: STAFF_ID,
      }).success
    ).toBe(true);
  });

  it('forbids staff_id on "no_preference"', () => {
    expect(
      staffPreferenceValidator.safeParse({
        type: 'no_preference',
        staff_id: STAFF_ID,
      }).success
    ).toBe(false);
    expect(
      staffPreferenceValidator.safeParse({ type: 'no_preference' }).success
    ).toBe(true);
  });
});

describe('rescheduleBookingValidator', () => {
  it('accepts a plain new window', () => {
    expect(
      rescheduleBookingValidator.safeParse({
        scheduled_start: '2026-08-10T01:00:00+00:00',
        scheduled_end: '2026-08-10T02:00:00+00:00',
      }).success
    ).toBe(true);
  });

  it('rejects an inverted window', () => {
    expect(
      rescheduleBookingValidator.safeParse({
        scheduled_start: '2026-08-10T02:00:00+00:00',
        scheduled_end: '2026-08-10T01:00:00+00:00',
      }).success
    ).toBe(false);
  });
});

describe('cancelBookingValidator', () => {
  it('accepts an empty body and an optional reason', () => {
    expect(cancelBookingValidator.safeParse({}).success).toBe(true);
    expect(
      cancelBookingValidator.safeParse({ cancellation_reason: 'sick pet' })
        .success
    ).toBe(true);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      cancelBookingValidator.safeParse({ status: 'Cancelled' }).success
    ).toBe(false);
  });
});

describe('updatePolicyValidator', () => {
  it('rejects a payload with no settings (branch_id alone is not a setting)', () => {
    expect(updatePolicyValidator.safeParse({}).success).toBe(false);
    expect(
      updatePolicyValidator.safeParse({
        branch_id: BASE_BOOKING.branch_id,
      }).success
    ).toBe(false);
  });

  it('accepts a single toggle for a branch override (#52 AC-2)', () => {
    expect(
      updatePolicyValidator.safeParse({
        branch_id: BASE_BOOKING.branch_id,
        staff_picker_enabled_grooming: false,
      }).success
    ).toBe(true);
  });

  it('accepts a system-wide (null branch) notice update', () => {
    expect(
      updatePolicyValidator.safeParse({
        branch_id: null,
        notice_period_days: 5,
        notice_enforcement_mode: 'Soft',
      }).success
    ).toBe(true);
  });
});
