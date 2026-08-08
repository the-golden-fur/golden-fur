import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as bookingApi from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { PaymentsQueuePage } from './PaymentsQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
  startBooking: vi.fn(),
  completeBooking: vi.fn(),
  advancePaymentStage: vi.fn(),
  overridePaymentStage: vi.fn(),
  overrideBookingStatus: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

function buildViewer(
  role: StaffRole,
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
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
    ...overrides,
  };
}

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-12345678',
    pet_id: 'pet-12345678',
    branch_id: 'branch-makati',
    created_by_staff_id: 'staff-1',
    service_category: 'Grooming',
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-2',
    status: 'Completed',
    payment_stage: 'Unpaid',
    started_at: null,
    completed_at: null,
    paid_at: null,
    hotel_preferences: null,
    total_price: 500,
    downpayment_amount: null,
    payment_method: 'Cash',
    payment_confirmed: false,
    selected_discount_id: null,
    selected_promo_id: null,
    discount_amount: 0,
    promo_amount: 0,
    special_instructions: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    pending_reschedule_fee_amount: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
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
      { initialEntries: ['/staff/billing/payments-queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/billing/payments-queue',
            element: createElement(PaymentsQueuePage),
          })
        )
      )
    )
  );
}

describe('PaymentsQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [
        { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
      ],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking()],
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: {
        id: 'pet-12345678',
        customer_id: 'cust-12345678',
        name: 'Buddy',
        pet_type: 'Dog',
        breed_id: 'breed-1',
        photo_url: null,
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'M',
        coat_type: 'LC',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: {
        id: 'cust-12345678',
        full_name: 'Jane Doe',
        contact_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        account_email: 'jane@example.com',
        primary_auth_provider: 'email',
        facebook_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
  });

  it('loads the queue scoped to the viewer\'s own branch by default', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(bookingApi.listBookings).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ branchId: 'branch-makati' })
      )
    );
    expect(await screen.findByText(/Buddy/)).toBeInTheDocument();
  });

  it('the branch filter is shown only for a Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('payment_stage: shows Mark as Paid for an Unpaid booking, prompts via modal, and advances via "Normal onsite payment"', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed', payment_stage: 'Unpaid' })],
      error: null,
    });
    vi.mocked(bookingApi.advancePaymentStage).mockResolvedValue({
      data: buildBooking({ status: 'Completed', payment_stage: 'Paid' }),
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Mark as Paid')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Mark as Paid'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText('Normal onsite payment'));

    await waitFor(() =>
      expect(bookingApi.advancePaymentStage).toHaveBeenCalledWith(
        'booking-1',
        'token',
        'onsite'
      )
    );
    const row = screen.getByRole('listitem');
    expect(await within(row).findByText('Payment: Paid')).toBeInTheDocument();
  });

  it('payment_stage: a Paid in Advance booking advances straight to Paid with one click, no modal', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({ status: 'Completed', payment_stage: 'Paid in Advance' }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.advancePaymentStage).mockResolvedValue({
      data: buildBooking({ status: 'Completed', payment_stage: 'Paid' }),
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Mark as Paid')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Mark as Paid'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(bookingApi.advancePaymentStage).toHaveBeenCalledWith(
        'booking-1',
        'token',
        undefined
      )
    );
  });

  it('a fully Paid booking offers no payment controls', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed', payment_stage: 'Paid' })],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
  });

  it('Admin/Superadmin see a Payment status-override dropdown instead of Mark as Paid', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed', payment_stage: 'Unpaid' })],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Payment')).toBeInTheDocument();
  });

  it('Misc-category bookings show Start/Complete since they have no dedicated queue of their own', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          service_category: 'Misc',
          status: 'Pending',
          payment_stage: 'Paid',
        }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.startBooking).mockResolvedValue({
      data: buildBooking({
        service_category: 'Misc',
        status: 'In Progress',
        payment_stage: 'Paid',
      }),
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument());
    await user.click(screen.getByText('Start'));

    await waitFor(() =>
      expect(bookingApi.startBooking).toHaveBeenCalledWith('booking-1', 'token')
    );
  });

  it('non-Misc bookings never show Start/Complete, even for a role that could otherwise advance them', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          service_category: 'Hotel',
          status: 'Pending',
          payment_stage: 'Paid',
        }),
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
  });

  it('"View details" navigates to the booking details page', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('View details')).toBeInTheDocument()
    );
    await user.click(screen.getByText('View details'));

    expect(navigateMock).toHaveBeenCalledWith('/staff/bookings/booking-1');
  });
});
