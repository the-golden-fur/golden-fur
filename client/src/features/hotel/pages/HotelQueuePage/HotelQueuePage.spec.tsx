import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as hotelApi from '../../api/hotel.api';
import type { Booking } from '../../../booking/booking.types';
import type { StaffProfile } from '../../../staff/staff.types';
import { HotelQueuePage } from './HotelQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/hotel.api', () => ({
  checkInHotelStay: vi.fn(),
}));

// The picker's own data loading is exercised in HotelBookingPicker.spec -
// here we only care that the page wires its callbacks up correctly.
vi.mock('../../components/HotelBookingPicker/HotelBookingPicker', () => ({
  HotelBookingPicker: (props: {
    onCheckIn: (booking: Booking) => void;
    onViewDetails: (booking: Booking) => void;
    checkingInBookingId?: string | null;
  }) => {
    const booking = { id: 'booking-1', hotel_preferences: null } as Booking;
    return createElement(
      'div',
      null,
      createElement(
        'button',
        { type: 'button', onClick: () => props.onCheckIn(booking) },
        'Check in Mochi'
      ),
      createElement(
        'button',
        { type: 'button', onClick: () => props.onViewDetails(booking) },
        'View Mochi details'
      ),
      createElement(
        'span',
        null,
        `checkingIn:${props.checkingInBookingId ?? 'none'}`
      )
    );
  },
}));

vi.mock('./HotelCheckoutPanel', () => ({
  HotelCheckoutPanel: () => createElement('div', null, 'Checkout panel'),
}));

function buildProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-a',
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

function renderPage(initialEntry = '/staff/hotel/queue') {
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
            path: '/staff/hotel/queue',
            element: createElement(HotelQueuePage),
          }),
          createElement(Route, {
            path: '/staff/hotel/queue/check-in/:bookingId',
            element: createElement('div', null, 'Booking details page'),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff settings page'),
          })
        )
      )
    )
  );
}

describe('HotelQueuePage (custom change: one-click check-in)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile('Groomer'),
      error: null,
    });
  });

  it('the "Check in" button checks the pet in on the spot and shows a success modal', async () => {
    vi.mocked(hotelApi.checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);

    renderPage();

    fireEvent.click(await screen.findByText('Check in Mochi'));

    expect(await screen.findByText('Pet checked in')).toBeInTheDocument();
    expect(
      screen.getByText('Pet checked in successfully.')
    ).toBeInTheDocument();
    expect(hotelApi.checkInHotelStay).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ booking_id: 'booking-1' })
    );
    // Never routes to the check-in form page.
    expect(screen.queryByText('Booking details page')).not.toBeInTheDocument();
  });

  it('a failed check-in shows the error message in a modal, not a success', async () => {
    vi.mocked(hotelApi.checkInHotelStay).mockResolvedValue({
      data: null,
      error: 'No available cage of the suggested size (S)',
    });

    renderPage();

    fireEvent.click(await screen.findByText('Check in Mochi'));

    expect(await screen.findByText('Check-in failed')).toBeInTheDocument();
    expect(
      screen.getByText('No available cage of the suggested size (S)')
    ).toBeInTheDocument();
  });

  it('"View booking details" navigates to the booking detail route', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('View Mochi details'));

    expect(await screen.findByText('Booking details page')).toBeInTheDocument();
  });

  it('returning from a check-in on the detail page (?checkedIn=success) shows the success modal', async () => {
    renderPage('/staff/hotel/queue?checkedIn=success');

    expect(await screen.findByText('Pet checked in')).toBeInTheDocument();
  });

  it('a role outside the viewer set is redirected away', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile('Receptionist'),
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText('Check in Mochi')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Hotel Queue')).not.toBeInTheDocument();
  });
});
