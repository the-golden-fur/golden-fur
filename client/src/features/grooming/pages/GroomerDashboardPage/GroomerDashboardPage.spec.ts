import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as groomingApi from '../../api/grooming.api';
import type { StaffProfile } from '../../../staff/staff.types';
import type { GroomingSession } from '../../grooming.types';
import type { Booking, BookingStatus } from '../../../booking/booking.types';
import { GroomerDashboardPage } from './GroomerDashboardPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listServices: vi.fn().mockResolvedValue({ data: [], error: null }),
  listPackages: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('../../api/grooming.api', () => ({
  listGroomingQueue: vi.fn(),
  transitionGroomingStatus: vi.fn(),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'groomer-1',
    branch_id: 'branch-a',
    role,
    username: 'groomer1',
    registered_email: 'groomer1@example.com',
    display_name: 'Groomer One',
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
    customer_id: 'customer-1',
    pet_id: 'pet-1',
    branch_id: 'branch-a',
    created_by_staff_id: null,
    service_category: 'Grooming',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-07-19T02:00:00.000Z',
    scheduled_end: '2026-07-19T03:00:00.000Z',
    assigned_staff_id: 'groomer-1',
    status: 'Pending',
    total_price: 500,
    downpayment_amount: null,
    payment_method: null,
    payment_confirmed: true,
    special_instructions: 'Puppy cut',
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
    booking_addons: [],
    ...overrides,
  };
}

function buildSession(
  bookingStatus: BookingStatus = 'Pending',
  overrides: Partial<GroomingSession> = {}
): GroomingSession {
  return {
    id: 'session-1',
    booking_id: 'booking-1',
    assigned_groomer_id: 'groomer-1',
    queue_position: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    booking: buildBooking({ status: bookingStatus }),
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'groomer-1', email: 'groomer1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/dashboard/groomer/queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/dashboard/groomer/queue',
            element: createElement(GroomerDashboardPage),
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

describe('GroomerDashboardPage (#68, booking-status revision)', () => {
  it('AC-1: redirects a non-Groomer/Admin/Supervisor/Superadmin viewer to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1/AC-2: a Groomer viewer sees today’s queue with resolved pet/owner names', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(groomingApi.listGroomingQueue).mockResolvedValue({
      data: { sessions: [buildSession('Pending')] },
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'customer-1',
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
        id: 'customer-1',
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

    renderPage();

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('AC-3: advancing a Pending session calls transitionGroomingStatus with In Progress and updates the badge', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(groomingApi.listGroomingQueue).mockResolvedValue({
      data: { sessions: [buildSession('Pending')] },
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: null,
      error: 'not found',
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'not found',
    });
    vi.mocked(groomingApi.transitionGroomingStatus).mockResolvedValue({
      data: buildSession('In Progress'),
      error: null,
    });

    renderPage();

    const advanceButton = await screen.findByRole('button', {
      name: /start/i,
    });
    await userEvent.click(advanceButton);

    await waitFor(() =>
      expect(groomingApi.transitionGroomingStatus).toHaveBeenCalledWith(
        'session-1',
        'token',
        'In Progress'
      )
    );
    expect(
      await screen.findByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('filters the queue by booking status', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(groomingApi.listGroomingQueue).mockResolvedValue({
      data: {
        sessions: [
          buildSession('Pending', {
            id: 'session-1',
            booking_id: 'booking-1',
            booking: buildBooking({ id: 'booking-1', status: 'Pending' }),
          }),
          buildSession('In Progress', {
            id: 'session-2',
            booking_id: 'booking-2',
            booking: buildBooking({ id: 'booking-2', status: 'In Progress' }),
          }),
        ],
      },
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: null,
      error: 'not found',
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'not found',
    });

    renderPage();

    // Both sessions are visible under "All statuses".
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    );

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Pending');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText('Status'),
      'In Progress'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: /complete/i })
    ).toBeInTheDocument();
  });
});
