import { render, screen, waitFor } from '@testing-library/react';
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
import * as policyApi from '../../api/policy.api';
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
}));

// Reschedule button gating (#24) reads policy_configurations - only the
// fetch is mocked; resolveEffectivePolicy stays the real pure function so
// its default-vs-branch-override precedence is still exercised as written.
vi.mock('../../api/policy.api', async () => {
  const actual = await vi.importActual<typeof import('../../api/policy.api')>(
    '../../api/policy.api'
  );
  return {
    ...actual,
    listPolicyConfigurations: vi.fn(),
  };
});

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
    booking_source: 'Online',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-2',
    status: 'Pending',
    payment_stage: 'Unpaid',
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
    // Notice-period-disabled default keeps the Reschedule button gate a
    // no-op for every existing test below - the gate's own behavior is
    // exercised separately (see the "Reschedule button gate" describe
    // block further down).
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [
        {
          id: 'policy-default',
          branch_id: null,
          notice_period_days: 3,
          notice_enforcement_mode: 'Strict',
          notice_enforcement_enabled: false,
          staff_picker_enabled_grooming: true,
          staff_picker_enabled_veterinary: true,
          lunch_break_enabled: false,
          lunch_break_start: '12:00:00',
          lunch_break_end: '13:00:00',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
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

  it('custom change (bookings/payments queue paid/unpaid filter): the Payment status filter requests bookings filtered by payment_stage', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
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

  it('switches between the List and Calendar views', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Buddy/)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'View details' }).length
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));

    expect(
      screen.queryByRole('button', { name: 'View details' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous month' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Next month' })
    ).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(
      screen.getAllByRole('button', { name: 'View details' }).length
    ).toBeGreaterThan(0);
  });

  it('switches the Calendar view between Week and Month granularity', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Buddy/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));

    // Defaults to Month.
    expect(
      screen.getByRole('button', { name: 'Previous month' })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));

    expect(
      screen.getByRole('button', { name: 'Previous week' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Previous month' })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Month' }));

    expect(
      screen.getByRole('button', { name: 'Previous month' })
    ).toBeInTheDocument();
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

  it('read-only queue: never shows Start/Complete/status-override/payment controls, regardless of status or role', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'In Progress', payment_stage: 'Unpaid' })],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
    // Only the QueueFilterBar's own "Status" select remains - the row-level
    // status-override dropdown (same label text) is gone.
    expect(screen.getAllByLabelText('Status')).toHaveLength(1);
    expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
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

  it('hides Reschedule when Strict-mode notice period is not met (#24)', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    const soonStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          scheduled_start: soonStart,
          scheduled_end: new Date(
            Date.parse(soonStart) + 60 * 60 * 1000
          ).toISOString(),
        }),
      ],
      error: null,
    });
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [
        {
          id: 'policy-default',
          branch_id: null,
          notice_period_days: 3,
          notice_enforcement_mode: 'Strict',
          notice_enforcement_enabled: true,
          staff_picker_enabled_grooming: true,
          staff_picker_enabled_veterinary: true,
          lunch_break_enabled: false,
          lunch_break_start: '12:00:00',
          lunch_break_end: '13:00:00',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
    // Notice-period gating is Reschedule-only, same as the past-due case above.
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('still shows Reschedule under Soft-mode enforcement even when notice is unmet, since the server lets it through flagged (#24)', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    const soonStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          scheduled_start: soonStart,
          scheduled_end: new Date(
            Date.parse(soonStart) + 60 * 60 * 1000
          ).toISOString(),
        }),
      ],
      error: null,
    });
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [
        {
          id: 'policy-default',
          branch_id: null,
          notice_period_days: 3,
          notice_enforcement_mode: 'Soft',
          notice_enforcement_enabled: true,
          staff_picker_enabled_grooming: true,
          staff_picker_enabled_veterinary: true,
          lunch_break_enabled: false,
          lunch_break_start: '12:00:00',
          lunch_break_end: '13:00:00',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.getByText('Reschedule')).toBeInTheDocument();
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

  // Walk-in booking flow (custom change): "Check In" is back as a third
  // sibling action alongside Reschedule/Cancel - see the page's own updated
  // doc comment for why this doesn't contradict
  // bookings-queue-readonly-and-sidebar-reorg.
  describe('Check In (walk-in booking flow)', () => {
    it('shows Check In only for a Pending booking, calls startBooking, and updates the row in place on success', async () => {
      const user = userEvent.setup();
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Receptionist')],
        error: null,
      });
      vi.mocked(bookingApi.listBookings).mockResolvedValue({
        data: [buildBooking({ status: 'Pending' })],
        error: null,
      });
      vi.mocked(bookingApi.startBooking).mockResolvedValue({
        data: buildBooking({ status: 'In Progress' }),
        error: null,
      });

      renderPage();

      await waitFor(() =>
        expect(screen.getByText('Check In')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Check In'));

      expect(bookingApi.startBooking).toHaveBeenCalledWith(
        'booking-1',
        'token'
      );
      await waitFor(() =>
        expect(screen.queryByText('Check In')).not.toBeInTheDocument()
      );
    });

    it('does not show Check In for a booking that is already past Pending', async () => {
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
        expect(screen.getByText(/Buddy/)).toBeInTheDocument()
      );
      expect(screen.queryByText('Check In')).not.toBeInTheDocument();
    });

    it('shows an error scoped to the failing booking when Check In fails, without disturbing its status', async () => {
      const user = userEvent.setup();
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Receptionist')],
        error: null,
      });
      vi.mocked(bookingApi.listBookings).mockResolvedValue({
        data: [buildBooking({ status: 'Pending' })],
        error: null,
      });
      vi.mocked(bookingApi.startBooking).mockResolvedValue({
        data: null,
        error: 'A Pending booking cannot be started',
      });

      renderPage();

      await waitFor(() =>
        expect(screen.getByText('Check In')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Check In'));

      expect(
        await screen.findByText('A Pending booking cannot be started')
      ).toBeInTheDocument();
      // Still Pending, still offering Check In again.
      expect(screen.getByText('Check In')).toBeInTheDocument();
    });
  });
});
