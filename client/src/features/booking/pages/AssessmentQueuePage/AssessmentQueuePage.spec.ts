import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { AssessmentQueuePage } from './AssessmentQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
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

vi.mock('../../api/booking.api', () => ({
  listBookings: vi.fn(),
  startBooking: vi.fn(),
  completeBooking: vi.fn(),
  overrideBookingStatus: vi.fn(),
}));

function buildViewer(
  role: StaffProfile['role'],
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'receptionist',
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
    service_category: 'Assessment',
    booking_source: 'Walk-in',
    service_id: 'svc-assessment-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: null,
    status: 'Pending',
    payment_status: 'Fully Paid',
    started_at: null,
    completed_at: null,
    paid_at: null,
    hotel_preferences: null,
    total_price: 0,
    downpayment_amount: null,
    payment_method: 'Cash',
    payment_confirmed: true,
    special_instructions: null,
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
      { initialEntries: ['/staff/assessment/queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/assessment/queue',
            element: createElement(AssessmentQueuePage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AssessmentQueuePage', () => {
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
        weight_class: null,
        coat_type: null,
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

  it('redirects a Cashier viewer to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewer('Cashier'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it("loads the queue scoped to the viewer's own branch and the Assessment category, resolving pet/owner names", async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewer('Receptionist'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Buddy/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    await waitFor(() =>
      expect(bookingApi.listBookings).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          branchId: 'branch-makati',
          serviceCategory: 'Assessment',
        })
      )
    );
  });

  it('starts an Assessment booking via its own Start button, capturing the pet assessment first', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewer('Receptionist'),
      error: null,
    });
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        {
          id: 'svc-assessment-1',
          category: 'Assessment',
          captures_pet_assessment: true,
        } as never,
      ],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          status: 'Pending',
          payment_status: 'Fully Paid',
          booking_items: [
            {
              id: 'bi-1',
              booking_id: 'booking-1',
              service_id: 'svc-assessment-1',
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
        weight_class: 'M',
        coat_type: 'SC',
      } as never,
      error: null,
    });
    vi.mocked(bookingApi.startBooking).mockResolvedValue({
      data: buildBooking({ status: 'In Progress' }),
      error: null,
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Start' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Weight class'),
      'M'
    );
    await user.selectOptions(within(dialog).getByLabelText('Coat type'), 'SC');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save & Start' })
    );

    await waitFor(() =>
      expect(customerApi.updatePet).toHaveBeenCalledWith(
        'pet-12345678',
        'token',
        {
          weight_class: 'M',
          coat_type: 'SC',
        }
      )
    );
    await waitFor(() =>
      expect(bookingApi.startBooking).toHaveBeenCalledWith('booking-1', 'token')
    );
  });

  it('gives an Admin a status-override dropdown instead of Start/Complete', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewer('Admin'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending', payment_status: 'Fully Paid' })],
      error: null,
    });
    vi.mocked(bookingApi.overrideBookingStatus).mockResolvedValue({
      data: buildBooking({ status: 'Completed' }),
      error: null,
    });

    renderPage();

    const row = await screen.findByRole('listitem');
    expect(
      within(row).queryByRole('button', { name: 'Start' })
    ).not.toBeInTheDocument();

    await user.selectOptions(within(row).getByLabelText('Status'), 'Completed');

    await waitFor(() =>
      expect(bookingApi.overrideBookingStatus).toHaveBeenCalledWith(
        'booking-1',
        'Completed',
        'token'
      )
    );
  });

  it('completes an In Progress booking via the Complete button', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewer('Receptionist'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({ status: 'In Progress', payment_status: 'Fully Paid' }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.completeBooking).mockResolvedValue({
      data: buildBooking({ status: 'Completed' }),
      error: null,
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Complete' }));

    await waitFor(() =>
      expect(bookingApi.completeBooking).toHaveBeenCalledWith(
        'booking-1',
        'token'
      )
    );
  });
});
