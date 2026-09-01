import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as reportsApi from '../../../reports/api/reports.api';
import * as billingApi from '../../api/billing.api';
import type { TransactionRecord } from '../../../reports/reports.types';
import { TransactionsPage } from './TransactionsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../reports/api/reports.api', () => ({
  getTransactionHistory: vi.fn(),
}));

vi.mock('../../api/billing.api', () => ({
  recordTransactionPayment: vi.fn(),
  addBookingPayment: vi.fn(),
}));

function buildTransaction(
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
    created_at: '2026-08-01T00:00:00.000Z',
    bookings: { pet_id: 'pet-1', service_category: 'Grooming' },
    ...overrides,
  };
}

function renderPage(role: string | null) {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: role
      ? [{ id: 'staff-1', role } as never]
      : [{ id: 'staff-1', role: null } as never],
    error: null,
  });

  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/billing/transactions'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/billing/transactions',
            element: createElement(TransactionsPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('p', null, 'Settings page'),
          })
        )
      )
    )
  );
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [buildTransaction()],
      error: null,
    });
  });

  it('redirects a non-money-handling role to settings', async () => {
    renderPage('Groomer');

    await waitFor(() =>
      expect(screen.getByText('Settings page')).toBeInTheDocument()
    );
  });

  it('groups booking-payment transactions and offers Record payment on a pending row', async () => {
    renderPage('Cashier');

    await waitFor(() =>
      expect(screen.getByText('Grooming booking')).toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: 'Record payment' })
    ).toBeInTheDocument();
  });

  it('records a payment with the chosen method against the pending transaction', async () => {
    const user = userEvent.setup();
    vi.mocked(billingApi.recordTransactionPayment).mockResolvedValue({
      data: {
        transaction: { id: 'txn-1' } as never,
        booking: null,
        changeAmount: null,
      },
      error: null,
    });

    renderPage('Cashier');

    await user.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Method'),
      'Bank Transfer'
    );
    await user.selectOptions(within(dialog).getByLabelText('Bank'), 'BPI');
    await user.type(
      within(dialog).getByLabelText('Reference number'),
      'REF-123'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record payment' })
    );

    await waitFor(() =>
      expect(billingApi.recordTransactionPayment).toHaveBeenCalledWith(
        'txn-1',
        expect.objectContaining({
          payment_method: 'Bank Transfer',
          bank_name: 'BPI',
          payment_reference: 'REF-123',
        }),
        'token'
      )
    );
  });

  it('adds a balance payment to a fully-settled booking group', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [buildTransaction({ payment_status: 'Fully Paid' })],
      error: null,
    });
    vi.mocked(billingApi.addBookingPayment).mockResolvedValue({
      data: { transaction: { id: 'txn-2' } as never },
      error: null,
    });

    renderPage('Receptionist');

    // A fully-settled booking group is hidden until "show settled" is on.
    await user.click(
      await screen.findByLabelText(/show fully-settled bookings/i)
    );
    await user.click(
      await screen.findByRole('button', { name: 'Add a payment' })
    );
    await user.type(screen.getByPlaceholderText('Amount'), '150');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(billingApi.addBookingPayment).toHaveBeenCalledWith(
        'booking-1',
        150,
        'token'
      )
    );
  });
});
