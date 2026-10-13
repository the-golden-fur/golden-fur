import { describe, expect, it } from 'vitest';
import {
  longStayPriceAtBranch,
  longStayTermsAtBranch,
  nightlyPriceAtBranch,
  servicePriceAtBranch,
} from './branchServicePrice.ts';

// Hotel long-stay rate (migration 20261013260): 850 a night in Makati and
// 500 in Southwoods; booked for 5 nights or more, 750 and 450.
const LONG_STAY_HOTEL = {
  base_price: 850,
  long_stay_nightly_price: 750,
  min_nights_for_free_package: 5,
  service_branch_availability: [
    {
      branch_id: 'makati',
      price_override: null,
      long_stay_price_override: null,
    },
    {
      branch_id: 'southwoods',
      price_override: 500,
      long_stay_price_override: 450,
    },
  ],
};

describe('longStayPriceAtBranch', () => {
  it("uses the branch's own long-stay price, else the service's", () => {
    expect(longStayPriceAtBranch(LONG_STAY_HOTEL, 'southwoods')).toBe(450);
    expect(longStayPriceAtBranch(LONG_STAY_HOTEL, 'makati')).toBe(750);
    expect(longStayPriceAtBranch(LONG_STAY_HOTEL, 'elsewhere')).toBe(750);
  });

  it('is null for a service with no long-stay rate', () => {
    expect(longStayPriceAtBranch({ base_price: 850 }, 'makati')).toBeNull();
  });
});

describe('longStayTermsAtBranch', () => {
  it('pairs the long-stay rate with the regular one and the night threshold', () => {
    expect(longStayTermsAtBranch(LONG_STAY_HOTEL, 'makati')).toEqual({
      minNights: 5,
      longStayRate: 750,
      regularRate: 850,
    });
    expect(longStayTermsAtBranch(LONG_STAY_HOTEL, 'southwoods')).toEqual({
      minNights: 5,
      longStayRate: 450,
      regularRate: 500,
    });
  });

  it('is null without a price, or without a night threshold', () => {
    expect(
      longStayTermsAtBranch(
        { ...LONG_STAY_HOTEL, long_stay_nightly_price: null },
        'makati'
      )
    ).toBeNull();
    expect(
      longStayTermsAtBranch(
        { ...LONG_STAY_HOTEL, min_nights_for_free_package: null },
        'makati'
      )
    ).toBeNull();
  });
});

describe('nightlyPriceAtBranch', () => {
  it('is the regular price below the threshold and the long-stay price from it', () => {
    expect(nightlyPriceAtBranch(LONG_STAY_HOTEL, 'makati', 4)).toBe(850);
    expect(nightlyPriceAtBranch(LONG_STAY_HOTEL, 'makati', 5)).toBe(750);
    expect(nightlyPriceAtBranch(LONG_STAY_HOTEL, 'southwoods', 4)).toBe(500);
    expect(nightlyPriceAtBranch(LONG_STAY_HOTEL, 'southwoods', 6)).toBe(450);
  });

  it('is always the regular price for a service with no long-stay rate', () => {
    expect(nightlyPriceAtBranch({ base_price: 850 }, 'makati', 30)).toBe(850);
  });
});

const HOTEL = {
  base_price: 850,
  service_branch_availability: [
    { branch_id: 'makati', price_override: null },
    { branch_id: 'southwoods', price_override: 500 },
  ],
};

describe('servicePriceAtBranch', () => {
  it("uses the branch's own price when it has one", () => {
    expect(servicePriceAtBranch(HOTEL, 'southwoods')).toBe(500);
  });

  it('falls back to the base price for a branch with no price of its own', () => {
    expect(servicePriceAtBranch(HOTEL, 'makati')).toBe(850);
  });

  it('falls back to the base price for a branch with no row at all', () => {
    expect(servicePriceAtBranch(HOTEL, 'elsewhere')).toBe(850);
    expect(servicePriceAtBranch({ base_price: 850 }, 'southwoods')).toBe(850);
  });

  it('honours a branch price of zero', () => {
    expect(
      servicePriceAtBranch(
        {
          base_price: 850,
          service_branch_availability: [
            { branch_id: 'southwoods', price_override: 0 },
          ],
        },
        'southwoods'
      )
    ).toBe(0);
  });

  it('reads numeric strings, as Postgres returns numeric columns', () => {
    expect(
      servicePriceAtBranch(
        {
          base_price: '850.00' as unknown as number,
          service_branch_availability: [
            {
              branch_id: 'southwoods',
              price_override: '500.00' as unknown as number,
            },
          ],
        },
        'southwoods'
      )
    ).toBe(500);
  });
});
