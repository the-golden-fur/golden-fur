import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  Booking,
  CancellationLog,
  CreditReviewQueueItem,
} from '../../booking.types';
import { CreditReviewCard } from './CreditReviewCard';

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Hotel',
    booking_source: 'Online',
    scheduled_start: '2026-08-01T00:00:00.000Z',
    scheduled_end: '2026-08-03T00:00:00.000Z',
    assigned_staff_id: null,
    status: 'Cancelled',
    payment_status: 'Partially Paid',
    total_price: 850,
    downpayment_amount: 425,
    downpayment_required: true,
    downpayment_due_at: null,
    payment_method: 'Cash',
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
    cancelled_at: '2026-07-30T00:00:00.000Z',
    cancellation_reason: 'Pet got sick, cannot travel',
    reschedule_count: 0,
    pending_reschedule_fee_amount: null,
    slot_conflict_at: null,
    conflict_notice: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    booking_group_id: null,
    ...overrides,
  };
}

function buildLog(overrides: Partial<CancellationLog> = {}): CancellationLog {
  return {
    id: 'log-1',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-1',
    event_type: 'cancellation',
    notice_period_met: false,
    enforcement_mode_applied: 'Strict',
    policy_violation: true,
    credit_issued: false,
    credit_amount: null,
    reschedule_fee_charged: null,
    credit_review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function buildItem(
  overrides: Partial<CreditReviewQueueItem> = {}
): CreditReviewQueueItem {
  return {
    log: buildLog(),
    booking: buildBooking(),
    amount_paid: 425,
    potential_credit_amount: 425,
    ...overrides,
  };
}

describe('CreditReviewCard', () => {
  it('shows the pet/owner, category, cancellation reason, and the paid/would-credit amounts', () => {
    render(
      createElement(CreditReviewCard, {
        item: buildItem(),
        petName: 'Max',
        ownerName: 'Jamie Cruz',
        onApprove: vi.fn(),
        onDeny: vi.fn(),
        isSubmitting: false,
      })
    );

    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Owner: Jamie Cruz')).toBeInTheDocument();
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(
      screen.getByText('"Pet got sick, cannot travel"')
    ).toBeInTheDocument();
    expect(screen.getByText('Paid: ₱425.00')).toBeInTheDocument();
    expect(screen.getByText('Would credit: ₱425.00')).toBeInTheDocument();
  });

  it('shows a fallback when no cancellation reason was given', () => {
    render(
      createElement(CreditReviewCard, {
        item: buildItem({
          booking: buildBooking({ cancellation_reason: null }),
        }),
        petName: 'Max',
        ownerName: 'Jamie Cruz',
        onApprove: vi.fn(),
        onDeny: vi.fn(),
        isSubmitting: false,
      })
    );

    expect(screen.getByText('No reason given.')).toBeInTheDocument();
  });

  it('calls onApprove and onDeny from their respective buttons', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      createElement(CreditReviewCard, {
        item: buildItem(),
        petName: 'Max',
        ownerName: 'Jamie Cruz',
        onApprove,
        onDeny,
        isSubmitting: false,
      })
    );

    await user.click(screen.getByText('Approve credit'));
    expect(onApprove).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Deny'));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while a decision is in flight', () => {
    render(
      createElement(CreditReviewCard, {
        item: buildItem(),
        petName: 'Max',
        ownerName: 'Jamie Cruz',
        onApprove: vi.fn(),
        onDeny: vi.fn(),
        isSubmitting: true,
      })
    );

    expect(screen.getByText('Approve credit')).toBeDisabled();
    expect(screen.getByText('Deny')).toBeDisabled();
  });
});
