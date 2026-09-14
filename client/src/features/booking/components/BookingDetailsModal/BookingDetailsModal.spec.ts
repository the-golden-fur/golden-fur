import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as bookingApi from '../../api/booking.api';
import type { BookingDetails } from '../../booking.types';
import { BookingDetailsModal } from './BookingDetailsModal';

vi.mock('../../api/booking.api', () => ({
  getBookingDetails: vi.fn(),
}));

function details(): BookingDetails {
  return {
    booking: {
      id: 'booking-1',
      customer_id: 'cust-1',
      pet_id: 'pet-1',
      branch_id: 'branch-1',
      created_by_staff_id: null,
      service_category: 'Daycare',
      booking_source: 'Online',
      scheduled_start: '2026-08-03T01:00:00.000Z',
      scheduled_end: '2026-08-03T02:00:00.000Z',
      assigned_staff_id: null,
      status: 'Pending',
      payment_status: 'Pending',
      total_price: 300,
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
      booking_items: [],
    },
    branch: {
      id: 'branch-1',
      name: 'Southwoods',
      address: null,
      contact_number: null,
    },
    pet: { id: 'pet-1', name: 'Milo', weight_class: null, coat_type: null },
    owner: { id: 'cust-1', full_name: 'Pat Owner' },
    items: [],
    assigned_staff: null,
    cage: null,
    discount_name: null,
    promo_name: null,
    group: null,
    payments_visible: true,
    pricing: {
      items_subtotal: 300,
      discount_amount: 0,
      promo_amount: 0,
      total: 300,
      downpayment_amount: null,
      downpayment_required: false,
      amount_paid: 0,
      balance_due: 300,
    },
    transactions: [],
  };
}

function renderModal(bookingId: string | null, onClose = vi.fn()) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'c@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(BookingDetailsModal, { bookingId, onClose })
    )
  );
}

describe('BookingDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while closed and does not fetch', () => {
    renderModal(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bookingApi.getBookingDetails).not.toHaveBeenCalled();
  });

  it('fetches on open and renders the hydrated booking', async () => {
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: details(),
      error: null,
    });

    renderModal('booking-1');

    expect(screen.getByText(/loading booking details/i)).toBeInTheDocument();
    expect(await screen.findByText('Southwoods')).toBeInTheDocument();
    expect(screen.getByText(/Milo/)).toBeInTheDocument();
    expect(bookingApi.getBookingDetails).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it('shows an error banner when the fetch fails', async () => {
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: null,
      error: 'Nope.',
    });

    renderModal('booking-1');

    expect(await screen.findByText('Nope.')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: details(),
      error: null,
    });

    renderModal('booking-1', onClose);

    await screen.findByText('Southwoods');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
