import { describe, expect, it } from 'vitest';
import { servicePriceAtBranch } from './branchServicePrice.ts';

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
