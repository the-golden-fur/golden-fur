import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as billingApi from '../../api/billing.api';
import type { Transaction } from '../../billing.types';
import { BookingPaymentsPanel } from './BookingPaymentsPanel';

vi.mock('../../api/billing.api', () => ({ listBookingTransactions: vi.fn() }));

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-1',
    transaction_type: 'booking_payment',
    payment_method: 'GCash',
    bank_name: null,
    payment_status: 'Partially Paid',
    subtotal_amount: 250,
    discount_amount: 0,
    promo_amount: 0,
    credit_applied_amount: 0,
    total_amount: 250,
    payment_reference: 'src_abc',
    misc_sale_description: null,
    webhook_confirmed_at: null,
    processed_by_staff_id: null,
    payment_choice: 'downpayment',
    created_at: '2026-08-29T02:00:00.000Z',
    updated_at: '2026-08-29T02:00:00.000Z',
    ...overrides,
  };
}

function renderPanel() {
  return render(
    createElement(BookingPaymentsPanel, {
      bookingId: 'booking-1',
      accessToken: 'token',
    })
  );
}

describe('BookingPaymentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists each payment, labelling a down payment and its reference', async () => {
    vi.mocked(billingApi.listBookingTransactions).mockResolvedValue({
      data: [buildTransaction()],
      error: null,
    });

    renderPanel();

    expect(
      await screen.findByText('Payments for this booking')
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 250.00')).toBeInTheDocument();
    expect(
      screen.getByText(/Down payment · GCash · Partially Paid/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Ref src_abc/)).toBeInTheDocument();
    expect(billingApi.listBookingTransactions).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it('shows an empty state when nothing has been recorded', async () => {
    vi.mocked(billingApi.listBookingTransactions).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPanel();

    expect(
      await screen.findByText('No payments recorded yet for this booking.')
    ).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    vi.mocked(billingApi.listBookingTransactions).mockResolvedValue({
      data: null,
      error: 'nope',
    });

    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('nope');
  });
});
