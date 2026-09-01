import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CreditBalanceContext } from '../../../credits/providers/CreditBalanceContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { CustomerBookingsPage } from './CustomerBookingsPage';

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomerPets: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  listBookings: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  payForBooking: vi.fn(),
  getOnlinePaymentsStatus: vi.fn().mockResolvedValue({
    data: { online_payments_enabled: true },
    error: null,
  }),
}));

// SlotPicker/StaffPickerList have their own dedicated specs; stub them here
// so this page's tests exercise its own list/action-panel behavior only.
vi.mock('../../components/SlotPicker/SlotPicker', () => ({
  SlotPicker: () => createElement('div', { 'data-testid': 'slot-picker' }),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: () =>
    createElement('div', { 'data-testid': 'staff-picker' }),
}));

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Grooming',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-1',
    status: 'Pending',
    total_price: 500,
    downpayment_amount: null,
    payment_status: 'Pending',
    payment_method: 'Cash',
    payment_confirmed: false,
    special_instructions: null,
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

const refreshCreditBalance = vi.fn();

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/portal/bookings'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          CreditBalanceContext.Provider,
          {
            value: {
              balances: [],
              total: 0,
              isLoading: false,
              refresh: refreshCreditBalance,
            },
          },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/portal/bookings',
              element: createElement(CustomerBookingsPage),
            })
          )
        )
      )
    )
  );
}

describe('CustomerBookingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
    vi.mocked(bookingApi.getOnlinePaymentsStatus).mockResolvedValue({
      data: { online_payments_enabled: true },
      error: null,
    });
  });

  /** Reschedule/Cancel live behind the row's "..." menu now. */
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('button', { name: /options for this/i })
    );
  }

  it("AC-1: shows only the caller's bookings with a status badge", async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();

    // A paid / no-down-payment Pending booking reads as "Confirmed" in the
    // shared confirmation vocabulary.
    await waitFor(() =>
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    );
    expect(bookingApi.listBookings).toHaveBeenCalledWith('token');
  });

  it('AC-5: cancel requires an explicit confirm step before calling the API', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();

    await openMenu(user);
    await user.click(screen.getByText('Cancel'));

    // An explicit modal dialog appears; the API must not be called yet.
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/are you sure you want to cancel/i)
    ).toBeInTheDocument();
    expect(bookingApi.cancelBooking).not.toHaveBeenCalled();

    // Dismissing with "Keep booking" closes the dialog and still never calls
    // the API - so a stray click on the Cancel menu item is harmless.
    await user.click(within(dialog).getByText('Keep booking'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bookingApi.cancelBooking).not.toHaveBeenCalled();

    await openMenu(user);
    await user.click(screen.getByText('Cancel'));

    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: true,
        policy_violation: false,
        credit_issued: false,
      },
      error: null,
    });

    await user.click(screen.getByText('Yes, cancel'));

    await waitFor(() =>
      expect(bookingApi.cancelBooking).toHaveBeenCalledWith(
        'booking-1',
        'token',
        {}
      )
    );
  });

  it('AC-4: surfaces a policy_violation flag from a cancellation to the customer', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });
    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: false,
        policy_violation: true,
        credit_issued: false,
      },
      error: null,
    });

    renderPage();

    await openMenu(user);
    await user.click(screen.getByText('Cancel'));
    await user.click(screen.getByText('Yes, cancel'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /did not meet the required notice period, so any payment was forfeited/i
      )
    );
  });

  it('discloses the non-refundable-becomes-credit policy and reports the credit conversion', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          status: 'Pending',
          payment_status: 'Partially Paid',
          downpayment_amount: 200,
        }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: true,
        policy_violation: false,
        credit_issued: true,
      },
      error: null,
    });

    renderPage();

    await openMenu(user);
    await user.click(screen.getByText('Cancel'));

    // The dialog discloses the policy before the customer confirms.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/won't be refunded/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/account credit/i)).toBeInTheDocument();

    await user.click(within(dialog).getByText('Yes, cancel'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /converted into account credit at Makati for a future visit/i
      )
    );

    // The navbar credit pill / portal home is refreshed after a credit-issuing
    // cancellation so the new balance shows without a reload.
    expect(refreshCreditBalance).toHaveBeenCalled();
  });

  it('does not show reschedule/cancel actions for a Cancelled booking', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Cancelled' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    );
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('never shows a Pay action - paying moved to the Transaction History page', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending', payment_status: 'Pending' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    );
    expect(screen.queryByText('Pay')).not.toBeInTheDocument();
  });
});
