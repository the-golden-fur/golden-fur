import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMiscSalePreview,
  createMiscSale,
  deleteMiscSale,
  listMiscSales,
} from './miscSale.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  evaluateMiscSaleDiscounts,
  evaluateMiscSalePromos,
} from './discountPromoEvaluation.service.ts';
import { applyCredit, getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import type { CreateMiscSaleInput } from '../modules/validators/billing.validator.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('./discountPromoEvaluation.service.ts', () => ({
  evaluateMiscSaleDiscounts: vi.fn(),
  evaluateMiscSalePromos: vi.fn(),
}));
vi.mock('./creditStub.service.ts', () => ({
  applyCredit: vi.fn(),
  getAvailableCredit: vi.fn(),
}));
vi.mock('./paymentMethod.service.ts', () => ({
  resolvePaymentConfirmation: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** One shared supabase.from mock across the file: product_catalog rows are
 * looked up by id (a real Map, since a cart can resolve several in
 * parallel); every other table's calls are served off its own FIFO queue,
 * consumed in call order regardless of whether the chain ends in
 * .maybeSingle() or is bare-awaited (mirrors checkoutAggregation.service
 * .spec.ts's own convention for this codebase). */
function mockSupabase(options: {
  productCatalog?: Record<string, { name: string; price: number } | null>;
  queues?: Record<string, QueryResult[]>;
}) {
  const queues: Record<string, QueryResult[]> = {};
  for (const [table, results] of Object.entries(options.queues ?? {})) {
    queues[table] = [...results];
  }
  const inserts: Array<{ table: string; arg: unknown }> = [];
  const updates: Array<{ table: string; arg: unknown }> = [];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    let lastEqId: string | undefined;

    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: string) => {
      if (column === 'id') lastEqId = value;
      return builder;
    });
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn((arg: unknown) => {
      inserts.push({ table, arg });
      return builder;
    });
    builder.update = vi.fn((arg: unknown) => {
      updates.push({ table, arg });
      return builder;
    });
    builder.delete = vi.fn(() => builder);

    const next = (): QueryResult => {
      if (table === 'product_catalog' && options.productCatalog) {
        const product = options.productCatalog[lastEqId as string];
        return product === undefined
          ? { data: null, error: null }
          : { data: product, error: null };
      }
      const queue = queues[table];
      return queue?.shift() ?? { data: null, error: null };
    };

    builder.maybeSingle = vi.fn(() => Promise.resolve(next()));
    builder.then = (resolve: (_result: QueryResult) => unknown) =>
      resolve(next());

    return builder;
  }) as never);

  return { inserts, updates };
}

const CATALOG_ITEM = { name: 'Dog Leash', price: 200 };

describe('buildMiscSalePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateMiscSaleDiscounts).mockResolvedValue([]);
    vi.mocked(evaluateMiscSalePromos).mockResolvedValue([]);
  });

  it('resolves a catalog item at its current price and a freetext item at its given amount, then sums them for subtotal', async () => {
    mockSupabase({ productCatalog: { 'catalog-1': CATALOG_ITEM } });

    const preview = await buildMiscSalePreview({
      branchId: 'branch-1',
      items: [
        { product_catalog_id: 'catalog-1', quantity: 2 },
        { description: 'Cat toy', amount: 80 },
      ],
      paymentMethod: 'Cash',
      discountIds: [],
      promoIds: [],
    });

    expect(preview.itemLines).toEqual([
      {
        line_item_type: 'misc_sale_item',
        reference_id: 'catalog-1',
        description: 'Dog Leash',
        quantity: 2,
        unit_price: 200,
        line_total: 400,
      },
      {
        line_item_type: 'misc_sale_item',
        reference_id: null,
        description: 'Cat toy',
        quantity: 1,
        unit_price: 80,
        line_total: 80,
      },
    ]);
    expect(preview.subtotal).toBe(480);
    expect(preview.preCreditTotal).toBe(480);
  });

  it('throws 404 when a product_catalog_id does not resolve to a row', async () => {
    mockSupabase({ productCatalog: { 'catalog-1': null } });

    await expect(
      buildMiscSalePreview({
        branchId: 'branch-1',
        items: [{ product_catalog_id: 'catalog-1', quantity: 1 }],
        paymentMethod: 'Cash',
        discountIds: [],
        promoIds: [],
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('folds discount and promo lines into discountAmount/promoAmount/preCreditTotal', async () => {
    mockSupabase({});
    vi.mocked(evaluateMiscSaleDiscounts).mockResolvedValue([
      {
        line_item_type: 'discount',
        reference_id: 'discount-1',
        description: 'Senior Citizen Discount',
        quantity: 1,
        unit_price: -20,
        line_total: -20,
      },
    ]);
    vi.mocked(evaluateMiscSalePromos).mockResolvedValue([
      {
        promoId: 'promo-1',
        couponId: null,
        line: {
          line_item_type: 'promo',
          reference_id: 'promo-1',
          description: 'Weekend Promo',
          quantity: 1,
          unit_price: -10,
          line_total: -10,
        },
      },
    ]);

    const preview = await buildMiscSalePreview({
      branchId: 'branch-1',
      items: [{ description: 'Cat toy', amount: 100 }],
      paymentMethod: 'Cash',
      discountIds: ['discount-1'],
      promoIds: ['promo-1'],
    });

    expect(preview.subtotal).toBe(100);
    expect(preview.discountAmount).toBe(20);
    expect(preview.promoAmount).toBe(10);
    expect(preview.preCreditTotal).toBe(70);
    expect(evaluateMiscSaleDiscounts).toHaveBeenCalledWith({
      branchId: 'branch-1',
      paymentMethod: 'Cash',
      discountIds: ['discount-1'],
      subtotal: 100,
    });
    expect(evaluateMiscSalePromos).toHaveBeenCalledWith({
      branchId: 'branch-1',
      promoIds: ['promo-1'],
      subtotal: 100,
    });
  });
});

describe('createMiscSale', () => {
  const BASE_INPUT: CreateMiscSaleInput = {
    customer_id: 'customer-1',
    items: [{ description: 'Cat toy', amount: 100 }],
    discount_ids: [],
    promo_ids: [],
    payment_method: 'Cash',
    cash_tendered: 100,
    credit_to_apply: 30,
  } as CreateMiscSaleInput;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateMiscSaleDiscounts).mockResolvedValue([]);
    vi.mocked(evaluateMiscSalePromos).mockResolvedValue([]);
    vi.mocked(resolvePaymentConfirmation).mockReturnValue({
      paymentStatus: 'Fully Paid',
      changeAmount: 0,
    });
  });

  it('caps the requested credit at MIN(requested, available, preCreditTotal) and stores the resulting total', async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue(20);
    vi.mocked(applyCredit).mockResolvedValue({ appliedAmount: 20 });

    const { inserts } = mockSupabase({
      queues: {
        transactions: [
          {
            data: { id: 'txn-1', payment_status: 'Fully Paid' },
            error: null,
          },
        ],
        transaction_line_items: [{ data: [], error: null }],
      },
    });

    await createMiscSale({
      requesterId: 'staff-1',
      branchId: 'branch-1',
      input: BASE_INPUT,
    });

    // requested 30, available only 20, preCreditTotal 100 - min is 20.
    expect(applyCredit).toHaveBeenCalledWith('customer-1', 'branch-1', 20);

    const transactionInsert = inserts.find((c) => c.table === 'transactions');
    expect(transactionInsert?.arg).toMatchObject({
      credit_applied_amount: 20,
      total_amount: 80,
      subtotal_amount: 100,
      discount_amount: 0,
      promo_amount: 0,
      misc_sale_description: 'Cat toy',
    });
  });

  it("payment_method 'Credit' redeems the whole sale from credit and records it Fully Paid", async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue(150);
    vi.mocked(applyCredit).mockResolvedValue({ appliedAmount: 100 });

    const { inserts } = mockSupabase({
      queues: {
        transactions: [
          { data: { id: 'txn-1', payment_status: 'Fully Paid' }, error: null },
        ],
        transaction_line_items: [{ data: [], error: null }],
      },
    });

    const result = await createMiscSale({
      requesterId: 'staff-1',
      branchId: 'branch-1',
      input: {
        ...BASE_INPUT,
        payment_method: 'Credit',
        cash_tendered: undefined,
        credit_to_apply: 0,
      } as CreateMiscSaleInput,
    });

    // The whole preCreditTotal, regardless of credit_to_apply.
    expect(applyCredit).toHaveBeenCalledWith('customer-1', 'branch-1', 100);
    expect(resolvePaymentConfirmation).not.toHaveBeenCalled();
    expect(result.changeAmount).toBeNull();

    const transactionInsert = inserts.find((c) => c.table === 'transactions');
    expect(transactionInsert?.arg).toMatchObject({
      payment_method: 'Credit',
      payment_status: 'Fully Paid',
      credit_applied_amount: 100,
      total_amount: 0,
    });
  });

  it("rejects payment_method 'Credit' without redeeming anything when the balance does not cover the sale", async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue(40);
    mockSupabase({});

    await expect(
      createMiscSale({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          ...BASE_INPUT,
          payment_method: 'Credit',
          cash_tendered: undefined,
        } as CreateMiscSaleInput,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(applyCredit).not.toHaveBeenCalled();
  });

  it('inserts one transaction_line_items row per item/discount/promo line', async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue(0);
    vi.mocked(applyCredit).mockResolvedValue({ appliedAmount: 0 });
    vi.mocked(evaluateMiscSaleDiscounts).mockResolvedValue([
      {
        line_item_type: 'discount',
        reference_id: 'discount-1',
        description: 'Senior Citizen Discount',
        quantity: 1,
        unit_price: -10,
        line_total: -10,
      },
    ]);

    const { inserts } = mockSupabase({
      queues: {
        transactions: [
          { data: { id: 'txn-1', payment_status: 'Fully Paid' }, error: null },
        ],
        transaction_line_items: [{ data: [], error: null }],
      },
    });

    await createMiscSale({
      requesterId: 'staff-1',
      branchId: 'branch-1',
      input: { ...BASE_INPUT, credit_to_apply: 0 },
    });

    const lineItemsInsert = inserts.find(
      (c) => c.table === 'transaction_line_items'
    );
    const rows = lineItemsInsert?.arg as Array<{ line_item_type: string }>;
    expect(rows.map((row) => row.line_item_type)).toEqual([
      'misc_sale_item',
      'discount',
    ]);
    expect(rows.every((row) => 'transaction_id' in row)).toBe(true);
  });

  it('throws when the transaction insert fails, without attempting the line-items insert', async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue(0);
    vi.mocked(applyCredit).mockResolvedValue({ appliedAmount: 0 });

    const { inserts } = mockSupabase({
      queues: {
        transactions: [{ data: null, error: { message: 'db down' } }],
      },
    });

    await expect(
      createMiscSale({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: { ...BASE_INPUT, credit_to_apply: 0 },
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(inserts.some((c) => c.table === 'transaction_line_items')).toBe(
      false
    );
  });
});

describe('listMiscSales', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns every misc sale when no branchId filter is given (Superadmin, all branches)', async () => {
    mockSupabase({
      queues: {
        transactions: [
          {
            data: [{ id: 'txn-1' }, { id: 'txn-2' }],
            error: null,
          },
        ],
      },
    });

    const sales = await listMiscSales();

    expect(sales).toHaveLength(2);
  });

  it('scopes results to branchId when one is given', async () => {
    mockSupabase({
      queues: {
        transactions: [{ data: [{ id: 'txn-1' }], error: null }],
      },
    });

    const sales = await listMiscSales('branch-1');

    expect(sales).toEqual([{ id: 'txn-1' }]);
  });
});

describe('deleteMiscSale', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 404 instead of deleting when the sale does not exist', async () => {
    mockSupabase({ queues: { transactions: [{ data: null, error: null }] } });

    await expect(deleteMiscSale('missing-id')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
