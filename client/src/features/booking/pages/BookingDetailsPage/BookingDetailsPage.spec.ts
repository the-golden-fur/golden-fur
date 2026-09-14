import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as bookingApi from '../../api/booking.api';
import type { BookingDetails } from '../../booking.types';
import { BookingDetailsPage } from './BookingDetailsPage';

vi.mock('../../api/booking.api', () => ({
  getBookingDetails: vi.fn(),
}));

function buildDetails(overrides: Partial<BookingDetails> = {}): BookingDetails {
  return {
    booking: {
      id: 'booking-1',
      customer_id: 'cust-1',
      pet_id: 'pet-1',
      branch_id: 'branch-1',
      created_by_staff_id: 'staff-1',
      service_category: 'Grooming',
      booking_source: 'Online',
      scheduled_start: '2026-08-03T01:00:00.000Z',
      scheduled_end: '2026-08-03T02:00:00.000Z',
      assigned_staff_id: 'staff-2',
      status: 'Pending',
      payment_status: 'Pending',
      total_price: 800,
      downpayment_amount: null,
      downpayment_required: false,
      downpayment_due_at: null,
      payment_method: null,
      payment_confirmed: false,
      selected_discount_id: null,
      selected_promo_id: null,
      discount_amount: 0,
      promo_amount: 0,
      special_instructions: null,
      hotel_preferences: null,
      preferred_cage_id: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      reschedule_count: 0,
      pending_reschedule_fee_amount: null,
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
      booking_group_id: null,
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
    },
    branch: {
      id: 'branch-1',
      name: 'Makati',
      address: null,
      contact_number: null,
    },
    pet: { id: 'pet-1', name: 'Buddy', weight_class: 'M', coat_type: 'SC' },
    owner: { id: 'cust-1', full_name: 'Jane Doe' },
    items: [
      {
        id: 'item-1',
        booking_id: 'booking-1',
        service_id: 'service-1',
        package_id: null,
        price_at_booking: 300,
        duration_minutes_at_booking: 60,
        name: 'Bath',
      },
      {
        id: 'item-2',
        booking_id: 'booking-1',
        service_id: 'service-2',
        package_id: null,
        price_at_booking: 500,
        duration_minutes_at_booking: 90,
        name: 'Haircut',
      },
    ],
    assigned_staff: { id: 'staff-2', display_name: 'Chris Groomer' },
    cage: null,
    discount_name: null,
    promo_name: null,
    group: null,
    payments_visible: true,
    pricing: {
      items_subtotal: 800,
      discount_amount: 0,
      promo_amount: 0,
      total: 800,
      downpayment_amount: null,
      downpayment_required: false,
      amount_paid: 0,
      balance_due: 800,
    },
    transactions: [],
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
  });

  it('renders pet/owner, assigned staff, every booking item, and the total', async () => {
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: buildDetails(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Buddy/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    // Assigned staff name - the gap this page used to have.
    expect(screen.getByText('Chris Groomer')).toBeInTheDocument();
    expect(screen.getByText('Bath')).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    // Subtotal and Total both read ₱800.00 (no discount/promo applied).
    expect(screen.getAllByText('₱800.00').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the applied discount and promo names with their amounts', async () => {
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: buildDetails({
        discount_name: 'Senior Citizen',
        promo_name: 'Grand Opening',
        pricing: {
          items_subtotal: 800,
          discount_amount: 50,
          promo_amount: 25,
          total: 725,
          downpayment_amount: null,
          downpayment_required: false,
          amount_paid: 0,
          balance_due: 725,
        },
      }),
      error: null,
    });

    renderPage();

    expect(await screen.findByText(/Senior Citizen/)).toBeInTheDocument();
    expect(screen.getByText(/Grand Opening/)).toBeInTheDocument();
    expect(screen.getByText('-₱50.00')).toBeInTheDocument();
    expect(screen.getByText('-₱25.00')).toBeInTheDocument();
  });

  it('shows an error banner when the booking fails to load', async () => {
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: null,
      error: 'Booking not found.',
    });

    renderPage();

    expect(await screen.findByText('Booking not found.')).toBeInTheDocument();
  });
});
