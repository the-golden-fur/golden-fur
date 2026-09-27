import { describe, expect, it } from 'vitest';
import {
  createMiscSaleValidator,
  previewMiscSaleValidator,
  updateMiscSaleValidator,
} from './billing.validator.ts';

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111';
const CATALOG_ID = '22222222-2222-4222-a222-222222222222';

describe('createMiscSaleValidator', () => {
  const base = {
    customer_id: CUSTOMER_ID,
    payment_method: 'Cash' as const,
    cash_tendered: 100,
  };

  it('session 115: accepts a cart with a catalog item and a freetext item', () => {
    const result = createMiscSaleValidator.safeParse({
      ...base,
      items: [
        { product_catalog_id: CATALOG_ID, quantity: 2 },
        { description: 'Cat toy', amount: 80 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty items array', () => {
    const result = createMiscSaleValidator.safeParse({ ...base, items: [] });

    expect(result.success).toBe(false);
  });

  it('rejects an item that is neither shape (no catalog id, no description+amount)', () => {
    const result = createMiscSaleValidator.safeParse({
      ...base,
      items: [{ quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an item that sets both a catalog id and a freetext description+amount', () => {
    const result = createMiscSaleValidator.safeParse({
      ...base,
      items: [
        {
          product_catalog_id: CATALOG_ID,
          description: 'Cat toy',
          amount: 80,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects Cash without cash_tendered (shared validatePaymentShape)', () => {
    const result = createMiscSaleValidator.safeParse({
      customer_id: CUSTOMER_ID,
      payment_method: 'Cash',
      items: [{ description: 'Cat toy', amount: 80 }],
    });

    expect(result.success).toBe(false);
  });

  it('defaults senior_citizen_eligible/pwd_eligible to false when omitted', () => {
    const result = createMiscSaleValidator.safeParse({
      ...base,
      items: [{ description: 'Cat toy', amount: 80 }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.senior_citizen_eligible).toBe(false);
      expect(result.data.pwd_eligible).toBe(false);
    }
  });
});

describe('previewMiscSaleValidator', () => {
  it('accepts a cart + payment method with no customer_id required', () => {
    const result = previewMiscSaleValidator.safeParse({
      items: [{ description: 'Cat toy', amount: 80 }],
      payment_method: 'GCash',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty items array', () => {
    const result = previewMiscSaleValidator.safeParse({
      items: [],
      payment_method: 'Cash',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a customer_id field - strict mode, this endpoint never creates anything', () => {
    const result = previewMiscSaleValidator.safeParse({
      items: [{ description: 'Cat toy', amount: 80 }],
      payment_method: 'Cash',
      customer_id: CUSTOMER_ID,
    });

    expect(result.success).toBe(false);
  });
});

describe('updateMiscSaleValidator', () => {
  it('session 115: accepts a payment-fields-only payload', () => {
    const result = updateMiscSaleValidator.safeParse({
      payment_method: 'GCash',
      payment_reference: 'GC-123',
    });

    expect(result.success).toBe(true);
  });

  it('session 115: rejects description/amount fields now that a sale is a multi-item cart', () => {
    const result = updateMiscSaleValidator.safeParse({
      description: 'Cat toy',
      amount: 80,
    });

    expect(result.success).toBe(false);
  });

  it('accepts an empty payload (no-op update)', () => {
    expect(updateMiscSaleValidator.safeParse({}).success).toBe(true);
  });
});
