import { describe, expect, it } from 'vitest';
import {
  branchAvailabilityValidator,
  createBreedValidator,
  createPackageValidator,
  createPromoValidator,
  createServiceValidator,
  updateBreedValidator,
  updatePackagePricingConfigurationValidator,
  updatePackageValidator,
  updatePricingConfigurationValidator,
  updatePromoValidator,
  updateServiceValidator,
  upsertPromoCapConfigurationValidator,
} from './maintenance.validator.ts';

const BRANCH_ID = '11111111-1111-4111-a111-111111111111';
const SERVICE_ID = '22222222-2222-4222-a222-222222222222';
const SERVICE_ID_2 = '33333333-3333-4333-a333-333333333333';
const PACKAGE_ID = '44444444-4444-4444-a444-444444444444';

describe('createServiceValidator', () => {
  it('accepts a valid Grooming service', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: 300,
    });

    expect(result.success).toBe(true);
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

  it('rejects a pricing_tiers key (Epic B #81: the matrix is derived, not accepted as input)', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
      base_price: 300,
      pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 300 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-Daycare service with no base_price (Custom change: Daycare fee configuration follow-up)', () => {
    const result = createServiceValidator.safeParse({
      name: 'Bath',
      category: 'Grooming',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a Daycare service with no base_price, given first/succeeding-hour fees', () => {
    const result = createServiceValidator.safeParse({
      name: 'Daycare (per hour)',
      category: 'Daycare',
      first_hour_fee: 100,
      succeeding_hour_fee: 50,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a Daycare service missing succeeding_hour_fee, even with base_price present', () => {
    const result = createServiceValidator.safeParse({
      name: 'Daycare (per hour)',
      category: 'Daycare',
      base_price: 100,
      first_hour_fee: 100,
    });

    expect(result.success).toBe(false);
  });
});

describe('updateServiceValidator', () => {
  it('accepts an is_active-only toggle', () => {
    expect(updateServiceValidator.safeParse({ is_active: false }).success).toBe(
      true
    );
  });

  it('rejects a pricing_tiers key (Epic B #81)', () => {
    const result = updateServiceValidator.safeParse({
      pricing_tiers: [{ weight_class: 'M', coat_type: 'LC', price: 420 }],
    });

    expect(result.success).toBe(false);
  });

  it('accepts turning requires_downpayment off alongside a nulled amount/type', () => {
    const result = updateServiceValidator.safeParse({
      requires_downpayment: false,
      downpayment_amount: null,
      downpayment_type: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects turning requires_downpayment off while leaving a stale downpayment_amount (mirrors services_downpayment_amount_check)', () => {
    const result = updateServiceValidator.safeParse({
      requires_downpayment: false,
      downpayment_amount: 500,
    });

    expect(result.success).toBe(false);
  });

  it('rejects turning requires_downpayment off while leaving a stale downpayment_type', () => {
    const result = updateServiceValidator.safeParse({
      requires_downpayment: false,
      downpayment_type: 'Flat',
    });

    expect(result.success).toBe(false);
  });

  it('accepts turning requires_downpayment on with a valid amount and type', () => {
    const result = updateServiceValidator.safeParse({
      requires_downpayment: true,
      downpayment_amount: 500,
      downpayment_type: 'Flat',
    });

    expect(result.success).toBe(true);
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
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a single-service bundle (a package bundles two or more)', () => {
    const result = createPackageValidator.safeParse({
      branch_id: BRANCH_ID,
      name: 'Solo',
      service_ids: [SERVICE_ID],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing branch_id - packages are per-branch rows (MA22)', () => {
    const result = createPackageValidator.safeParse({
      name: 'Golden Package',
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a bundled_price key (Epic B #83: the price is derived, not accepted as input)', () => {
    const result = createPackageValidator.safeParse({
      branch_id: BRANCH_ID,
      name: 'Golden Package',
      bundled_price: 600,
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePackageValidator', () => {
  it('accepts a bundle replacement alone', () => {
    const result = updatePackageValidator.safeParse({
      service_ids: [SERVICE_ID, SERVICE_ID_2],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a bundled_price key (Epic B #83)', () => {
    const result = updatePackageValidator.safeParse({
      bundled_price: 700,
    });

    expect(result.success).toBe(false);
  });

  it('rejects turning requires_downpayment off while leaving a stale downpayment_amount (mirrors packages_downpayment_amount_check)', () => {
    const result = updatePackageValidator.safeParse({
      requires_downpayment: false,
      downpayment_amount: 500,
    });

    expect(result.success).toBe(false);
  });

  it('accepts turning requires_downpayment off alongside a nulled amount/type', () => {
    const result = updatePackageValidator.safeParse({
      requires_downpayment: false,
      downpayment_amount: null,
      downpayment_type: null,
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

  it('rejects an is_exclusive key (Epic B #84: replaced by promo_cap_configuration)', () => {
    const result = createPromoValidator.safeParse({
      ...base,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      is_exclusive: true,
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

  it('rejects an is_exclusive key (Epic B #84)', () => {
    const result = updatePromoValidator.safeParse({ is_exclusive: false });

    expect(result.success).toBe(false);
  });
});

describe('createBreedValidator', () => {
  it('accepts a valid Dog breed', () => {
    const result = createBreedValidator.safeParse({
      pet_type: 'Dog',
      name: 'Beagle',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid pet_type', () => {
    const result = createBreedValidator.safeParse({
      pet_type: 'Bird',
      name: 'Beagle',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a blank name', () => {
    const result = createBreedValidator.safeParse({
      pet_type: 'Dog',
      name: '  ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = createBreedValidator.safeParse({
      pet_type: 'Dog',
      name: 'Beagle',
      is_active: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('updateBreedValidator', () => {
  it('accepts a partial rename', () => {
    expect(updateBreedValidator.safeParse({ name: 'New Name' }).success).toBe(
      true
    );
  });

  it('accepts an empty payload', () => {
    expect(updateBreedValidator.safeParse({}).success).toBe(true);
  });
});

describe('updatePricingConfigurationValidator (Epic B #80; custom change: configurable pricing rules)', () => {
  it('accepts a partial rule-value update', () => {
    expect(
      updatePricingConfigurationValidator.safeParse({
        coat_long_rule_value: 75,
      }).success
    ).toBe(true);
  });

  it('accepts a flat/percentage rule of exactly 0', () => {
    expect(
      updatePricingConfigurationValidator.safeParse({
        coat_long_rule_type: 'flat',
        coat_long_rule_value: 0,
      }).success
    ).toBe(true);
  });

  it('rejects a multiplier rule of exactly 0 when both fields are in the same request', () => {
    expect(
      updatePricingConfigurationValidator.safeParse({
        size_s_rule_type: 'multiplier',
        size_s_rule_value: 0,
      }).success
    ).toBe(false);
  });

  it('rejects a negative rule value', () => {
    expect(
      updatePricingConfigurationValidator.safeParse({
        coat_long_rule_value: -1,
      }).success
    ).toBe(false);
  });

  it('rejects an unrecognized rule type', () => {
    expect(
      updatePricingConfigurationValidator.safeParse({
        size_s_rule_type: 'exponential',
      }).success
    ).toBe(false);
  });
});

describe('updatePackagePricingConfigurationValidator (Epic B #82)', () => {
  it('accepts a fraction between 0 and 1', () => {
    expect(
      updatePackagePricingConfigurationValidator.safeParse({
        bundle_discount_percentage: 0.15,
      }).success
    ).toBe(true);
  });

  it('rejects a fraction above 1', () => {
    expect(
      updatePackagePricingConfigurationValidator.safeParse({
        bundle_discount_percentage: 1.5,
      }).success
    ).toBe(false);
  });

  it('rejects a negative fraction', () => {
    expect(
      updatePackagePricingConfigurationValidator.safeParse({
        bundle_discount_percentage: -0.1,
      }).success
    ).toBe(false);
  });
});

describe('upsertPromoCapConfigurationValidator (Epic B #84)', () => {
  it('accepts a branch-scoped percentage cap', () => {
    expect(
      upsertPromoCapConfigurationValidator.safeParse({
        branch_id: BRANCH_ID,
        cap_type: 'percentage',
        cap_value: 20,
      }).success
    ).toBe(true);
  });

  it('accepts a null branch_id for the system-wide default cap', () => {
    expect(
      upsertPromoCapConfigurationValidator.safeParse({
        branch_id: null,
        cap_type: 'flat',
        cap_value: 100,
      }).success
    ).toBe(true);
  });

  it('rejects a negative cap_value', () => {
    expect(
      upsertPromoCapConfigurationValidator.safeParse({
        cap_type: 'percentage',
        cap_value: -5,
      }).success
    ).toBe(false);
  });

  it('rejects an unrecognized cap_type', () => {
    expect(
      upsertPromoCapConfigurationValidator.safeParse({
        cap_type: 'exclusive',
        cap_value: 10,
      }).success
    ).toBe(false);
  });
});
