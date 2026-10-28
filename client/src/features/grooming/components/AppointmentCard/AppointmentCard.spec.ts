import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentCard } from './AppointmentCard';
import type { GroomingSession } from '../../grooming.types';
import type { Booking, BookingStatus } from '../../../booking/booking.types';

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'customer-1',
    pet_id: 'pet-1',
    branch_id: 'branch-a',
    created_by_staff_id: null,
    service_category: 'Grooming',
    scheduled_start: '2026-07-19T02:00:00.000Z',
    scheduled_end: '2026-07-19T03:00:00.000Z',
    assigned_staff_id: 'groomer-1',
    status: 'Pending',
    payment_status: 'Pending',
    total_price: 500,
    downpayment_amount: null,
    payment_method: null,
    payment_confirmed: false,
    special_instructions: null,
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
    booking_items: [],
    ...overrides,
  };
}

function buildSession(
  bookingStatus: BookingStatus | undefined = 'Pending',
  overrides: Partial<GroomingSession> = {}
): GroomingSession {
  return {
    id: 'session-1',
    booking_id: 'booking-1',
    assigned_groomer_id: 'groomer-1',
    queue_position: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    booking:
      bookingStatus === undefined
        ? undefined
        : buildBooking({ status: bookingStatus }),
    ...overrides,
  };
}

const baseProps = {
  petName: 'Buddy',
  ownerName: 'Jane Doe',
  breed: 'Golden Retriever',
  weightClass: 'M',
  coatType: 'LC',
  itemLabels: ['Full Groom Package', 'Nail Trim'],
  specialInstructions: 'Puppy cut',
  isAdvancing: false,
};

describe('AppointmentCard (#68, booking-status revision)', () => {
  it('AC-2: shows pet name, owner name, breed, size, coat type, service, add-ons, and instructions', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Pending'),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Golden Retriever/)).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('LC')).toBeInTheDocument();
    expect(screen.getByText('Full Groom Package')).toBeInTheDocument();
    expect(screen.getByText(/Nail Trim/)).toBeInTheDocument();
    expect(screen.getByText(/Puppy cut/)).toBeInTheDocument();
  });

  // Book before assessment: listed so the groomer sees it coming, but it
  // can't be started until front desk assesses the pet and the bill is paid.
  it('a booking awaiting assessment is labelled, explains why, and cannot be started', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Pending', {
          booking: buildBooking({
            status: 'Pending',
            awaiting_assessment: true,
          }),
        }),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.getByText('Awaiting assessment')).toBeInTheDocument();
    expect(screen.getByText(/can't be started until then/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  // Custom change (clear check-in gate, groomer rest-day indicator): a
  // Pending session the server would refuse to start (closed branch, or
  // the assigned groomer's approved day off) shows the reason and disables
  // Start - same pattern as the assessment gate above.
  it('a Pending session blocked by the check-in gate shows the reason and disables Start', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Pending', {
          check_in_blocked_reason:
            "Jane Dela Cruz has an approved Rest Day today - check-in isn't available until they're back.",
        }),
        onAdvance: vi.fn(),
      })
    );

    expect(
      screen.getByText(/has an approved Rest Day today/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('an In Progress session with a check-in block still shows an enabled Complete button - already started, not re-checking-in', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('In Progress', {
          check_in_blocked_reason: 'Makati is closed today (Sunday).',
        }),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.queryByText(/is closed today/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete/i })).toBeEnabled();
  });

  it('an ordinary booking carries no assessment label', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Pending'),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.queryByText('Awaiting assessment')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled();
  });

  it('AC-3: a Pending booking shows a "Start" button that calls onAdvance with In Progress', async () => {
    const onAdvance = vi.fn();
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Pending'),
        onAdvance,
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(onAdvance).toHaveBeenCalledWith('session-1', 'In Progress');
  });

  it('AC-3: an In Progress booking shows a "Complete" button that calls onAdvance with Completed', async () => {
    const onAdvance = vi.fn();
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('In Progress'),
        onAdvance,
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /complete/i }));

    expect(onAdvance).toHaveBeenCalledWith('session-1', 'Completed');
  });

  it('AC-3: a Completed booking shows no status-advance button', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('Completed'),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the shared BookingStatusBadge with the joined booking status', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession('In Progress'),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });
});
