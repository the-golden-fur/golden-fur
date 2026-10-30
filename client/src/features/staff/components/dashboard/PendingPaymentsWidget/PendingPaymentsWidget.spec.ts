import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as reportsApi from '../../../../reports/api/reports.api';
import type { TransactionRecord } from '../../../../reports/reports.types';
import { PendingPaymentsWidget } from './PendingPaymentsWidget';

vi.mock('../../../../reports/api/reports.api', () => ({
  getTransactionHistory: vi.fn(),
}));

function txn(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    booking_group_id: null,
    customer_id: 'cust-1',
    customer_name: 'Ada Lovelace',
    branch_id: 'branch-makati',
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Pending',
    payment_choice: 'full',
    total_amount: 500,
    misc_sale_description: null,
    created_at: '2026-10-30T02:00:00.000Z',
    bookings: { pet_id: 'pet-1', service_category: 'Grooming' },
    ...overrides,
  } as TransactionRecord;
}

function renderWidget() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(PendingPaymentsWidget, { accessToken: 'token' })
    )
  );
}

describe('PendingPaymentsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts and totals the payable pending transactions, naming the oldest', async () => {
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [
        txn({ id: 'a', total_amount: 500 }),
        txn({
          id: 'b',
          customer_name: 'Grace Hopper',
          total_amount: 1200,
          created_at: '2026-10-29T02:00:00.000Z',
        }),
        // Already paid - not counted.
        txn({ id: 'c', payment_status: 'Fully Paid', total_amount: 900 }),
        // A cancelled booking's charge can't be paid - not counted.
        txn({
          id: 'd',
          total_amount: 300,
          bookings: {
            pet_id: 'pet-1',
            service_category: 'Hotel',
            status: 'Cancelled',
          } as TransactionRecord['bookings'],
        }),
      ],
      error: null,
    });

    renderWidget();

    expect(await screen.findByText(/^2 due ·/)).toHaveTextContent('1,700.00');
    expect(screen.getByText(/^Oldest: Grace Hopper/)).toHaveTextContent(
      '1,200.00'
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/staff/reports/transaction-history'
    );
  });

  it('says so when nothing is waiting', async () => {
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [txn({ payment_status: 'Fully Paid' })],
      error: null,
    });

    renderWidget();

    expect(await screen.findByText('No payments waiting.')).toBeInTheDocument();
  });
});
