import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  checkInHotelStay,
  getCageSuggestion,
  getCurrentPrescriptionForPet,
  listFoodCatalog,
  listMedicationCatalog,
} from '../../api/hotel.api';
import { HotelBookingPicker } from '../../components/HotelBookingPicker/HotelBookingPicker';
import { HotelCheckInPage } from './HotelCheckInPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/hotel.api', () => ({
  checkInHotelStay: vi.fn(),
  getCageSuggestion: vi.fn(),
  getCurrentPrescriptionForPet: vi.fn(),
  listFoodCatalog: vi.fn(),
  listMedicationCatalog: vi.fn(),
}));

// Isolates HotelCheckInPage's own validation/pricing logic from
// HotelBookingPicker's/CageStatusGrid's already-tested internals - each is
// swapped for a minimal stub that exercises this page's callback contract.
vi.mock('../../components/HotelBookingPicker/HotelBookingPicker', () => ({
  HotelBookingPicker: vi.fn(),
}));

vi.mock('../../components/CageStatusGrid/CageStatusGrid', () => ({
  CageStatusGrid: () => null,
}));

const BOOKING = {
  id: 'booking-1',
  pet_id: 'pet-1',
  customer_id: 'cust-1',
  branch_id: 'branch-1',
} as never;

const BOOKING_WITH_CATALOG_FEEDING = {
  ...BOOKING,
  hotel_preferences: {
    feeding: [
      {
        meal_time: 'Morning',
        food_type: 'Dry kibble',
        quantity: '1',
        food_catalog_id: 'food-1',
        brought_by_customer: false,
      },
    ],
    walking: [],
    medications: [],
  },
} as never;

const BOOKING_WITH_FREETEXT_FEEDING = {
  ...BOOKING,
  hotel_preferences: {
    feeding: [
      {
        meal_time: 'Morning',
        food_type: "Owner's own mix",
        quantity: '1 cup',
      },
    ],
    walking: [],
    medications: [],
  },
} as never;

const FOOD_ITEM = {
  id: 'food-1',
  name: 'Dry kibble',
  price: 50,
  is_active: true,
};

function setupMocks(booking: unknown = BOOKING) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'staff-1' },
    accessToken: 'token',
  } as never);

  vi.mocked(getStaffProfile).mockResolvedValue({
    data: { role: 'Receptionist', branch_id: 'branch-1' },
    error: null,
  } as never);

  vi.mocked(getCageSuggestion).mockResolvedValue({
    data: {
      suggestedSize: 'S',
      availableCages: [{ id: 'cage-1', cage_label: 'Makati-S-01' }],
    },
    error: null,
  } as never);

  vi.mocked(getCurrentPrescriptionForPet).mockResolvedValue({
    data: null,
    error: null,
  });

  vi.mocked(listFoodCatalog).mockResolvedValue({
    data: [FOOD_ITEM],
    error: null,
  });

  vi.mocked(listMedicationCatalog).mockResolvedValue({ data: [], error: null });

  vi.mocked(HotelBookingPicker).mockImplementation(({ onSelect }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onSelect(booking as never) },
      'Pick booking'
    )
  );
}

function renderPage() {
  return render(
    createElement(MemoryRouter, null, createElement(HotelCheckInPage))
  );
}

describe('HotelCheckInPage', () => {
  it('Care Instructions load read-only - every feeding field is disabled until Edit is clicked', async () => {
    setupMocks(BOOKING_WITH_CATALOG_FEEDING);
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    expect(screen.getByLabelText('Morning')).toBeDisabled();
    expect(
      screen.getByPlaceholderText('Food type - search or type a custom value...')
    ).toBeDisabled();
    expect(screen.getByPlaceholderText('Quantity')).toBeDisabled();
    expect(screen.getByPlaceholderText('Special instructions (optional)')).toBeDisabled();
    expect(screen.getByText(/Hotel supplies this/).closest('label'))
      .toHaveTextContent('Hotel supplies this');
    expect(
      (screen.getByText(/Hotel supplies this/).closest('label') as HTMLElement)
        .querySelector('input')
    ).toBeDisabled();
  });

  it('clicking Edit unlocks every care instruction field, in case the customer made a mistake', async () => {
    setupMocks(BOOKING_WITH_CATALOG_FEEDING);
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Morning')).not.toBeDisabled();
    expect(
      screen.getByPlaceholderText('Food type - search or type a custom value...')
    ).not.toBeDisabled();
    expect(screen.getByPlaceholderText('Quantity')).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Done editing' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add walk time' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add medication' })
    ).toBeInTheDocument();
  });

  it('shows a running total of hotel-supplied charges computed from the booking-time preferences, with no staff interaction', async () => {
    setupMocks(BOOKING_WITH_CATALOG_FEEDING);
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    expect(
      screen.getByText(
        'Estimated additional charges (hotel-supplied items, billed at checkout):'
      )
    ).toBeInTheDocument();
    // The booking's own preference already set brought_by_customer: false
    // and matched the Dry kibble catalog item (PHP 50) - no staff toggling
    // needed or possible now that this section is read-only.
    expect(screen.getByText('PHP 50.00')).toBeInTheDocument();
  });

  it('a freetext food type from the booking (no catalog match) submits as customer-brought with no catalog id', async () => {
    setupMocks(BOOKING_WITH_FREETEXT_FEEDING);
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    await screen.findByText('Pet checked in successfully.');

    expect(checkInHotelStay).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        feeding: [
          expect.objectContaining({
            food_type: "Owner's own mix",
            food_catalog_id: undefined,
            brought_by_customer: true,
          }),
        ],
      })
    );
  });
});
