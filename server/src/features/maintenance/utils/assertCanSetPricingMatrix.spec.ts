import { describe, expect, it } from 'vitest';
import {
  assertCanSetPricingMatrix,
  EXTRA_LONG_COAT_SUPERADMIN_ONLY,
} from './assertCanSetPricingMatrix.ts';

describe('assertCanSetPricingMatrix', () => {
  it('lets a Superadmin switch it either way', () => {
    expect(() =>
      assertCanSetPricingMatrix({
        requesterRole: 'Superadmin',
        next: true,
        current: false,
      })
    ).not.toThrow();
  });

  it('stops an Admin from switching it', () => {
    expect(() =>
      assertCanSetPricingMatrix({
        requesterRole: 'Admin',
        next: true,
        current: false,
      })
    ).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('stops an Admin from switching Extra Long Coat prices, with its own message', () => {
    expect(() =>
      assertCanSetPricingMatrix({
        requesterRole: 'Admin',
        next: true,
        current: false,
        message: EXTRA_LONG_COAT_SUPERADMIN_ONLY,
      })
    ).toThrow(
      expect.objectContaining({
        statusCode: 403,
        message: EXTRA_LONG_COAT_SUPERADMIN_ONLY,
      })
    );
  });

  it('still lets an Admin save an item without changing it', () => {
    expect(() =>
      assertCanSetPricingMatrix({
        requesterRole: 'Admin',
        next: true,
        current: true,
      })
    ).not.toThrow();
    expect(() =>
      assertCanSetPricingMatrix({
        requesterRole: 'Admin',
        next: undefined,
        current: false,
      })
    ).not.toThrow();
  });
});
