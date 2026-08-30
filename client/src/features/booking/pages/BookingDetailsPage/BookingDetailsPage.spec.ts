import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as discountsApi from '../../../discounts/api/discounts.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { BookingDetailsPage } from './BookingDetailsPage';

vi.mock('../../api/booking.api', () => ({
  getBooking: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServices: vi.fn(),
  listPackages: vi.fn(),
  listPromos: vi.fn(),
}));

vi.mock('../../../discounts/api/discounts.api', () => ({
  listDiscounts: vi.fn(),
}));

vi.mock(
  '../../../billing/components/BookingPaymentsPanel/BookingPaymentsPanel',
  () => ({
    BookingPaymentsPanel: ({ bookingId }: { bookingId: string }) =>
      createElement('div', null, `payments-panel:${bookingId}`),
  })
);

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: 'staff-1',
    service_category: 'Grooming',
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-2',
    status: 'Pending',
    total_price: 800,
    downpayment_amount: null,
    payment_method: 'Cash',
    payment_confirmed: false,
    selected_discount_id: null,
    selected_promo_id: null,
    discount_amount: 0,
    promo_amount: 0,
    special_instructions: null,
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    booking_items: [
      {
        id: 'item-1',
        booking_id: 'booking-1',
        service_id: 'service-1',
        package_id: null,
        price_at_booking: 300,
        duration_minutes_at_booking: 60,
      },
      {
        id: 'item-2',
        booking_id: 'booking-1',
        service_id: 'service-2',
        package_id: null,
        price_at_booking: 500,
        duration_minutes_at_booking: 90,
      },
    ],
    ...overrides,
  };
}

function renderPage(bookingId = 'booking-1') {
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
      { initialEntries: [`/staff/bookings/${bookingId}`] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/bookings/:bookingId',
            element: createElement(BookingDetailsPage),
          })
        )
      )
    )
  );
}

describe('BookingDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'cust-1',
        name: 'Buddy',
        pet_type: 'Dog',
        breed_id: null,
        photo_url: null,
        gender: null,
        date_of_birth: null,
        weight_class: 'M',
        coat_type: 'SC',
        created_at: '',
        updated_at: '',
      },
      error: null,
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: {
        id: 'cust-1',
        full_name: 'Jane Doe',
        contact_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        account_email: 'jane@example.com',
        primary_auth_provider: 'email',
        facebook_id: null,
        created_at: '',
        updated_at: '',
      },
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
    vi.mocked(maintenanceApi.listServices).mockResolvedValue({
      data: [
        {
          id: 'service-1',
          category: 'Grooming',
          name: 'Bath',
          base_price: 300,
          duration_minutes: 60,
          is_active: true,
          requires_assessed_pet: true,
          created_by: null,
          updated_by: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'service-2',
          category: 'Grooming',
          name: 'Haircut',
          base_price: 500,
          duration_minutes: 90,
          is_active: true,
          requires_assessed_pet: true,
          created_by: null,
          updated_by: null,
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listPackages).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('renders pet/owner, every booking item, and the total', async () => {
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: buildBooking(),
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Buddy/)).toBeInTheDocument());
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(await screen.findByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    // Subtotal and Total both read PHP 800.00 (no discount/promo applied).
    expect(screen.getAllByText('PHP 800.00')).toHaveLength(2);
    // The per-booking payments panel is mounted for this booking.
    expect(screen.getByText('payments-panel:booking-1')).toBeInTheDocument();
  });

  it('resolves and shows the applied discount and promo names with their amounts', async () => {
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: buildBooking({
        selected_discount_id: 'discount-1',
        discount_amount: 50,
        selected_promo_id: 'promo-1',
        promo_amount: 25,
        total_price: 725,
      }),
      error: null,
    });
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [
        {
          id: 'discount-1',
          branch_id: 'branch-1',
          name: 'Senior Citizen',
          is_mandated: true,
          discount_type: 'percentage',
          value: 20,
          scope_type: 'all',
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listPromos).mockResolvedValue({
      data: [
        {
          id: 'promo-1',
          name: 'Grand Opening',
          start_date: null,
          end_date: null,
          condition_note: null,
          discount_type: 'fixed_amount',
          value: 25,
          scope_type: 'all',
          promo_branch_availability: [],
          is_active: true,
          created_by: null,
          updated_by: null,
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Senior Citizen/)).toBeInTheDocument();
    expect(screen.getByText(/Grand Opening/)).toBeInTheDocument();
    expect(screen.getByText('-PHP 50.00')).toBeInTheDocument();
    expect(screen.getByText('-PHP 25.00')).toBeInTheDocument();
  });

  it('shows an error banner when the booking fails to load', async () => {
    vi.mocked(bookingApi.getBooking).mockResolvedValue({
      data: null,
      error: 'Booking not found.',
    });

    renderPage();

    expect(await screen.findByText('Booking not found.')).toBeInTheDocument();
  });
});
