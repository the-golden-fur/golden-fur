import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  checkInHotelStay,
  getCageSuggestion,
  getCurrentPrescriptionForPet,
} from '../../api/hotel.api';
import { listCustomerCatalogForStaff } from '../../../catalog/api/catalog.api';
import { HotelCheckInPanel } from './HotelCheckInPanel';

vi.mock('../../api/hotel.api', () => ({
  checkInHotelStay: vi.fn(),
  getCageSuggestion: vi.fn(),
  getCurrentPrescriptionForPet: vi.fn(),
}));

vi.mock('../../../catalog/api/catalog.api', () => ({
  listCustomerCatalogForStaff: vi.fn(),
}));

// Isolates this panel's own validation/pricing logic from
// CageStatusGrid's already-tested internals - swapped for a minimal stub.
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
      },
    ],
    walking: [],
    playing: [],
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
    playing: [],
    medications: [],
  },
} as never;

const FOOD_ITEM = {
  id: 'food-1',
  name: 'Dry kibble',
  price: 50,
  is_active: true,
};

function setupMocks() {
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

  vi.mocked(listCustomerCatalogForStaff).mockImplementation(
    (_customerId, _accessToken, category) =>
      Promise.resolve(
        category === 'food'
          ? { data: [FOOD_ITEM], error: null }
          : { data: [], error: null }
      )
  );
}

function renderPanel(booking: unknown = BOOKING) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(HotelCheckInPanel, {
        accessToken: 'token',
        role: 'Receptionist',
        booking: booking as never,
        onCheckedIn: vi.fn(),
      })
    )
  );
}

describe('HotelCheckInPanel', () => {
  it('Care Instructions load read-only - every feeding field is disabled until Edit is clicked', async () => {
    setupMocks();
    renderPanel(BOOKING_WITH_CATALOG_FEEDING);

    await screen.findByText(/Suggested size: S/);

    expect(screen.getByLabelText('Meal time')).toBeDisabled();
    expect(screen.getByLabelText('Meal time')).toHaveValue('Morning');
    expect(
      screen.getByPlaceholderText(
        'Food type - search or type a custom value...'
      )
    ).toBeDisabled();
    expect(screen.getByPlaceholderText('Quantity')).toBeDisabled();
    expect(
      screen.getByPlaceholderText('Special instructions (optional)')
    ).toBeDisabled();
    expect(screen.queryByText(/Hotel supplies this/)).not.toBeInTheDocument();
  });

  it('clicking Edit unlocks every care instruction field, in case the customer made a mistake', async () => {
    setupMocks();
    renderPanel(BOOKING_WITH_CATALOG_FEEDING);

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Meal time')).not.toBeDisabled();
    expect(
      screen.getByPlaceholderText(
        'Food type - search or type a custom value...'
      )
    ).not.toBeDisabled();
    expect(screen.getByPlaceholderText('Quantity')).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Done editing' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add feeding time' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add walk time' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add medication' })
    ).toBeInTheDocument();
  });

  it('#22: a freetext food type from the booking (no catalog match) submits with no catalog id and no billing fields', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    renderPanel(BOOKING_WITH_FREETEXT_FEEDING);

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
          }),
        ],
      })
    );

    const feedingPayload = vi.mocked(checkInHotelStay).mock.calls[0][1]
      .feeding[0] as Record<string, unknown>;
    expect(feedingPayload).not.toHaveProperty('brought_by_customer');
  });
});
