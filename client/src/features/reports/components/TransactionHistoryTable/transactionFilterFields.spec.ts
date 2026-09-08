import { describe, expect, it } from 'vitest';
import {
  COMPARATORS,
  buildStaffFilterFields,
  deriveServerParams,
  deriveSortKey,
  deriveStatusFilter,
} from './transactionFilterFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { TransactionRecord } from '../../reports.types';

describe('deriveServerParams', () => {
  it('maps customer / service / payment / transaction-type tiles to query params', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'customer', value: 'cust-1' },
      { fieldId: 'service', value: 'Grooming' },
      { fieldId: 'payment', value: 'downpayment' },
      { fieldId: 'txnType', value: 'booking_payment' },
    ];

    expect(deriveServerParams(tiles)).toEqual({
      customerId: 'cust-1',
      serviceCategory: 'Grooming',
      paymentChoice: 'downpayment',
      transactionType: 'booking_payment',
    });
  });

  it('resolves a preset date-range tile to date_from / date_to', () => {
    const tiles: FilterTile[] = [
      {
        fieldId: 'date',
        value: { preset: 'custom', from: '2026-09-01', to: '2026-09-30' },
      },
    ];

    expect(deriveServerParams(tiles)).toEqual({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
  });

  it('ignores an empty customer value and the client-only status tile', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'customer', value: '' },
      { fieldId: 'status', value: 'Pending' },
    ];

    expect(deriveServerParams(tiles)).toEqual({});
  });
});

describe('deriveStatusFilter', () => {
  it('returns the DB payment_status of the status tile, or null', () => {
    expect(
      deriveStatusFilter([{ fieldId: 'status', value: 'Fully Paid' }])
    ).toBe('Fully Paid');
    expect(
      deriveStatusFilter([{ fieldId: 'service', value: 'Hotel' }])
    ).toBeNull();
  });
});

describe('deriveSortKey', () => {
  it('maps a sort tile to the comparator key, defaulting to newest', () => {
    expect(deriveSortKey(null)).toBe('newest');
    expect(deriveSortKey({ fieldId: 'date', direction: 'asc' })).toBe('oldest');
    expect(deriveSortKey({ fieldId: 'amount', direction: 'desc' })).toBe(
      'amount-high'
    );
    expect(deriveSortKey({ fieldId: 'customer', direction: 'desc' })).toBe(
      'customer-za'
    );
  });
});

describe('COMPARATORS', () => {
  const base = (over: Partial<TransactionRecord>): TransactionRecord =>
    ({
      id: 'x',
      total_amount: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      customer_name: null,
      ...over,
    }) as TransactionRecord;

  it('sorts by amount high-to-low', () => {
    const rows = [base({ total_amount: 100 }), base({ total_amount: 900 })];
    expect(rows.sort(COMPARATORS['amount-high'])[0].total_amount).toBe(900);
  });

  it('sorts by customer name A-Z, nulls first', () => {
    const rows = [
      base({ customer_name: 'Zoe' }),
      base({ customer_name: 'Ada' }),
      base({ customer_name: null }),
    ];
    expect(
      rows.sort(COMPARATORS['customer-az']).map((r) => r.customer_name)
    ).toEqual([null, 'Ada', 'Zoe']);
  });
});

describe('buildStaffFilterFields', () => {
  it('disables the Pet field until a customer filter exists', () => {
    const without = buildStaffFilterFields({
      customers: [],
      pets: [],
      hasCustomerFilter: false,
    });
    const withCustomer = buildStaffFilterFields({
      customers: [],
      pets: [],
      hasCustomerFilter: true,
    });

    expect(without.find((f) => f.id === 'pet')?.disabled).toBe(true);
    expect(withCustomer.find((f) => f.id === 'pet')?.disabled).toBe(false);
  });
});
