import { describe, expect, it } from 'vitest';
import {
  isPromoCurrentlyEligible,
  manilaDateString,
  manilaDayOfWeek,
  type PromoEligibilityInput,
} from './promoEligibility.service.ts';

function dateRangePromo(
  overrides: Partial<PromoEligibilityInput> = {}
): PromoEligibilityInput {
  return {
    is_active: true,
    promo_type: 'date_range',
    start_date: null,
    end_date: null,
    days_of_week: null,
    ...overrides,
  };
}

describe('promoEligibility.service', () => {
  it('manilaDayOfWeek/manilaDateString roll the date forward across the UTC+8 offset', () => {
    // 2026-01-01T20:00:00Z is already 2026-01-02 04:00 in Manila (a Friday).
    const lateUtc = new Date('2026-01-01T20:00:00.000Z');
    expect(manilaDateString(lateUtc)).toBe('2026-01-02');
    expect(manilaDayOfWeek(lateUtc)).toBe(5); // Friday
  });

  it('an inactive promo is never eligible regardless of type/window', () => {
    expect(isPromoCurrentlyEligible(dateRangePromo({ is_active: false }))).toBe(
      false
    );
  });

  describe('date_range', () => {
    it('is eligible with no start/end bounds', () => {
      expect(isPromoCurrentlyEligible(dateRangePromo())).toBe(true);
    });

    it('is ineligible before start_date', () => {
      const now = new Date('2026-06-01T00:00:00.000Z');
      expect(
        isPromoCurrentlyEligible(
          dateRangePromo({ start_date: '2026-06-05' }),
          now
        )
      ).toBe(false);
    });

    it('is ineligible after end_date', () => {
      const now = new Date('2026-06-10T00:00:00.000Z');
      expect(
        isPromoCurrentlyEligible(
          dateRangePromo({ end_date: '2026-06-05' }),
          now
        )
      ).toBe(false);
    });
  });

  describe('weekly_recurring', () => {
    it('is eligible on a matching Manila weekday', () => {
      // 2026-06-02T18:00:00Z = 2026-06-03 02:00 Manila = Wednesday (3).
      const now = new Date('2026-06-02T18:00:00.000Z');
      expect(
        isPromoCurrentlyEligible(
          dateRangePromo({ promo_type: 'weekly_recurring', days_of_week: [3] }),
          now
        )
      ).toBe(true);
    });

    it('is ineligible on a non-matching weekday', () => {
      const now = new Date('2026-06-02T18:00:00.000Z'); // Wednesday
      expect(
        isPromoCurrentlyEligible(
          dateRangePromo({ promo_type: 'weekly_recurring', days_of_week: [1] }),
          now
        )
      ).toBe(false);
    });

    it('still respects an optional overall campaign window', () => {
      const now = new Date('2026-06-02T18:00:00.000Z'); // Wednesday
      expect(
        isPromoCurrentlyEligible(
          dateRangePromo({
            promo_type: 'weekly_recurring',
            days_of_week: [3],
            end_date: '2026-05-01',
          }),
          now
        )
      ).toBe(false);
    });
  });
});
