import { describe, expect, it } from 'vitest';
import { checkInValidator } from './daycare.validator.ts';

const BASE_WALK_IN = {
  pet_id: '11111111-1111-4111-a111-111111111111',
  branch_id: '22222222-2222-4222-a222-222222222222',
};

describe('daycare.validator - checkInValidator (Daycare-only clock-time scheduling)', () => {
  it('accepts a feeding/walking/playing row that uses scheduled_time instead of the Hotel day-period enum', () => {
    const result = checkInValidator.safeParse({
      ...BASE_WALK_IN,
      feeding: [
        {
          scheduled_time: '08:30',
          food_type: 'Kibble',
          quantity: '1 cup',
        },
      ],
      walking: [{ scheduled_time: '09:00', duration_minutes: 15 }],
      playing: [{ scheduled_time: '10:00', duration_minutes: 10 }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a feeding row that uses Hotel-style meal_time instead of scheduled_time', () => {
    const result = checkInValidator.safeParse({
      ...BASE_WALK_IN,
      feeding: [
        { meal_time: 'Morning', food_type: 'Kibble', quantity: '1 cup' },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a walking row that uses Hotel-style time_block instead of scheduled_time', () => {
    const result = checkInValidator.safeParse({
      ...BASE_WALK_IN,
      walking: [{ time_block: 'Morning', duration_minutes: 15 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a malformed scheduled_time', () => {
    const result = checkInValidator.safeParse({
      ...BASE_WALK_IN,
      walking: [{ scheduled_time: '9am', duration_minutes: 15 }],
    });

    expect(result.success).toBe(false);
  });

  it('still accepts medications with literal scheduled_times, unaffected by this change', () => {
    const result = checkInValidator.safeParse({
      ...BASE_WALK_IN,
      medications: [
        {
          medication_name: 'Amoxicillin',
          dose: '250mg',
          scheduled_times: ['08:00'],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
