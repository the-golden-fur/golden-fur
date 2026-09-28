import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateDiscounts,
  evaluateMiscSaleDiscounts,
  evaluateMiscSalePromos,
  evaluatePromos,
  listMiscSaleOptions,
} from './discountPromoEvaluation.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { BookingForBilling } from './lineItemSources.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Same queueing mock shape as promoCap.service.spec.ts - each call to
 * supabase.from() consumes the next queued result, regardless of which
 * table/chain produced it (call order is deterministic per evaluatePromos
 * run: promos select, then the branch-scoped cap lookup, then optionally
 * the default cap lookup). */
const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  builders.length = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.neq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

function buildBooking(
  overrides: Partial<BookingForBilling> = {}
): BookingForBilling {
  return {
    id: 'booking-1',
    customer_id: 'customer-1',
    branch_id: 'branch-makati',
    branchName: 'Makati',
    service_category: 'Grooming',
    items: [{ id: 'item-1', service_id: 'service-1', package_id: null }],
    status: 'Completed',
    total_price: 1000,
    downpayment_required: false,
    downpayment_amount: null,
    payment_method: 'Cash',
    selected_discount_id: null,
    selected_discount_name: null,
    discount_amount: 0,
    selected_promo_id: null,
    selected_promo_name: null,
    promo_amount: 0,
    ...overrides,
  } as BookingForBilling;
}

function buildPromoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    name: 'Promo',
    is_active: true,
    promo_type: 'date_range',
    start_date: null,
    end_date: null,
    days_of_week: null,
    discount_type: 'Percentage',
    value: 10,
    scope_type: 'all_services',
    promo_scope: [],
    promo_branch_availability: [
      { branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('evaluatePromos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a percentage/flat cap trims the last promo that would cross it, applying largest-value-first', async () => {
    queueFromResults(
      {
        data: [
          buildPromoRow({ id: 'promo-a', name: 'Promo A', value: 30 }),
          buildPromoRow({ id: 'promo-b', name: 'Promo B', value: 20 }),
        ],
        error: null,
      }, // promos
      {
        data: { cap_type: 'percentage', cap_value: 40 },
        error: null,
      } // branch-scoped cap row
    );

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied).toHaveLength(2);
    expect(applied[0]).toMatchObject({
      promoId: 'promo-a',
      line: { unit_price: -300 },
    });
    // Promo B (200 uncapped) is trimmed to the 100 remaining headroom.
    expect(applied[1]).toMatchObject({
      promoId: 'promo-b',
      line: { unit_price: -100 },
    });
  });

  it('a count cap applies only the N largest-value promos in full and drops the rest entirely', async () => {
    queueFromResults(
      {
        data: [
          buildPromoRow({ id: 'promo-a', name: 'Promo A', value: 30 }),
          buildPromoRow({ id: 'promo-b', name: 'Promo B', value: 20 }),
          buildPromoRow({ id: 'promo-c', name: 'Promo C', value: 10 }),
        ],
        error: null,
      }, // promos
      {
        data: { cap_type: 'count', cap_value: 2 },
        error: null,
      } // branch-scoped cap row
    );

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied.map((entry) => entry.promoId)).toEqual([
      'promo-a',
      'promo-b',
    ]);
    // Full amounts, not trimmed - a count cap has no notion of a partial promo.
    expect(applied[0].line.unit_price).toBe(-300);
    expect(applied[1].line.unit_price).toBe(-200);
  });

  it('never loads spin-wheel or archived promos as auto-apply candidates (session 114)', async () => {
    queueFromResults({ data: [], error: null });

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied).toEqual([]);
    expect(builders[0].neq).toHaveBeenCalledWith('promo_type', 'spin_wheel');
    expect(builders[0].is).toHaveBeenCalledWith('archived_at', null);
  });

  it('drops a spin-wheel promo even if one slips past the query filter', async () => {
    queueFromResults({
      data: [buildPromoRow({ id: 'spin', promo_type: 'spin_wheel' })],
      error: null,
    });

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied).toEqual([]);
  });

  it('a count cap of 0 drops every otherwise-matching promo', async () => {
    queueFromResults(
      {
        data: [buildPromoRow({ id: 'promo-a', value: 30 })],
        error: null,
      },
      {
        data: { cap_type: 'count', cap_value: 0 },
        error: null,
      }
    );

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied).toEqual([]);
  });

  it('falls back to the system-wide default cap when no branch-specific row exists', async () => {
    queueFromResults(
      {
        data: [buildPromoRow({ id: 'promo-a', value: 30 })],
        error: null,
      }, // promos
      { data: null, error: null }, // no branch-scoped row
      {
        data: { cap_type: 'count', cap_value: 1 },
        error: null,
      } // default row
    );

    const applied = await evaluatePromos(buildBooking(), 1000);

    expect(applied).toHaveLength(1);
    expect(applied[0].promoId).toBe('promo-a');
  });
});

function buildDiscountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'discount-1',
    name: 'Misc Sale Discount',
    is_mandated: false,
    mandated_kind: null,
    discount_type: 'Percentage',
    value: 10,
    scope_type: 'misc_sale',
    scope_service_id: null,
    scope_package_id: null,
    scope_category: null,
    discount_branch_availability: [
      { branch_id: 'branch-makati', is_available: true },
    ],
    ...overrides,
  };
}

describe('evaluateMiscSaleDiscounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] without querying when nothing was picked', async () => {
    const result = await evaluateMiscSaleDiscounts({
      branchId: 'branch-makati',
      paymentMethod: 'Cash',
      discountIds: [],
      subtotal: 500,
    });

    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns [] without querying when the payment method is not Cash, even with picks', async () => {
    const result = await evaluateMiscSaleDiscounts({
      branchId: 'branch-makati',
      paymentMethod: 'GCash',
      discountIds: ['discount-1'],
      subtotal: 500,
    });

    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('applies only the picked misc_sale discount, querying active, non-archived misc_sale rows', async () => {
    queueFromResults({
      data: [
        buildDiscountRow(),
        buildDiscountRow({ id: 'discount-2', name: 'Not picked' }),
      ],
      error: null,
    });

    const result = await evaluateMiscSaleDiscounts({
      branchId: 'branch-makati',
      paymentMethod: 'Cash',
      discountIds: ['discount-1'],
      subtotal: 500,
    });

    expect(result).toEqual([
      {
        line_item_type: 'discount',
        reference_id: 'discount-1',
        description: 'Misc Sale Discount',
        quantity: 1,
        unit_price: -50,
        line_total: -50,
      },
    ]);
    expect(builders[0].eq).toHaveBeenCalledWith('is_active', true);
    expect(builders[0].eq).toHaveBeenCalledWith('scope_type', 'misc_sale');
    expect(builders[0].is).toHaveBeenCalledWith('archived_at', null);
  });

  it('applies a picked mandated discount with no separate eligibility flag (picking it is the ID check)', async () => {
    queueFromResults({
      data: [
        buildDiscountRow({
          name: 'Senior Citizen Discount',
          is_mandated: true,
          mandated_kind: 'senior_citizen',
          value: 20,
        }),
      ],
      error: null,
    });

    const result = await evaluateMiscSaleDiscounts({
      branchId: 'branch-makati',
      paymentMethod: 'Cash',
      discountIds: ['discount-1'],
      subtotal: 500,
    });

    expect(result).toHaveLength(1);
    expect(result[0].line_total).toBe(-100);
  });

  it('caps a flat discount at the subtotal', async () => {
    queueFromResults({
      data: [buildDiscountRow({ discount_type: 'Flat', value: 900 })],
      error: null,
    });

    const result = await evaluateMiscSaleDiscounts({
      branchId: 'branch-makati',
      paymentMethod: 'Cash',
      discountIds: ['discount-1'],
      subtotal: 500,
    });

    expect(result[0].line_total).toBe(-500);
  });

  it('rejects a picked discount that is not available at the branch', async () => {
    queueFromResults({
      data: [
        buildDiscountRow({
          discount_branch_availability: [
            { branch_id: 'branch-cebu', is_available: true },
          ],
        }),
      ],
      error: null,
    });

    await expect(
      evaluateMiscSaleDiscounts({
        branchId: 'branch-makati',
        paymentMethod: 'Cash',
        discountIds: ['discount-1'],
        subtotal: 500,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('evaluateDiscounts (booking path) - mandated discounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const BOOKING = {
    branch_id: 'branch-makati',
    payment_method: 'Cash',
    service_category: 'Grooming',
    items: [],
  } as unknown as BookingForBilling;

  function categoryDiscount(overrides: Record<string, unknown>) {
    return buildDiscountRow({
      scope_type: 'category',
      scope_category: 'Grooming',
      ...overrides,
    });
  }

  it('skips a mandated discount when the customer is not eligible, even after it was renamed', async () => {
    queueFromResults({
      data: [
        categoryDiscount({
          name: 'Golden Years Discount',
          is_mandated: true,
          mandated_kind: 'senior_citizen',
        }),
      ],
      error: null,
    });

    const lines = await evaluateDiscounts(
      BOOKING,
      { seniorCitizenEligible: false, pwdEligible: true },
      1000
    );

    expect(lines).toEqual([]);
  });

  it('applies a renamed mandated discount once the matching eligibility flag is set', async () => {
    queueFromResults({
      data: [
        categoryDiscount({
          name: 'Golden Years Discount',
          is_mandated: true,
          mandated_kind: 'senior_citizen',
        }),
      ],
      error: null,
    });

    const lines = await evaluateDiscounts(
      BOOKING,
      { seniorCitizenEligible: true, pwdEligible: false },
      1000
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('Golden Years Discount');
  });

  it('gates PWD discounts on pwdEligible only', async () => {
    queueFromResults({
      data: [
        categoryDiscount({
          name: 'PWD Discount',
          is_mandated: true,
          mandated_kind: 'pwd',
        }),
      ],
      error: null,
    });

    const lines = await evaluateDiscounts(
      BOOKING,
      { seniorCitizenEligible: true, pwdEligible: false },
      1000
    );

    expect(lines).toEqual([]);
  });
});

describe('evaluateMiscSalePromos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] without querying when nothing was picked', async () => {
    const applied = await evaluateMiscSalePromos({
      branchId: 'branch-makati',
      promoIds: [],
      subtotal: 1000,
    });

    expect(applied).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('applies only the picked all_services promo, under the branch cap', async () => {
    queueFromResults(
      {
        data: [
          buildPromoRow({ id: 'promo-a', value: 15 }),
          buildPromoRow({ id: 'promo-b', value: 5 }),
        ],
        error: null,
      },
      { data: { cap_type: 'count', cap_value: 5 }, error: null }
    );

    const applied = await evaluateMiscSalePromos({
      branchId: 'branch-makati',
      promoIds: ['promo-a'],
      subtotal: 1000,
    });

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      promoId: 'promo-a',
      line: { unit_price: -150 },
    });
  });

  it('still enforces the promo cap across several picks', async () => {
    queueFromResults(
      {
        data: [
          buildPromoRow({ id: 'promo-a', value: 15 }),
          buildPromoRow({ id: 'promo-b', value: 5 }),
        ],
        error: null,
      },
      { data: { cap_type: 'count', cap_value: 1 }, error: null }
    );

    const applied = await evaluateMiscSalePromos({
      branchId: 'branch-makati',
      promoIds: ['promo-a', 'promo-b'],
      subtotal: 1000,
    });

    expect(applied.map((promo) => promo.promoId)).toEqual(['promo-a']);
  });

  it("rejects a picked 'specific' scoped promo, since a misc sale has no service/package items", async () => {
    queueFromResults({
      data: [
        buildPromoRow({
          id: 'promo-specific',
          scope_type: 'specific',
          promo_scope: [{ service_id: 'service-1', package_id: null }],
        }),
      ],
      error: null,
    });

    await expect(
      evaluateMiscSalePromos({
        branchId: 'branch-makati',
        promoIds: ['promo-specific'],
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('listMiscSaleOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the branch's misc_sale discounts and all_services promos, dropping ones unavailable at the branch", async () => {
    queueFromResults(
      {
        data: [
          buildDiscountRow(),
          buildDiscountRow({
            id: 'discount-cebu',
            discount_branch_availability: [
              { branch_id: 'branch-cebu', is_available: true },
            ],
          }),
        ],
        error: null,
      },
      {
        data: [
          buildPromoRow({ id: 'promo-a', name: 'Weekend', value: 15 }),
          buildPromoRow({
            id: 'promo-specific',
            scope_type: 'specific',
            promo_scope: [{ service_id: 'service-1', package_id: null }],
          }),
        ],
        error: null,
      }
    );

    const options = await listMiscSaleOptions('branch-makati');

    expect(options).toEqual({
      discounts: [
        {
          id: 'discount-1',
          name: 'Misc Sale Discount',
          discount_type: 'Percentage',
          value: 10,
          is_mandated: false,
        },
      ],
      promos: [
        {
          id: 'promo-a',
          name: 'Weekend',
          discount_type: 'Percentage',
          value: 15,
          end_date: null,
        },
      ],
    });
  });
});
