import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import * as reportsApi from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import { TransactionHistoryTable } from './TransactionHistoryTable';

vi.mock('../../../staff/api/staff.api', () => ({ listStaff: vi.fn() }));
vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
  listCustomerPets: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({ getTransactionHistory: vi.fn() }));

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'cashier',
    registered_email: 'staff@example.com',
    display_name: 'Front Desk',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function buildTransaction(
  overrides: Partial<TransactionRecord> = {}
): TransactionRecord {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-makati',
    transaction_type: 'booking_payment',
    payment_method: 'GCash',
    payment_status: 'Fully Paid',
    payment_choice: 'full',
    total_amount: 500,
    misc_sale_description: null,
    created_at: '2026-08-01T00:00:00.000Z',
    bookings: { pet_id: 'pet-1', service_category: 'Grooming' },
    ...overrides,
  };
}

function renderTable() {
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
      { initialEntries: ['/staff/reports/transaction-history'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/reports/transaction-history',
            element: createElement(TransactionHistoryTable),
          }),
          createElement(Route, {
            path: '/staff/bookings/:bookingId',
            element: 'Booking details',
          })
        )
      )
    )
  );
}

describe('TransactionHistoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(customerApi.listCustomers).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [buildTransaction()],
      error: null,
    });
  });

  it('passes the transaction-type and payment-choice filters to the API', async () => {
    renderTable();
    await screen.findByText('View booking');

    await userEvent.selectOptions(
      screen.getByLabelText('Transaction type'),
      'booking_payment'
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Payment'),
      'downpayment'
    );

    await waitFor(() =>
      expect(reportsApi.getTransactionHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({
          transactionType: 'booking_payment',
          paymentChoice: 'downpayment',
        }),
        'token'
      )
    );
  });

  it('links a booking-payment row to its booking and omits the link for a misc sale', async () => {
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [
        buildTransaction({ id: 'txn-1', booking_id: 'booking-9' }),
        buildTransaction({
          id: 'txn-2',
          booking_id: null,
          transaction_type: 'miscellaneous_sale',
          misc_sale_description: 'Leash',
          bookings: null,
          payment_choice: null,
        }),
      ],
      error: null,
    });

    renderTable();

    const link = await screen.findByRole('link', { name: 'View booking' });
    expect(link).toHaveAttribute('href', '/staff/bookings/booking-9');
    expect(screen.getAllByRole('link', { name: 'View booking' })).toHaveLength(
      1
    );
  });

  it('sorts rows by amount', async () => {
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [
        buildTransaction({ id: 'a', total_amount: 100 }),
        buildTransaction({ id: 'b', total_amount: 900 }),
      ],
      error: null,
    });

    renderTable();
    await screen.findByText('PHP 100.00');

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Date (newest)'),
      'amount-high'
    );

    const amounts = screen.getAllByText(/^PHP \d/).map((el) => el.textContent);
    expect(amounts[0]).toBe('PHP 900.00');
  });
});
