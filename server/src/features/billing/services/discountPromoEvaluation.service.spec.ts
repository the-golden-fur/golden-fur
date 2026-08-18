import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluatePromos } from './discountPromoEvaluation.service.ts';
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
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
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
    start_date: null,
    end_date: null,
    discount_type: 'Percentage',
    value: 10,
    scope_type: 'all_services',
    promo_scope: [],
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
