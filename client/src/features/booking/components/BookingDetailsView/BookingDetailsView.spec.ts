import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BookingDetailsView } from './BookingDetailsView';
import type { BookingDetails } from '../../booking.types';

function buildDetails(overrides: Partial<BookingDetails> = {}): BookingDetails {
  return {
    booking: {
      id: 'booking-1',
      customer_id: 'cust-1',
      pet_id: 'pet-1',
      branch_id: 'branch-1',
      created_by_staff_id: null,
      service_category: 'Grooming',
      booking_source: 'Online',
      scheduled_start: '2026-08-03T01:00:00.000Z',
      scheduled_end: '2026-08-03T02:00:00.000Z',
      assigned_staff_id: 'staff-2',
      status: 'Completed',
      payment_status: 'Fully Paid',
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
      booking_items: [],
    },
    branch: {
      id: 'branch-1',
      name: 'Makati',
      address: null,
      contact_number: null,
    },
    pet: { id: 'pet-1', name: 'Buddy', weight_class: null, coat_type: null },
    owner: { id: 'cust-1', full_name: 'Jane Doe' },
    items: [
      {
        id: 'item-1',
        booking_id: 'booking-1',
        service_id: 'service-1',
        package_id: null,
        price_at_booking: 800,
        duration_minutes_at_booking: 60,
        name: 'Full Groom',
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
      amount_paid: 800,
      balance_due: 0,
    },
    transactions: [
      {
        id: 'txn-1',
        total_amount: 800,
        payment_choice: 'full',
        payment_status: 'Fully Paid',
        payment_method: 'GCash',
        bank_name: null,
        credit_applied_amount: 0,
        payment_reference: null,
        created_at: '2026-07-16T00:00:00.000Z',
        webhook_confirmed_at: null,
      },
    ],
    ...overrides,
  };
}

describe('BookingDetailsView', () => {
  it('renders branch, assigned staff, items, payments and the balance rollup', () => {
    render(createElement(BookingDetailsView, { data: buildDetails() }));

    expect(screen.getByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('Chris Groomer')).toBeInTheDocument();
    expect(screen.getByText('Full Groom')).toBeInTheDocument();
    expect(screen.getByText('Full payment')).toBeInTheDocument();
    // Paid ₱800.00, remaining ₱0.00.
    expect(screen.getByText('₱0.00')).toBeInTheDocument();
    expect(screen.getByText('Payment: Fully Paid')).toBeInTheDocument();
  });

  it('shows "Not assigned" / "—" when no staff or cage is set (non-Hotel)', () => {
    render(
      createElement(BookingDetailsView, {
        data: buildDetails({ assigned_staff: null }),
      })
    );

    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the cage label and care instructions for a Hotel booking', () => {
    const data = buildDetails({
      booking: {
        ...buildDetails().booking,
        service_category: 'Hotel',
        scheduled_start: '2026-08-03T00:00:00.000Z',
        scheduled_end: '2026-08-05T00:00:00.000Z',
        hotel_preferences: {
          uniform_instructions: true,
          feeding: [
            {
              meal_time: 'Morning',
              food_type: 'Kibble',
              quantity: '1',
              quantity_unit: 'cup',
            },
          ],
          walking: [],
          playing: [],
          medications: [],
        },
      },
      cage: { id: 'cage-1', cage_label: 'A1', size: 'M' },
    });

    render(createElement(BookingDetailsView, { data }));

    expect(screen.getByText('A1 (M)')).toBeInTheDocument();
    expect(screen.getByText('Care instructions')).toBeInTheDocument();
    expect(screen.getByText('Morning — Kibble (1 cup)')).toBeInTheDocument();
  });

  it('hides the Payments section entirely when payments are not visible to the viewer', () => {
    render(
      createElement(BookingDetailsView, {
        data: buildDetails({ payments_visible: false, transactions: [] }),
      })
    );

    expect(screen.queryByText('Payments')).not.toBeInTheDocument();
    expect(screen.queryByText('Remaining balance')).not.toBeInTheDocument();
  });

  it('notes when the booking is part of a bundled group', () => {
    const groupData = buildDetails({
      group: {
        id: 'group-1',
        customer_id: 'cust-1',
        branch_id: 'branch-1',
        created_by_staff_id: null,
        selected_discount_id: null,
        selected_promo_id: null,
        discount_amount: 0,
        promo_amount: 0,
        net_total: 800,
        downpayment_amount: null,
        downpayment_required: false,
        downpayment_due_at: null,
        payment_status: 'Fully Paid',
        paid_at: null,
        created_at: '',
        updated_at: '',
      },
    });

    render(createElement(BookingDetailsView, { data: groupData }));

    expect(screen.getByText(/part of a bundled booking/i)).toBeInTheDocument();
  });
});
