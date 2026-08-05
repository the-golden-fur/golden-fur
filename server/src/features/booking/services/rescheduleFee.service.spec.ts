import { describe, expect, it } from 'vitest';
import { calculateRescheduleFee } from './rescheduleFee.service.ts';
import type { EffectivePolicy } from '../booking.types.ts';

function policy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    notice_period_days: 3,
    notice_enforcement_mode: 'Strict',
    notice_enforcement_enabled: true,
    staff_picker_enabled_grooming: true,
    staff_picker_enabled_veterinary: true,
    lunch_break_enabled: true,
    lunch_break_start: '12:00',
    lunch_break_end: '13:00',
    downpayment_percentage: 50,
    reschedule_fee_enabled: false,
    reschedule_fee_type: null,
    reschedule_fee_value: null,
    reschedule_free_allowance: null,
    credit_expiry_enabled: true,
    credit_expiry_days: 30,
    ...overrides,
  };
}

describe('rescheduleFee.service (#92)', () => {
  it('AC-2: reschedule_fee_enabled = false results in no fee regardless of allowance', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: false,
        reschedule_free_allowance: 0,
      }),
      booking: { reschedule_count: 5, total_price: 1000 },
    });

    expect(fee).toBeNull();
  });

  it('AC-1: earlier reschedules within the free allowance incur no fee', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: true,
        reschedule_fee_type: 'Flat',
        reschedule_fee_value: 200,
        reschedule_free_allowance: 2,
      }),
      booking: { reschedule_count: 1, total_price: 1000 },
    });

    expect(fee).toBeNull();
  });

  it('AC-1: a Flat fee is charged once reschedule_count reaches the allowance', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: true,
        reschedule_fee_type: 'Flat',
        reschedule_fee_value: 200,
        reschedule_free_allowance: 2,
      }),
      booking: { reschedule_count: 2, total_price: 1000 },
    });

    expect(fee).toBe(200);
  });

  it('AC-3: a Percentage fee is calculated against a multi-item booking total, not any single item', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: true,
        reschedule_fee_type: 'Percentage',
        reschedule_fee_value: 10,
        reschedule_free_allowance: 0,
      }),
      // total_price already reflects the summed booking_items total.
      booking: { reschedule_count: 0, total_price: 2500 },
    });

    expect(fee).toBe(250);
  });

  it('a NULL allowance (unlimited free reschedules) never charges a fee', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: true,
        reschedule_fee_type: 'Flat',
        reschedule_fee_value: 200,
        reschedule_free_allowance: null,
      }),
      booking: { reschedule_count: 50, total_price: 1000 },
    });

    expect(fee).toBeNull();
  });

  it('rounds to 2 decimal places', () => {
    const fee = calculateRescheduleFee({
      policy: policy({
        reschedule_fee_enabled: true,
        reschedule_fee_type: 'Percentage',
        reschedule_fee_value: 33.33,
        reschedule_free_allowance: 0,
      }),
      booking: { reschedule_count: 0, total_price: 100 },
    });

    expect(fee).toBe(33.33);
  });
});
