import { describe, expect, it } from 'vitest';
import {
  availabilityQueryValidator,
  cancelBookingValidator,
  createBookingValidator,
  overrideBookingStatusValidator,
  rescheduleBookingValidator,
  staffPreferenceValidator,
  updatePolicyValidator,
} from './booking.validator.ts';

const SERVICE_ID = '33333333-3333-4333-a333-333333333333';
const PACKAGE_ID = '44444444-4444-4444-a444-444444444444';
const STAFF_ID = '55555555-5555-4555-a555-555555555555';

const BASE_BOOKING = {
  pet_id: '11111111-1111-4111-a111-111111111111',
  branch_id: '22222222-2222-4222-a222-222222222222',
  service_category: 'Grooming' as const,
  items: [{ service_id: SERVICE_ID }],
  scheduled_start: '2026-08-03T01:00:00+00:00',
  scheduled_end: '2026-08-03T02:00:00+00:00',
};

describe('createBookingValidator', () => {
  it('accepts a service-only booking payload', () => {
    expect(createBookingValidator.safeParse(BASE_BOOKING).success).toBe(true);
  });

  it('accepts a package-only booking payload', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        items: [{ package_id: PACKAGE_ID }],
      }).success
    ).toBe(true);
  });

  it('accepts multiple services and packages in one booking', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        items: [{ service_id: SERVICE_ID }, { package_id: PACKAGE_ID }],
      }).success
    ).toBe(true);
  });

  it('rejects a payload where one item has BOTH service_id and package_id', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        items: [{ service_id: SERVICE_ID, package_id: PACKAGE_ID }],
      }).success
    ).toBe(false);
  });

  it('rejects a payload with an empty items array', () => {
    expect(
      createBookingValidator.safeParse({ ...BASE_BOOKING, items: [] }).success
    ).toBe(false);
  });

  it('rejects duplicate items (the same service twice)', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        items: [{ service_id: SERVICE_ID }, { service_id: SERVICE_ID }],
      }).success
    ).toBe(false);
  });

  it('accepts an optional discount_id and promo_id', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        discount_id: '66666666-6666-4666-a666-666666666666',
        promo_id: '77777777-7777-4777-a777-777777777777',
      }).success
    ).toBe(true);
  });

  it('rejects scheduled_end at or before scheduled_start', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        scheduled_end: BASE_BOOKING.scheduled_start,
      }).success
    ).toBe(false);
  });

  it('accepts an optional payment_scheme', () => {
    for (const scheme of ['downpayment', 'full']) {
      expect(
        createBookingValidator.safeParse({
          ...BASE_BOOKING,
          payment_scheme: scheme,
        }).success
      ).toBe(true);
    }
  });

  it('rejects an unknown payment_scheme value', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        payment_scheme: 'installments',
      }).success
    ).toBe(false);
  });

  it('rejects the retired payment_method / payment_confirmed / payment_choice fields (.strict)', () => {
    for (const field of [
      { payment_method: 'Cash' },
      { payment_confirmed: true },
      { payment_choice: 'full' },
    ]) {
      expect(
        createBookingValidator.safeParse({ ...BASE_BOOKING, ...field }).success
      ).toBe(false);
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
          walking: [{ time_block: 'Morning', duration_minutes: 15 }],
          playing: [{ time_block: 'Afternoon', duration_minutes: 10 }],
          medications: [],
        },
      }).success
    ).toBe(true);
  });

  it('rejects hotel_preferences on a non-Hotel, non-Daycare booking', () => {
    expect(
      createBookingValidator.safeParse({
        ...BASE_BOOKING,
        hotel_preferences: {
          feeding: [],
          walking: [],
          playing: [],
          medications: [],
        },
      }).success
    ).toBe(false);
  });

  it('Custom change (Daycare/Hotel parity follow-up): accepts hotel_preferences on a Daycare booking too', () => {
    const { service_category: _category, ...rest } = BASE_BOOKING;

    expect(
      createBookingValidator.safeParse({
        ...rest,
        service_category: 'Daycare',
        hotel_preferences: {
          feeding: [
            { meal_time: 'Morning', food_type: 'Kibble', quantity: '1 cup' },
          ],
          walking: [],
          playing: [],
          medications: [],
        },
      }).success
    ).toBe(true);
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
            },
          ],
          walking: [],
          playing: [],
          medications: [
            {
              medication_name: 'Amoxicillin',
              dose: '250mg',
              scheduled_times: ['08:00'],
              medication_catalog_id: '22222222-2222-4222-a222-222222222222',
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
        lunch_break_enabled: false,
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

  it('accepts booking_notice_period_days (the new-booking notice knob) and rejects a negative one', () => {
    expect(
      updatePolicyValidator.safeParse({ booking_notice_period_days: 2 }).success
    ).toBe(true);
    expect(
      updatePolicyValidator.safeParse({ booking_notice_period_days: -1 })
        .success
    ).toBe(false);
  });

  it('accepts enabling a per-transaction downpayment (Flat)', () => {
    expect(
      updatePolicyValidator.safeParse({
        downpayment_enabled: true,
        downpayment_type: 'Flat',
        downpayment_amount: 500,
      }).success
    ).toBe(true);
  });

  it('rejects downpayment_type without downpayment_amount (must be provided together)', () => {
    expect(
      updatePolicyValidator.safeParse({
        downpayment_type: 'Flat',
      }).success
    ).toBe(false);
  });

  it('rejects a percentage downpayment over 100', () => {
    expect(
      updatePolicyValidator.safeParse({
        downpayment_type: 'Percentage',
        downpayment_amount: 150,
      }).success
    ).toBe(false);
  });

  it('accepts credit_expiry_mode "rolling" with a day count', () => {
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'rolling',
        credit_expiry_days: 45,
      }).success
    ).toBe(true);
  });

  it('accepts credit_expiry_mode "fixed_date" with a date', () => {
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'fixed_date',
        credit_expiry_fixed_date: '2026-12-31',
      }).success
    ).toBe(true);
  });

  it('rejects "fixed_date" mode without a date', () => {
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'fixed_date',
      }).success
    ).toBe(false);
  });

  it('rejects a fixed date alongside a non-fixed mode (only one or the other)', () => {
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'rolling',
        credit_expiry_days: 30,
        credit_expiry_fixed_date: '2026-12-31',
      }).success
    ).toBe(false);
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'none',
        credit_expiry_fixed_date: '2026-12-31',
      }).success
    ).toBe(false);
  });

  it('rejects a malformed fixed date', () => {
    expect(
      updatePolicyValidator.safeParse({
        credit_expiry_mode: 'fixed_date',
        credit_expiry_fixed_date: '12/31/2026',
      }).success
    ).toBe(false);
  });
});

describe('availabilityQueryValidator', () => {
  const BASE_QUERY = {
    branch_id: BASE_BOOKING.branch_id,
    service_category: 'Grooming' as const,
    date: '2026-08-10',
    slot_duration_minutes: '60',
  };

  it('defaults intent to undefined and accepts an explicit new_booking / reschedule', () => {
    expect(availabilityQueryValidator.safeParse(BASE_QUERY).success).toBe(true);
    expect(
      availabilityQueryValidator.safeParse({
        ...BASE_QUERY,
        intent: 'reschedule',
      }).success
    ).toBe(true);
    expect(
      availabilityQueryValidator.safeParse({
        ...BASE_QUERY,
        intent: 'new_booking',
      }).success
    ).toBe(true);
  });

  it('rejects an unknown intent', () => {
    expect(
      availabilityQueryValidator.safeParse({ ...BASE_QUERY, intent: 'walk_in' })
        .success
    ).toBe(false);
  });
});

describe('overrideBookingStatusValidator', () => {
  it('accepts each overridable status', () => {
    for (const status of ['Pending', 'In Progress', 'Completed']) {
      expect(overrideBookingStatusValidator.safeParse({ status }).success).toBe(
        true
      );
    }
  });

  it('rejects Paid - retired from BookingStatus, tracked via payment_status now', () => {
    expect(
      overrideBookingStatusValidator.safeParse({ status: 'Paid' }).success
    ).toBe(false);
  });

  it('rejects Cancelled/No-show - those keep their own dedicated flows', () => {
    expect(
      overrideBookingStatusValidator.safeParse({ status: 'Cancelled' }).success
    ).toBe(false);
    expect(
      overrideBookingStatusValidator.safeParse({ status: 'No-show' }).success
    ).toBe(false);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      overrideBookingStatusValidator.safeParse({
        status: 'Paid',
        paid_at: '2026-01-01T00:00:00Z',
      }).success
    ).toBe(false);
  });
});
