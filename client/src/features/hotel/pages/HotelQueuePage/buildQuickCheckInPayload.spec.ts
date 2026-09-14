import { describe, expect, it } from 'vitest';
import type { Booking } from '../../../booking/booking.types';
import { buildQuickCheckInPayload } from './buildQuickCheckInPayload';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    hotel_preferences: null,
    ...overrides,
  } as Booking;
}

describe('buildQuickCheckInPayload', () => {
  it('with no hotel_preferences: empty care lists, no cage, medications omitted (server falls back to the prescription)', () => {
    const payload = buildQuickCheckInPayload(booking());

    expect(payload).toEqual({
      booking_id: 'booking-1',
      feeding: [],
      walking: [],
      playing: [],
      medications: undefined,
      notify_opt_in: false,
    });
    expect(payload).not.toHaveProperty('cage_id');
  });

  it('passes the booking-time feeding/walking/playing preferences straight through', () => {
    const payload = buildQuickCheckInPayload(
      booking({
        hotel_preferences: {
          uniform_instructions: true,
          feeding: [
            { meal_time: 'Morning', food_type: 'Kibble', quantity: '1 cup' },
          ],
          walking: [{ time_block: 'Afternoon', duration_minutes: 20 }],
          playing: [],
          medications: [],
        },
      })
    );

    expect(payload.feeding).toEqual([
      { meal_time: 'Morning', food_type: 'Kibble', quantity: '1 cup' },
    ]);
    expect(payload.walking).toEqual([
      { time_block: 'Afternoon', duration_minutes: 20 },
    ]);
    // An empty medications preference still omits the field, so the server
    // can auto-fill from the pet's current prescription.
    expect(payload.medications).toBeUndefined();
  });

  it('sends the booking-time medication list when the booking named one', () => {
    const payload = buildQuickCheckInPayload(
      booking({
        hotel_preferences: {
          uniform_instructions: true,
          feeding: [],
          walking: [],
          playing: [],
          medications: [
            {
              medication_name: 'Amoxicillin',
              dose: '50mg',
              scheduled_times: [],
            },
          ],
        },
      })
    );

    expect(payload.medications).toEqual([
      { medication_name: 'Amoxicillin', dose: '50mg', scheduled_times: [] },
    ]);
  });
});
