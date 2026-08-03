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
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { ReceptionistBookingsQueuePage } from './ReceptionistBookingsQueuePage';

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

vi.mock('../../api/booking.api', () => ({
  listBookings: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  startBooking: vi.fn(),
  completeBooking: vi.fn(),
  markBookingPaid: vi.fn(),
}));

vi.mock('../../components/SlotPicker/SlotPicker', () => ({
  SlotPicker: () => createElement('div', { 'data-testid': 'slot-picker' }),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: () =>
    createElement('div', { 'data-testid': 'staff-picker' }),
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
    service_category: 'Grooming',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-2',
    status: 'Pending',
    started_at: null,
    completed_at: null,
    paid_at: null,
    hotel_preferences: null,
    total_price: 500,
    downpayment_amount: null,
    payment_method: 'Cash',
    payment_confirmed: false,
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
      { initialEntries: ['/staff/bookings/queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/bookings/queue',
            element: createElement(ReceptionistBookingsQueuePage),
          })
        )
      )
    )
  );
}

describe('ReceptionistBookingsQueuePage', () => {
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

  it("AC-1: loads the queue scoped to the receptionist's own branch by default", async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
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
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('AC-2: the branch filter is hidden for a non-Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('AC-2: the branch filter is shown for a Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Branch')).toBeInTheDocument());
  });

  it('defaults the date filter to "Today" and requests a same-day range', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(bookingApi.listBookings).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          dateFrom: expect.any(String),
          dateTo: expect.any(String),
        })
      )
    );
    const call = vi
      .mocked(bookingApi.listBookings)
      .mock.calls.at(-1) as unknown as [
      string,
      { dateFrom: string; dateTo: string },
    ];
    expect(call[1].dateFrom).toEqual(call[1].dateTo);
  });

  it('switching the date filter to "This week" widens the requested range', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    vi.mocked(bookingApi.listBookings).mockClear();

    await userEvent.selectOptions(screen.getByLabelText('Date'), 'this_week');

    await waitFor(() => expect(bookingApi.listBookings).toHaveBeenCalled());
    const call = vi
      .mocked(bookingApi.listBookings)
      .mock.calls.at(-1) as unknown as [
      string,
      { dateFrom: string; dateTo: string },
    ];
    expect(call[1].dateFrom).not.toEqual(call[1].dateTo);
  });

  it('booking-status revision: shows Start for a Pending booking, and it advances to In Progress on click', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.startBooking).mockResolvedValue({
      data: buildBooking({ status: 'In Progress' }),
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument());
    await user.click(screen.getByText('Start'));

    await waitFor(() =>
      expect(bookingApi.startBooking).toHaveBeenCalledWith('booking-1', 'token')
    );
    const row = screen.getByRole('listitem');
    expect(await within(row).findByText('In Progress')).toBeInTheDocument();
  });

  it('booking-status revision: shows Complete for an In Progress booking, not Start', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'In Progress' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Complete')).toBeInTheDocument()
    );
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
  });

  it('booking-status revision: shows Mark as Paid for a Completed booking', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed' })],
      error: null,
    });
    vi.mocked(bookingApi.markBookingPaid).mockResolvedValue({
      data: buildBooking({ status: 'Paid' }),
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Mark as Paid')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Mark as Paid'));

    await waitFor(() =>
      expect(bookingApi.markBookingPaid).toHaveBeenCalledWith(
        'booking-1',
        'token'
      )
    );
    const row = screen.getByRole('listitem');
    expect(await within(row).findByText('Paid')).toBeInTheDocument();
  });

  it("shouldn't offer Reschedule once a Pending booking's own scheduled time has already passed", async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          scheduled_start: '2020-01-01T01:00:00.000Z',
          scheduled_end: '2020-01-01T02:00:00.000Z',
        }),
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
    // Still cancellable even though it's overdue - only Reschedule is time-gated.
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('a Cancelled booking offers neither Reschedule nor Cancel', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Cancelled' })],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('search filters the already-loaded bookings by pet or owner name', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({ id: 'booking-1', pet_id: 'pet-12345678' }),
        buildBooking({
          id: 'booking-2',
          pet_id: 'pet-other',
          customer_id: 'cust-other',
        }),
      ],
      error: null,
    });
    vi.mocked(customerApi.getPet).mockImplementation((id) =>
      Promise.resolve({
        data: {
          id,
          customer_id: id === 'pet-12345678' ? 'cust-12345678' : 'cust-other',
          name: id === 'pet-12345678' ? 'Buddy' : 'Whiskers',
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
      })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.getByText(/Whiskers/)).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText('Search by pet or owner name...'),
      'buddy'
    );

    expect(screen.getByText(/Buddy/)).toBeInTheDocument();
    expect(screen.queryByText(/Whiskers/)).not.toBeInTheDocument();
  });

  it('sort dropdown reorders bookings by scheduled time', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          id: 'booking-early',
          pet_id: 'pet-early',
          scheduled_start: '2026-08-03T01:00:00.000Z',
        }),
        buildBooking({
          id: 'booking-late',
          pet_id: 'pet-late',
          scheduled_start: '2026-08-03T09:00:00.000Z',
        }),
      ],
      error: null,
    });
    vi.mocked(customerApi.getPet).mockImplementation((id) =>
      Promise.resolve({
        data: {
          id,
          customer_id: 'cust-12345678',
          name: id === 'pet-early' ? 'Early Bird' : 'Late Riser',
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
      })
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    );

    let rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Early Bird');
    expect(rows[1].textContent).toContain('Late Riser');

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Scheduled time (soonest)'),
      'latest'
    );

    rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Late Riser');
    expect(rows[1].textContent).toContain('Early Bird');
  });

  it('AC-4: "New booking" navigates to the flow shell in receptionist mode', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('New booking')).toBeInTheDocument()
    );
    await user.click(screen.getByText('New booking'));

    expect(navigateMock).toHaveBeenCalledWith('/staff/bookings/new');
  });

  it('"View details" navigates to the booking details page', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
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
