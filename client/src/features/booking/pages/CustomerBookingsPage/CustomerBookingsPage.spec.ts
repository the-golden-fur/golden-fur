import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
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
          Routes,
          null,
          createElement(Route, {
            path: '/portal/bookings',
            element: createElement(CustomerBookingsPage),
          })
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

    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    await user.click(screen.getByText('Cancel'));

    // The confirm panel appears, but the API must not be called yet.
    expect(
      screen.getByText(/are you sure you want to cancel/i)
    ).toBeInTheDocument();
    expect(bookingApi.cancelBooking).not.toHaveBeenCalled();

    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: true,
        policy_violation: false,
      },
      error: null,
    });

    await user.click(screen.getByText('Yes, cancel booking'));

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
      },
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    await user.click(screen.getByText('Cancel'));
    await user.click(screen.getByText('Yes, cancel booking'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /without meeting the configured notice period/i
      )
    );
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

  it('does not show a Pay button once payment_stage is Paid', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending', payment_stage: 'Paid' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    );
    expect(screen.queryByText('Pay')).not.toBeInTheDocument();
  });

  it('disables the Pay button with an explanatory tooltip when online payments are off for the branch', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending', payment_stage: 'Unpaid' })],
      error: null,
    });
    vi.mocked(bookingApi.getOnlinePaymentsStatus).mockResolvedValue({
      data: { online_payments_enabled: false },
      error: null,
    });

    renderPage();

    const payButton = await screen.findByText('Pay');
    await waitFor(() => expect(payButton).toBeDisabled());
    expect(payButton).toHaveAttribute(
      'title',
      expect.stringContaining('unavailable')
    );
  });

  it('pays the downpayment amount when that choice is selected, and shows the PayMongo failure message on error', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          status: 'Pending',
          payment_stage: 'Unpaid',
          downpayment_required: true,
          downpayment_amount: 250,
          total_price: 500,
        }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.payForBooking).mockResolvedValue({
      data: null,
      error:
        'Payment service is currently unavailable - please try again later',
    });

    renderPage();

    await user.click(await screen.findByText('Pay'));
    await user.click(screen.getByText(/Pay downpayment only/));
    await user.click(screen.getByText('Continue to payment'));

    await waitFor(() =>
      expect(bookingApi.payForBooking).toHaveBeenCalledWith(
        'booking-1',
        'token',
        { payment_method: 'GCash', pay_in_full: false }
      )
    );
    expect(
      await screen.findByText(/payment service is currently unavailable/i)
    ).toBeInTheDocument();
  });
});
