import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import * as bookingApi from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { DaycareQueuePage } from './DaycareQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));
vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'staff1',
    registered_email: 'staff1@example.com',
    display_name: 'Staff One',
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

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-makati',
    created_by_staff_id: null,
    service_category: 'Daycare',
    booking_source: 'Online',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-09-12T01:00:00.000Z',
    scheduled_end: '2026-09-12T02:00:00.000Z',
    assigned_staff_id: null,
    status: 'Pending',
    payment_status: 'Pending',
    started_at: null,
    completed_at: null,
    paid_at: null,
    hotel_preferences: null,
    total_price: 300,
    downpayment_amount: null,
    payment_method: null,
    payment_confirmed: false,
    special_instructions: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides,
  } as unknown as Booking;
}

function renderPage(initialEntry = '/staff/daycare/queue') {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/daycare/queue',
            element: createElement(DaycareQueuePage),
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

function stubPetAndOwner() {
  vi.mocked(customerApi.getPet).mockResolvedValue({
    data: {
      id: 'pet-1',
      customer_id: 'cust-1',
      name: 'Buddy',
      pet_type: 'Dog',
      breed_id: null,
      photo_url: null,
      gender: 'Male',
      date_of_birth: null,
      weight_class: 'M',
      coat_type: 'SC',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
    data: {
      id: 'cust-1',
      full_name: 'Jamie Cruz',
      contact_number: null,
      emergency_contact_name: null,
      emergency_contact_number: null,
      preferred_communication_channel: null,
      account_email: 'jamie@example.com',
      primary_auth_provider: 'email',
      facebook_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
}

describe('DaycareQueuePage (Daycare Queue redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a Cashier viewer (not a check-in/checkout role) to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Cashier'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('lists Daycare bookings with a status badge, not tabs', async () => {
    stubPetAndOwner();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking()],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Daycare Queue')).toBeInTheDocument();
    const petName = await screen.findByText('Buddy');
    expect(petName).toBeInTheDocument();
    expect(
      within(petName.closest('button')!).getByText('Pending')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /check in/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /check out/i })
    ).not.toBeInTheDocument();
  });

  it('clicking a Pending row navigates to its check-in finalize page', async () => {
    stubPetAndOwner();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Buddy'));

    expect(navigateMock).toHaveBeenCalledWith(
      '/staff/daycare/queue/check-in/booking-1'
    );
  });

  it('clicking a checked-in (In Progress) row navigates to the pet-scoped Boarding Checklist', async () => {
    stubPetAndOwner();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'In Progress' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Buddy'));

    expect(navigateMock).toHaveBeenCalledWith(
      '/staff/hotel/care-log?petId=pet-1'
    );
  });

  it('a checked-out (Completed) row is not clickable, but offers a View details link', async () => {
    stubPetAndOwner();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Buddy');
    expect(
      screen.queryByRole('button', { name: /buddy/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('View details'));
    expect(navigateMock).toHaveBeenCalledWith('/staff/bookings/booking-1');
  });

  it('shows a success banner after a redirect from a completed check-in', async () => {
    stubPetAndOwner();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage('/staff/daycare/queue?checkedIn=success');

    expect(
      await screen.findByText('Pet checked in successfully.')
    ).toBeInTheDocument();
  });
});
