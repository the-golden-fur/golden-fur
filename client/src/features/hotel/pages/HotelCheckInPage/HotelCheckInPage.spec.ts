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

const FOOD_ITEM = {
  id: 'food-1',
  name: 'Dry kibble',
  price: 50,
  is_active: true,
};

function setupMocks() {
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
      { type: 'button', onClick: () => onSelect(BOOKING) },
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
  it('#79 revision: blocks submission with a specific message when a checked meal time has no food type, instead of a generic 400', async () => {
    setupMocks();
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByLabelText('Afternoon'));
    // Leave food type/quantity blank on purpose.

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    expect(
      await screen.findByText('Afternoon feeding is missing a food type.')
    ).toBeInTheDocument();
    expect(checkInHotelStay).not.toHaveBeenCalled();
  });

  it('#79 revision: shows a live running total of hotel-supplied charges as items are marked billable', async () => {
    setupMocks();
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByLabelText('Morning'));

    const combobox = screen.getByPlaceholderText(
      'Food type - search or type a custom value...'
    );
    fireEvent.focus(combobox);
    fireEvent.click(screen.getByText('Dry kibble'));

    expect(
      screen.getByText(
        'Estimated additional charges (hotel-supplied items, billed at checkout):'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 0.00')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Hotel supplies this/));

    expect(screen.getByText('PHP 50.00')).toBeInTheDocument();
  });

  it('a freetext food type (no catalog match) submits as customer-brought with no catalog id', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    renderPage();

    fireEvent.click(await screen.findByText('Pick booking'));
    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByLabelText('Morning'));

    const combobox = screen.getByPlaceholderText(
      'Food type - search or type a custom value...'
    );
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "Owner's own mix" } });
    fireEvent.change(screen.getByPlaceholderText('Quantity'), {
      target: { value: '1 cup' },
    });

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
