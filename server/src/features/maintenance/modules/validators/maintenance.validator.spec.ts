import { describe, expect, it } from 'vitest';
import {
  branchAvailabilityValidator,
  createPackageValidator,
  createPromoValidator,
  createServiceValidator,
  updatePackageValidator,
  updatePromoValidator,
  updateServiceValidator,
} from './maintenance.validator.ts';

const BRANCH_ID = '11111111-1111-4111-a111-111111111111';
const SERVICE_ID = '22222222-2222-4222-a222-222222222222';
const SERVICE_ID_2 = '33333333-3333-4333-a333-333333333333';
const PACKAGE_ID = '44444444-4444-4444-a444-444444444444';

describe('createServiceValidator', () => {
  it('accepts a Grooming service with a full size-coat tier set', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: 300,
      pricing_tiers: [
        { weight_class: 'S', coat_type: 'SC', price: 300 },
        { weight_class: 'XL', coat_type: 'LC', price: 650 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects pricing tiers on a non-Grooming category', () => {
    const result = createServiceValidator.safeParse({
      name: 'Wellness Exam',
      category: 'Veterinary',
      base_price: 500,
      pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 500 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative base price', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: -1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict payload)', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: 300,
      is_mandated: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid weight class or coat type in a tier', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: 300,
      pricing_tiers: [{ weight_class: 'XXL', coat_type: 'SC', price: 100 }],
    });

    expect(result.success).toBe(false);
  });
});

describe('updateServiceValidator', () => {
  it('accepts a partial tier update without the full set', () => {
    const result = updateServiceValidator.safeParse({
      pricing_tiers: [{ weight_class: 'M', coat_type: 'LC', price: 420 }],
    });

    expect(result.success).toBe(true);
  });

  it('accepts an is_active-only toggle', () => {
    expect(updateServiceValidator.safeParse({ is_active: false }).success).toBe(
      true
    );
  });
});

describe('branchAvailabilityValidator', () => {
  it('accepts a branch toggle payload', () => {
    const result = branchAvailabilityValidator.safeParse({
      branch_id: BRANCH_ID,
      is_available: false,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid branch id', () => {
    const result = branchAvailabilityValidator.safeParse({
      branch_id: 'makati',
      is_available: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('createPackageValidator', () => {
  it('accepts a per-branch package bundling two or more services', () => {
    const result = createPackageValidator.safeParse({
      branch_id: BRANCH_ID,
      name: 'Golden Package',
      bundled_price: 600,
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a single-service bundle (a package bundles two or more)', () => {
    const result = createPackageValidator.safeParse({
      branch_id: BRANCH_ID,
      name: 'Solo',
      bundled_price: 100,
      service_ids: [SERVICE_ID],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-positive bundled price (M13 Process 2 validation)', () => {
    const result = createPackageValidator.safeParse({
      branch_id: BRANCH_ID,
      name: 'Golden Package',
      bundled_price: 0,
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing branch_id - packages are per-branch rows (MA22)', () => {
    const result = createPackageValidator.safeParse({
      name: 'Golden Package',
      bundled_price: 600,
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePackageValidator', () => {
  it('accepts a bundle replacement plus price edit', () => {
    const result = updatePackageValidator.safeParse({
      bundled_price: 700,
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(true);
  });
});

describe('createPromoValidator', () => {
  const base = {
    name: 'Summer Grooming Deal',
    discount_type: 'Percentage',
    value: 15,
    scope_type: 'all_services',
    branch_scope: 'both',
  };

  it('AC-1: accepts a date-bounded promo', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    });

    expect(result.success).toBe(true);
  });

  it('AC-1: accepts a condition-based promo (note only, no dates)', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      condition_note: 'First booking of the month',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a promo with both dates and a condition note', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      condition_note: 'First booking of the month',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a promo with neither a date range nor a condition note', () => {
    expect(createPromoValidator.safeParse(base).success).toBe(false);
  });

  it('rejects end_date before start_date', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      start_date: '2026-08-31',
      end_date: '2026-08-01',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a percentage value above 100', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      value: 120,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    });

    expect(result.success).toBe(false);
  });

  it("rejects scope_type 'specific' without at least one scope item", () => {
    const result = createPromoValidator.safeParse({
      ...base,
      scope_type: 'specific',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    });

    expect(result.success).toBe(false);
  });

  it("rejects scope items when scope_type is 'all_services'", () => {
    const result = createPromoValidator.safeParse({
      ...base,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      scope: [{ service_id: SERVICE_ID }],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a specific scope over services and packages', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      scope_type: 'specific',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      scope: [{ service_id: SERVICE_ID }, { package_id: PACKAGE_ID }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a scope item targeting both a service and a package', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      scope_type: 'specific',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      scope: [{ service_id: SERVICE_ID, package_id: PACKAGE_ID }],
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePromoValidator', () => {
  it('AC-4: accepts a manual deactivation alone', () => {
    expect(updatePromoValidator.safeParse({ is_active: false }).success).toBe(
      true
    );
  });

  it('still rejects an inverted date pair on update', () => {
    const result = updatePromoValidator.safeParse({
      start_date: '2026-09-30',
      end_date: '2026-09-01',
    });

    expect(result.success).toBe(false);
  });
});
