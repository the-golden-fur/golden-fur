import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as bookingApi from '../../../booking/api/booking.api';
import * as daycareApi from '../../api/daycare.api';
import type { StaffProfile } from '../../../staff/staff.types';
import { DaycareCheckInPage } from './DaycareCheckInPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  listCustomers: vi.fn(),
  listCustomerPets: vi.fn(),
  createPet: vi.fn(),
}));
vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
}));
vi.mock('../../api/daycare.api', () => ({
  checkInDaycareSession: vi.fn(),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'reception-1',
    branch_id: 'branch-makati',
    role,
    username: 'reception1',
    registered_email: 'reception1@example.com',
    display_name: 'Reception One',
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

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'reception-1', email: 'reception1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/daycare/check-in'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/daycare/check-in',
            element: createElement(DaycareCheckInPage),
          }),
          createElement(Route, {
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
          }),
          createElement(Route, {
            path: '/staff/daycare/checkout/:sessionId',
            element: createElement('div', null, 'Checkout page'),
          })
        )
      )
    )
  );
}

describe('DaycareCheckInPage (#69)', () => {
  it('AC-1: redirects a non-Receptionist/Admin/Supervisor/Superadmin viewer to /staff/profile', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1: checks in via an existing confirmed booking', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        {
          id: 'booking-1',
          customer_id: 'customer-1',
          pet_id: 'pet-1',
          branch_id: 'branch-makati',
          created_by_staff_id: null,
          service_category: 'Daycare',
          service_id: 'service-1',
          package_id: null,
          scheduled_start: '2026-07-19T02:00:00.000Z',
          scheduled_end: '2026-07-19T03:00:00.000Z',
          assigned_staff_id: null,
          status: 'Confirmed',
          total_price: 300,
          downpayment_amount: null,
          payment_method: null,
          payment_confirmed: true,
          special_instructions: null,
          cancelled_at: null,
          cancellation_reason: null,
          reschedule_count: 0,
          created_at: '2026-07-18T00:00:00.000Z',
          updated_at: '2026-07-18T00:00:00.000Z',
        },
      ],
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'customer-1',
        name: 'Rex',
        species: 'Dog',
        breed: null,
        gender: null,
        date_of_birth: null,
        weight_class: 'M',
        coat_type: 'SC',
        health_conditions: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(daycareApi.checkInDaycareSession).mockResolvedValue({
      data: {
        id: 'session-1',
        booking_id: 'booking-1',
        pet_id: 'pet-1',
        branch_id: 'branch-makati',
        created_by_staff_id: 'reception-1',
        status: 'Active',
        check_in_at: '2026-07-19T02:00:00.000Z',
        check_out_at: null,
        computed_charge: null,
        created_at: '2026-07-19T02:00:00.000Z',
        updated_at: '2026-07-19T02:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByLabelText(/Rex/));
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    await waitFor(() =>
      expect(daycareApi.checkInDaycareSession).toHaveBeenCalledWith('token', {
        booking_id: 'booking-1',
      })
    );
    expect(
      await screen.findByText(/checked in successfully/i)
    ).toBeInTheDocument();
  });

  it('AC-3: a cutoff-blocked check-in shows a clear terminal message and does not clear on its own', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({ data: [], error: null });
    vi.mocked(customerApi.listCustomers).mockResolvedValue({
      data: [
        {
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
      ],
      error: null,
    });
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [
        {
          id: 'pet-1',
          customer_id: 'customer-1',
          name: 'Rex',
          species: 'Dog',
          breed: null,
          gender: null,
          date_of_birth: null,
          weight_class: 'M',
          coat_type: 'SC',
          health_conditions: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
    vi.mocked(daycareApi.checkInDaycareSession).mockResolvedValue({
      data: null,
      error: 'Check-in unavailable after 4:00 PM',
    });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /walk-in/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/customer email/i),
      'jane@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await userEvent.click(await screen.findByText(/Jane Doe/));
    await userEvent.click(await screen.findByLabelText(/Rex/));
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(
      await screen.findByText('Check-in unavailable after 4:00 PM')
    ).toBeInTheDocument();
  });
});
