import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as bookingApi from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { DaycareCheckInFormPage } from './DaycareCheckInFormPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../booking/api/booking.api', () => ({
  getBooking: vi.fn(),
}));
vi.mock('../DaycareQueuePage/DaycareCheckInPanel', () => ({
  DaycareCheckInPanel: (props: {
    booking: Booking;
    onCheckedIn: (sessionId: string) => void;
  }) =>
    createElement(
      'div',
      null,
      createElement('span', null, `Panel for ${props.booking.id}`),
      createElement(
        'button',
        { type: 'button', onClick: () => props.onCheckedIn('session-1') },
        'Simulate check-in'
      )
    ),
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

function renderPage() {
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
      { initialEntries: ['/staff/daycare/queue/check-in/booking-1'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/daycare/queue/check-in/:bookingId',
            element: createElement(DaycareCheckInFormPage),
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

describe('DaycareCheckInFormPage (Daycare Queue redesign)', () => {
  it('redirects a role that cannot check pets in', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Cashier'),
      error: null,
    });
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: buildBooking(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('loads the booking and renders the check-in panel for it', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: buildBooking(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Panel for booking-1')).toBeInTheDocument();
    expect(bookingApi.getBooking).toHaveBeenCalledWith('booking-1', 'token');
  });

  it('shows an error and a back link when the booking cannot be loaded', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: null,
      error: 'Booking not found',
    });

    renderPage();

    expect(await screen.findByText('Booking not found')).toBeInTheDocument();
    expect(screen.getByText(/Back to Daycare Queue/)).toBeInTheDocument();
  });

  it('navigates back to the queue with a success flag once checked in', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: buildBooking(),
      error: null,
    });

    renderPage();

    (await screen.findByText('Simulate check-in')).click();

    expect(navigateMock).toHaveBeenCalledWith(
      '/staff/daycare/queue?checkedIn=success'
    );
  });
});
