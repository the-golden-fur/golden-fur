import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '../reports.types';
import { payableBalances } from './payableBalances';

function record(over: Partial<TransactionRecord>): TransactionRecord {
  return {
    id: 'txn',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-1',
    transaction_type: 'booking_payment',
    payment_method: 'GCash',
    payment_status: 'Fully Paid',
    payment_choice: 'downpayment',
    total_amount: 500,
    misc_sale_description: null,
    created_at: '2026-09-01T00:00:00.000Z',
    bookings: {
      pet_id: 'pet-1',
      service_category: 'Grooming',
      payment_status: 'Partially Paid',
      total_price: 1200,
      discount_amount: 0,
      promo_amount: 0,
    },
    ...over,
  };
}

describe('payableBalances', () => {
  it('reports the remaining balance of a partly-paid booking with no pending charge', () => {
    const result = payableBalances([record({})]);

    expect(result).toEqual([
      { bookingId: 'booking-1', serviceCategory: 'Grooming', remaining: 700 },
    ]);
  });

  it('nets a booking-time discount/promo out of the remaining figure', () => {
    const result = payableBalances([
      record({
        bookings: {
          pet_id: 'pet-1',
          service_category: 'Hotel',
          payment_status: 'Partially Paid',
          total_price: 1200,
          discount_amount: 200,
          promo_amount: 100,
        },
      }),
    ]);

    // net 900 - 500 settled = 400
    expect(result[0]?.remaining).toBe(400);
  });

  it('excludes a booking that already has a pending charge', () => {
    const result = payableBalances([
      record({ id: 'a' }),
      record({ id: 'b', payment_status: 'Pending', total_amount: 200 }),
    ]);

    expect(result).toEqual([]);
  });

  it('excludes bookings that are not Partially Paid', () => {
    const result = payableBalances([
      record({
        bookings: {
          pet_id: 'pet-1',
          service_category: 'Grooming',
          payment_status: 'Fully Paid',
          total_price: 1200,
          discount_amount: 0,
          promo_amount: 0,
        },
      }),
    ]);

    expect(result).toEqual([]);
  });

  it('ignores miscellaneous sales', () => {
    const result = payableBalances([
      record({
        transaction_type: 'miscellaneous_sale',
        booking_id: null,
        bookings: null,
      }),
    ]);

    expect(result).toEqual([]);
  });
});
