import { describe, expect, it } from 'vitest';
import { getPromoTiming } from './promoTiming';

const TODAY = '2026-07-26';

describe('getPromoTiming', () => {
  it('classifies a future start_date as Upcoming', () => {
    expect(
      getPromoTiming(
        { start_date: '2026-08-01', end_date: '2026-08-31' },
        TODAY
      )
    ).toBe('Upcoming');
  });

  it('classifies a past end_date as Ended', () => {
    expect(
      getPromoTiming(
        { start_date: '2026-06-01', end_date: '2026-06-30' },
        TODAY
      )
    ).toBe('Ended');
  });

  it('classifies today within the window as Active', () => {
    expect(
      getPromoTiming(
        { start_date: '2026-07-01', end_date: '2026-08-01' },
        TODAY
      )
    ).toBe('Active');
  });

  it('classifies a window starting/ending exactly today as Active', () => {
    expect(
      getPromoTiming({ start_date: TODAY, end_date: TODAY }, TODAY)
    ).toBe('Active');
  });

  it('classifies a promo with no window (condition-based) as Active', () => {
    expect(
      getPromoTiming({ start_date: null, end_date: null }, TODAY)
    ).toBe('Active');
  });
});
