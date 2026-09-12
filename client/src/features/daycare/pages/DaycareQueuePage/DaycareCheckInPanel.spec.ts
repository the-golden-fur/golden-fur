import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as daycareApi from '../../api/daycare.api';
import { getCageSuggestion } from '../../../hotel/api/hotel.api';
import type { Booking } from '../../../booking/booking.types';
import { DaycareCheckInPanel } from './DaycareCheckInPanel';

vi.mock('../../api/daycare.api', () => ({
  checkInDaycareSession: vi.fn(),
}));
vi.mock('../../../hotel/api/hotel.api', () => ({
  getCageSuggestion: vi.fn(),
}));
// Custom change (Daycare/Hotel parity): DaycareCheckInPanel assigns a cage
// the same way HotelCheckInPanel does - CageStatusGrid's own fetch behavior
// is already covered by its own tests, mirrors HotelCheckInPanel.spec.ts's
// identical stub.
vi.mock('../../../hotel/components/CageStatusGrid/CageStatusGrid', () => ({
  CageStatusGrid: () => null,
}));

function setupCageSuggestion() {
  vi.mocked(getCageSuggestion).mockResolvedValue({
    data: {
      suggestedSize: 'M',
      availableCages: [{ id: 'cage-1', cage_label: 'Makati-M-01' }],
    },
    error: null,
  } as never);
}

const BOOKING: Booking = {
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
  status: 'Pending',
  total_price: 300,
  downpayment_amount: null,
  payment_method: null,
  payment_confirmed: true,
  special_instructions: null,
  hotel_preferences: null,
  cancelled_at: null,
  cancellation_reason: null,
  reschedule_count: 0,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
} as unknown as Booking;

function renderPanel(booking: Booking = BOOKING) {
  return render(
    createElement(DaycareCheckInPanel, {
      accessToken: 'token',
      role: 'Receptionist',
      booking,
      onCheckedIn: vi.fn(),
    })
  );
}

describe('DaycareCheckInPanel (#69)', () => {
  it('AC-1: checks in the booking it is given, without a picker', async () => {
    setupCageSuggestion();

    const onCheckedIn = vi.fn();
    vi.mocked(daycareApi.checkInDaycareSession).mockResolvedValue({
      data: {
        id: 'session-1',
        stay_type: 'Daycare',
        booking_id: 'booking-1',
        pet_id: 'pet-1',
        branch_id: 'branch-makati',
        cage_id: 'cage-1',
        created_by_staff_id: 'reception-1',
        status: 'Active',
        check_in_at: '2026-07-19T02:00:00.000Z',
        scheduled_check_out_date: null,
        actual_check_out_at: null,
        downpayment_amount: null,
        extension_fee: null,
        computed_charge: null,
        notify_opt_in: false,
        created_at: '2026-07-19T02:00:00.000Z',
        updated_at: '2026-07-19T02:00:00.000Z',
      },
      error: null,
    });

    render(
      createElement(DaycareCheckInPanel, {
        accessToken: 'token',
        role: 'Receptionist',
        booking: BOOKING,
        onCheckedIn,
      })
    );

    await screen.findByText(/Suggested size: M/);
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(daycareApi.checkInDaycareSession).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        booking_id: 'booking-1',
        cage_id: 'cage-1',
      })
    );
    expect(onCheckedIn).toHaveBeenCalledWith('session-1');
  });

  it('AC-3: a cutoff-blocked check-in shows a clear terminal message and does not clear on its own', async () => {
    setupCageSuggestion();

    vi.mocked(daycareApi.checkInDaycareSession).mockResolvedValue({
      data: null,
      error: 'Check-in unavailable after 4:00 PM',
    });

    renderPanel();

    await screen.findByText(/Suggested size: M/);
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(
      await screen.findByText('Check-in unavailable after 4:00 PM')
    ).toBeInTheDocument();
  });

  it("pre-fills feeding/walking/playing/medications from the booking's own hotel_preferences", async () => {
    setupCageSuggestion();

    renderPanel({
      ...BOOKING,
      hotel_preferences: {
        uniform_instructions: true,
        feeding: [
          {
            meal_time: 'Morning',
            food_type: 'Kibble',
            quantity: '1 cup',
          },
        ],
        walking: [],
        playing: [],
        medications: [],
      },
    } as unknown as Booking);

    expect(await screen.findByDisplayValue('Kibble')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1 cup')).toBeInTheDocument();
  });
});
