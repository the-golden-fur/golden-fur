import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as customerApi from '../../../customers/api/customer.api';
import * as daycareApi from '../../api/daycare.api';
import { getCageSuggestion } from '../../../hotel/api/hotel.api';
import { DaycareBookingPicker } from '../../components/DaycareBookingPicker/DaycareBookingPicker';
import { DaycareCheckInPanel } from './DaycareCheckInPanel';

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  listCustomers: vi.fn(),
  listCustomerPets: vi.fn(),
  createPet: vi.fn(),
}));
vi.mock('../../components/DaycareBookingPicker/DaycareBookingPicker', () => ({
  DaycareBookingPicker: vi.fn(() => null),
}));
vi.mock('../../api/daycare.api', () => ({
  checkInDaycareSession: vi.fn(),
}));
vi.mock('../../../hotel/api/hotel.api', () => ({
  getCageSuggestion: vi.fn(),
}));
// Custom change (Daycare/Hotel parity): DaycareCheckInPanel now assigns a
// cage the same way HotelCheckInPanel does - CageStatusGrid's own fetch
// behavior is already covered by its own tests, mirrors
// HotelCheckInPanel.spec.ts's identical stub.
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

function renderPanel() {
  return render(
    createElement(DaycareCheckInPanel, {
      accessToken: 'token',
      role: 'Receptionist',
      branchId: 'branch-makati',
      onCheckedIn: vi.fn(),
    })
  );
}

describe('DaycareCheckInPanel (#69)', () => {
  it('AC-1: checks in via an existing Pending booking', async () => {
    setupCageSuggestion();

    const booking = {
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
      cancelled_at: null,
      cancellation_reason: null,
      reschedule_count: 0,
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    };
    vi.mocked(DaycareBookingPicker).mockImplementation(({ onSelect }) =>
      createElement(
        'button',
        { type: 'button', onClick: () => onSelect(booking as never) },
        'Pick booking'
      )
    );
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

    renderPanel();

    await userEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: M/);
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(daycareApi.checkInDaycareSession).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        booking_id: 'booking-1',
        cage_id: 'cage-1',
      })
    );
    expect(
      await screen.findByText(/checked in successfully/i)
    ).toBeInTheDocument();
  });

  it('AC-3: a cutoff-blocked check-in shows a clear terminal message and does not clear on its own', async () => {
    setupCageSuggestion();

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
          pet_type: 'Dog',
          breed_id: null,
          photo_url: null,
          gender: null,
          date_of_birth: null,
          weight_class: 'M',
          coat_type: 'SC',
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

    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /walk-in/i })
    );
    await userEvent.type(
      screen.getByPlaceholderText(/customer email/i),
      'jane@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await userEvent.click(await screen.findByText(/Jane Doe/));
    await userEvent.click(await screen.findByLabelText(/Rex/));
    await screen.findByText(/Suggested size: M/);
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(
      await screen.findByText('Check-in unavailable after 4:00 PM')
    ).toBeInTheDocument();
  });
});
