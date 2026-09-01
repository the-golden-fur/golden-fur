import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as reportsApi from '../../api/reports.api';
import * as billingApi from '../../../billing/api/billing.api';
import * as bookingApi from '../../../booking/api/booking.api';
import type { TransactionRecord } from '../../reports.types';
import { CustomerTransactionHistoryPage } from './CustomerTransactionHistoryPage';

vi.mock('../../api/reports.api', () => ({ getMyTransactionHistory: vi.fn() }));
vi.mock('../../../billing/api/billing.api', () => ({
  payTransactionWithCredit: vi.fn(),
}));
vi.mock('../../../booking/api/booking.api', () => ({ payForBooking: vi.fn() }));

function buildRecord(
  overrides: Partial<TransactionRecord> = {}
): TransactionRecord {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-1',
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Pending',
    payment_choice: 'full',
    total_amount: 500,
    misc_sale_description: null,
    created_at: '2026-09-01T00:00:00.000Z',
    bookings: { pet_id: 'pet-1', service_category: 'Grooming' },
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'c@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(CustomerTransactionHistoryPage)
    )
  );
}

describe('CustomerTransactionHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.getMyTransactionHistory).mockResolvedValue({
      data: [buildRecord()],
      error: null,
    });
  });

  it('shows "—" for the method of a still-Pending charge, not the placeholder', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('PHP 500.00')).toBeInTheDocument()
    );
    const row = screen.getByText('PHP 500.00').closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('Cash')).not.toBeInTheDocument();
  });

  it('pays a Pending charge from account credit', async () => {
    const user = userEvent.setup();
    vi.mocked(billingApi.payTransactionWithCredit).mockResolvedValue({
      data: { transaction: {} as never, booking: null },
      error: null,
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay' }));
    const dialog = screen.getByRole('dialog');
    // 'Account credit' is the default mode.
    await user.click(
      within(dialog).getByRole('button', { name: 'Pay with credit' })
    );

    await waitFor(() =>
      expect(billingApi.payTransactionWithCredit).toHaveBeenCalledWith(
        'txn-1',
        'token'
      )
    );
  });

  it('routes a GCash choice through payForBooking', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.payForBooking).mockResolvedValue({
      data: { checkoutUrl: 'https://paymongo.test/x' },
      error: null,
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('GCash'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Continue to payment' })
    );

    await waitFor(() =>
      expect(bookingApi.payForBooking).toHaveBeenCalledWith(
        'booking-1',
        'token',
        { payment_method: 'GCash', pay_in_full: true }
      )
    );
  });

  it('shows no Pay button on a settled transaction', async () => {
    vi.mocked(reportsApi.getMyTransactionHistory).mockResolvedValue({
      data: [
        buildRecord({ payment_status: 'Fully Paid', payment_method: 'GCash' }),
      ],
      error: null,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('PHP 500.00')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Pay' })
    ).not.toBeInTheDocument();
  });
});
