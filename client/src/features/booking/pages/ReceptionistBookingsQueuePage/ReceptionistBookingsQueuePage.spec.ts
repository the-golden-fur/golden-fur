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
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { ReceptionistBookingsQueuePage } from './ReceptionistBookingsQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  listBookings: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
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
    status: 'Confirmed',
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
    expect(screen.getByText(/Customer cust-123/)).toBeInTheDocument();
  });

  it('AC-2: the branch filter is hidden for a non-Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Customer cust-123/)).toBeInTheDocument()
    );
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
});
