import { describe, expect, it } from 'vitest';
import {
  createDiscountValidator,
  updateDiscountValidator,
} from './discounts.validator.ts';

const BRANCH_ID = '11111111-1111-4111-a111-111111111111';
const SERVICE_ID = '22222222-2222-4222-a222-222222222222';
const PACKAGE_ID = '33333333-3333-4333-a333-333333333333';

describe('createDiscountValidator', () => {
  const base = {
    branch_ids: [BRANCH_ID],
    name: 'Loyalty Discount',
    discount_type: 'Percentage',
    value: 10,
  };

  it('AC-1: accepts a service-scoped discount', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'service',
      scope_service_id: SERVICE_ID,
    });

    expect(result.success).toBe(true);
  });

  it('AC-1: accepts a package-scoped discount', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'package',
      scope_package_id: PACKAGE_ID,
    });

    expect(result.success).toBe(true);
  });

  it('AC-4: accepts a category-scoped discount (e.g. all Veterinary services, MA29)', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'category',
      scope_category: 'Veterinary',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a scope field that does not match scope_type', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'service',
      scope_category: 'Veterinary',
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than one scope field (exactly-one-of rule)', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'service',
      scope_service_id: SERVICE_ID,
      scope_category: 'Veterinary',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing scope field', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'category',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a percentage above 100', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      value: 150,
      scope_type: 'category',
      scope_category: 'Grooming',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty branch_ids array', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      branch_ids: [],
      scope_type: 'category',
      scope_category: 'Grooming',
    });

    expect(result.success).toBe(false);
  });

  it('AC-3 (shape): is_mandated is not an accepted create field', () => {
    const result = createDiscountValidator.safeParse({
      ...base,
      scope_type: 'category',
      scope_category: 'Grooming',
      is_mandated: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('updateDiscountValidator', () => {
  it('custom change (unify active/available): rejects is_active - it is derived from branch availability, not independently settable', () => {
    expect(updateDiscountValidator.safeParse({ is_active: true }).success).toBe(
      false
    );
  });

  it('accepts a scope change with a matching scope field', () => {
    const result = updateDiscountValidator.safeParse({
      scope_type: 'category',
      scope_category: 'Hotel',
    });

    expect(result.success).toBe(true);
  });

  it('AC-3: rejects an is_mandated change on any payload', () => {
    expect(
      updateDiscountValidator.safeParse({ is_mandated: false }).success
    ).toBe(false);
  });

  it('rejects a scope_type change without its matching field', () => {
    expect(
      updateDiscountValidator.safeParse({ scope_type: 'package' }).success
    ).toBe(false);
  });
});
