import { describe, expect, it } from 'vitest';
import {
  receiptPropsFor,
  receiptReference,
  type ReceiptTransaction,
} from './transactionReceipt';

const BRANCH = {
  id: 'branch-1',
  name: 'Main Branch',
  address: '12 Rizal St.',
  contact_number: '0917 000 0000',
};

function transaction(
  overrides: Partial<ReceiptTransaction> = {}
): ReceiptTransaction {
  return {
    id: 'abcd1234-ef56-7890-abcd-ef1234567890',
    created_at: '2026-10-01T05:00:00.000Z',
    customer_name: 'Maria Santos',
    transaction_type: 'booking_payment',
    misc_sale_description: null,
    payment_choice: 'downpayment',
    payment_method: 'GCash',
    payment_status: 'Partially Paid',
    total_amount: 500,
    transaction_line_items: [
      {
        description: 'Overdue hours',
        quantity: 2,
        unit_price: 50,
        line_total: 100,
      },
    ],
    bookings: { service_category: 'Grooming', pets: { name: 'Buddy' } },
    ...overrides,
  };
}

describe('receiptPropsFor', () => {
  it('builds a paid receipt with the branch letterhead and payment details', () => {
    expect(receiptPropsFor(transaction(), BRANCH)).toEqual({
      branchName: 'Main Branch',
      branchAddress: '12 Rizal St.',
      branchContactNumber: '0917 000 0000',
      title: 'Receipt',
      reference: 'ABCD1234EF56',
      date: '2026-10-01T05:00:00.000Z',
      customerName: 'Maria Santos',
      petName: 'Buddy',
      description: 'Booking payment',
      service: 'Grooming',
      paymentLabel: 'Down payment',
      method: 'GCash',
      statusLabel: 'Partially Paid',
      amount: 500,
      lines: undefined,
    });
  });

  it('itemizes only a Daycare bill', () => {
    const daycare = transaction({
      bookings: { service_category: 'Daycare', pets: { name: 'Buddy' } },
    });

    expect(receiptPropsFor(daycare, BRANCH).lines).toHaveLength(1);
  });

  it('prints an unpaid charge as Payment Due with no method', () => {
    const props = receiptPropsFor(
      transaction({ payment_status: 'Pending' }),
      undefined
    );

    expect(props.title).toBe('Payment Due');
    expect(props.method).toBeNull();
    expect(props.branchName).toBeNull();
  });
});

describe('receiptReference', () => {
  it('is the first 12 hex characters, upper-cased', () => {
    expect(receiptReference('abcd1234-ef56-7890')).toBe('ABCD1234EF56');
  });
});
