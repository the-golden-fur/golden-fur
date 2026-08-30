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
import * as billingApi from '../../api/billing.api';
import type { Booking } from '../../../booking/booking.types';
import type { Service } from '../../../maintenance/maintenance.types';
import { PaymentsQueuePage } from './PaymentsQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
  updatePet: vi.fn(),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
  startBooking: vi.fn(),
  completeBooking: vi.fn(),
  advancePaymentStage: vi.fn(),
  overridePaymentStage: vi.fn(),
  overrideBookingStatus: vi.fn(),
}));

vi.mock('../../api/billing.api', () => ({
  listBookingTransactions: vi.fn(),
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

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'service-misc',
    category: 'Misc',
    name: 'Initial Assessment',
    base_price: 0,
    duration_minutes: 30,
    is_active: true,
    requires_assessed_pet: false,
    captures_pet_assessment: false,
    min_nights_for_free_package: null,
    free_package_name: null,
    use_pricing_matrix: false,
    first_hour_fee: null,
    succeeding_hour_fee: null,
    daycare_overnight_fee: null,
    created_by: null,
    updated_by: null,
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
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [],
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

  it("loads the queue scoped to the viewer's own branch by default", async () => {
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

  it('custom change (bookings/payments queue paid/unpaid filter): the Payment status filter requests bookings filtered by payment_stage', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Payment status'), 'Unpaid');

    await waitFor(() =>
      expect(bookingApi.listBookings).toHaveBeenLastCalledWith(
        'token',
        expect.objectContaining({ paymentStage: 'Unpaid' })
      )
    );
  });

  it('payment_stage: a booking with no down payment goes straight to Paid on "Mark as Paid" (no modal)', async () => {
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

    await waitFor(() =>
      expect(bookingApi.advancePaymentStage).toHaveBeenCalledWith(
        'booking-1',
        'token',
        'onsite'
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const row = screen.getByRole('listitem');
    expect(await within(row).findByText('Fully Paid')).toBeInTheDocument();
  });

  it('payment_stage: a down-payment booking prompts "Partially Paid" vs "Fully Paid" and advances via the chosen one', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
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
    vi.mocked(bookingApi.advancePaymentStage).mockResolvedValue({
      data: buildBooking({
        status: 'Pending',
        payment_stage: 'Paid in Advance',
      }),
      error: null,
    });

    renderPage();

    await user.click(await screen.findByText('Mark as Paid'));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Down payment for this booking is PHP 250\.00/)
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByText('Down payment only (Partially Paid)')
    );

    await waitFor(() =>
      expect(bookingApi.advancePaymentStage).toHaveBeenCalledWith(
        'booking-1',
        'token',
        'advance'
      )
    );
  });

  it('payment_stage: a Partially Paid booking confirms the remaining balance in a modal, then advances to Paid', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          status: 'Completed',
          payment_stage: 'Paid in Advance',
          downpayment_required: true,
          downpayment_amount: 250,
          total_price: 500,
        }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.advancePaymentStage).mockResolvedValue({
      data: buildBooking({ status: 'Completed', payment_stage: 'Paid' }),
      error: null,
    });

    renderPage();

    await user.click(await screen.findByText('Mark as Paid'));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/remaining balance of PHP 250\.00/)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByText('Record balance (Fully Paid)'));

    await waitFor(() =>
      expect(bookingApi.advancePaymentStage).toHaveBeenCalledWith(
        'booking-1',
        'token',
        'onsite'
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

  it('"View details" (behind the "..." menu) navigates to the booking details page', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: 'More options for this Grooming booking',
      })
    );
    await user.click(screen.getByRole('menuitem', { name: 'View details' }));

    expect(navigateMock).toHaveBeenCalledWith('/staff/bookings/booking-1');
  });

  it('"View payments" (behind the "..." menu) shows each recorded payment for the booking, labelling a down payment', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(billingApi.listBookingTransactions).mockResolvedValue({
      data: [
        {
          id: 'txn-1',
          booking_id: 'booking-1',
          customer_id: 'cust-1',
          branch_id: 'branch-makati',
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
        },
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: 'More options for this Grooming booking',
      })
    );
    await user.click(screen.getByRole('menuitem', { name: 'View payments' }));

    expect(
      await screen.findByText('Payments for this booking')
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 250.00')).toBeInTheDocument();
    expect(
      screen.getByText(/Down payment · GCash · Partially Paid/)
    ).toBeInTheDocument();
    expect(billingApi.listBookingTransactions).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it('Custom change (payments-queue pet assessment capture): Starting a booking on a captures_pet_assessment service opens the assessment modal, and Save & Start saves the pet then starts the booking', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        buildService({ id: 'service-assess', captures_pet_assessment: true }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          service_category: 'Misc',
          status: 'Pending',
          payment_stage: 'Paid',
          booking_items: [
            {
              id: 'item-1',
              booking_id: 'booking-1',
              service_id: 'service-assess',
              package_id: null,
              price_at_booking: 0,
              duration_minutes_at_booking: 30,
            },
          ],
        }),
      ],
      error: null,
    });
    vi.mocked(customerApi.updatePet).mockResolvedValue({
      data: {
        id: 'pet-12345678',
        customer_id: 'cust-12345678',
        name: 'Buddy',
        pet_type: 'Dog',
        breed_id: 'breed-1',
        photo_url: null,
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'L',
        coat_type: 'SC',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
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

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Weight class'),
      'L'
    );
    await user.selectOptions(within(dialog).getByLabelText('Coat type'), 'SC');
    await user.click(within(dialog).getByText('Save & Start'));

    await waitFor(() =>
      expect(customerApi.updatePet).toHaveBeenCalledWith(
        'pet-12345678',
        'token',
        { weight_class: 'L', coat_type: 'SC' }
      )
    );
    await waitFor(() =>
      expect(bookingApi.startBooking).toHaveBeenCalledWith('booking-1', 'token')
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
