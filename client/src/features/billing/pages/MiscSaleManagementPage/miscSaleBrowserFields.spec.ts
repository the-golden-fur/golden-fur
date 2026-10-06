import { describe, expect, it } from 'vitest';
import {
  applyMiscSaleFilters,
  buildMiscSaleFilterFields,
  buildMiscSaleGroupByAxes,
  deriveMiscSaleSortKey,
  matchesMiscSaleQuery,
  MISC_SALE_COMPARATORS,
} from './miscSaleBrowserFields';
import type { Transaction } from '../../billing.types';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    booking_id: null,
    booking_group_id: null,
    customer_id: 'customer-1',
    branch_id: 'branch-1',
    transaction_type: 'miscellaneous_sale',
    payment_method: 'Cash',
    bank_name: null,
    payment_status: 'Fully Paid',
    subtotal_amount: 100,
    discount_amount: 0,
    promo_amount: 0,
    credit_applied_amount: 0,
    total_amount: 100,
    payment_reference: null,
    misc_sale_description: 'Dog food',
    processed_by_staff_id: 'staff-1',
    payment_choice: null,
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildMiscSaleFilterFields', () => {
  it('offers payment method, status, date, and customer fields', () => {
    const fields = buildMiscSaleFilterFields([
      { id: 'customer-1', full_name: 'Ada Lovelace' },
    ]);
    expect(fields.map((f) => f.id)).toEqual([
      'paymentMethod',
      'status',
      'date',
      'customer',
    ]);

    const customerField = fields.find((f) => f.id === 'customer');
    if (customerField?.type === 'async-select') {
      expect(customerField.options).toEqual([
        { value: 'customer-1', label: 'Ada Lovelace' },
      ]);
    }
  });
});

describe('applyMiscSaleFilters', () => {
  const items = [
    buildTransaction({ id: '1', payment_method: 'Cash' }),
    buildTransaction({ id: '2', payment_method: 'GCash' }),
  ];

  it('narrows by payment method', () => {
    const tiles: FilterTile[] = [{ fieldId: 'paymentMethod', value: 'GCash' }];
    expect(applyMiscSaleFilters(items, tiles).map((i) => i.id)).toEqual(['2']);
  });

  it('narrows by customer', () => {
    const withCustomers = [
      buildTransaction({ id: '1', customer_id: 'cust-a' }),
      buildTransaction({ id: '2', customer_id: 'cust-b' }),
    ];
    const tiles: FilterTile[] = [{ fieldId: 'customer', value: 'cust-b' }];
    expect(applyMiscSaleFilters(withCustomers, tiles).map((i) => i.id)).toEqual(
      ['2']
    );
  });

  it('narrows by a custom date range', () => {
    const dated = [
      buildTransaction({ id: '1', created_at: '2026-09-01T00:00:00.000Z' }),
      buildTransaction({ id: '2', created_at: '2026-09-20T00:00:00.000Z' }),
    ];
    const tiles: FilterTile[] = [
      {
        fieldId: 'date',
        value: { preset: 'custom', from: '2026-09-10', to: '2026-09-30' },
      },
    ];
    expect(applyMiscSaleFilters(dated, tiles).map((i) => i.id)).toEqual(['2']);
  });
});

describe('matchesMiscSaleQuery', () => {
  it('matches on description, payment method, or status', () => {
    const item = buildTransaction({
      misc_sale_description: 'Leash',
      payment_method: 'GCash',
      payment_status: 'Fully Paid',
    });
    expect(matchesMiscSaleQuery(item, 'leash')).toBe(true);
    expect(matchesMiscSaleQuery(item, 'gcash')).toBe(true);
    expect(matchesMiscSaleQuery(item, 'fully paid')).toBe(true);
    expect(matchesMiscSaleQuery(item, 'grooming')).toBe(false);
  });
});

describe('deriveMiscSaleSortKey + MISC_SALE_COMPARATORS', () => {
  it('defaults to newest', () => {
    expect(deriveMiscSaleSortKey(null)).toBe('newest');
  });

  it('sorts by amount low to high', () => {
    const items = [
      buildTransaction({ id: '1', total_amount: 500 }),
      buildTransaction({ id: '2', total_amount: 50 }),
    ];
    expect(
      [...items].sort(MISC_SALE_COMPARATORS['amount-low']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('buildMiscSaleGroupByAxes', () => {
  it('offers Status and Payment method axes', () => {
    const axes = buildMiscSaleGroupByAxes();
    expect(axes.map((a) => a.id)).toEqual(['status', 'paymentMethod']);
    expect(axes[0].columns).toEqual([
      'Pending',
      'Partially Paid',
      'Fully Paid',
    ]);
  });
});
