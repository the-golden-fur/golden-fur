import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  checkInHotelStay,
  getCageSuggestion,
  getCurrentPrescriptionForPet,
} from '../../api/hotel.api';
import { listCustomerCatalogForStaff } from '../../../catalog/api/catalog.api';
import {
  createFoodItem,
  createMedicationItem,
  listPickableFoodItems,
  listPickableMedicationItems,
} from '../../../staffItems/api/staffItems.api';
import { HotelCheckInPanel } from './HotelCheckInPanel';

vi.mock('../../api/hotel.api', () => ({
  checkInHotelStay: vi.fn(),
  getCageSuggestion: vi.fn(),
  getCurrentPrescriptionForPet: vi.fn(),
}));

vi.mock('../../../catalog/api/catalog.api', () => ({
  listCustomerCatalogForStaff: vi.fn(),
}));

vi.mock('../../../staffItems/api/staffItems.api', () => ({
  listPickableFoodItems: vi.fn(),
  listPickableMedicationItems: vi.fn(),
  createFoodItem: vi.fn(),
  createMedicationItem: vi.fn(),
}));

// Isolates this panel's own validation/pricing logic from
// CageStatusGrid's already-tested internals - swapped for a minimal stub
// that offers one differently-sized (L) cage to pick when selection is on.
vi.mock('../../components/CageStatusGrid/CageStatusGrid', () => ({
  CageStatusGrid: ({
    onSelectCage,
  }: {
    onSelectCage?: (cage: unknown) => void;
  }) =>
    onSelectCage
      ? createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              onSelectCage({
                id: 'cage-l',
                cage_label: 'Makati-L-01',
                size: 'L',
              }),
          },
          'Pick L cage'
        )
      : null,
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
      availableCages: [{ id: 'cage-1', cage_label: 'Makati-S-01', size: 'S' }],
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

  vi.mocked(listPickableFoodItems).mockResolvedValue({ data: [], error: null });
  vi.mocked(listPickableMedicationItems).mockResolvedValue({
    data: [],
    error: null,
  });
  vi.mocked(createFoodItem).mockResolvedValue({ data: null, error: null });
  vi.mocked(createMedicationItem).mockResolvedValue({
    data: null,
    error: null,
  });
}

function renderPanel(booking: unknown = BOOKING) {
  const onCheckedIn = vi.fn();
  return {
    onCheckedIn,
    ...render(
      createElement(
        MemoryRouter,
        null,
        createElement(HotelCheckInPanel, {
          accessToken: 'token',
          role: 'Receptionist',
          booking: booking as never,
          onCheckedIn,
        })
      )
    ),
  };
}

describe('HotelCheckInPanel', () => {
  it('Feeding defaults to the customer booking-time entry, locked until Edit is clicked', async () => {
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
    expect(
      screen.queryByRole('button', { name: 'Add feeding time' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Edit unlocks Feeding too now, same as Walking/Playtime/cage, so staff
    // can correct or confirm the customer's own entry at check-in.
    expect(screen.getByLabelText('Meal time')).not.toBeDisabled();
    expect(
      screen.getByPlaceholderText(
        'Food type - search or type a custom value...'
      )
    ).not.toBeDisabled();
    expect(screen.getByPlaceholderText('Quantity')).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Add feeding time' })
    ).toBeInTheDocument();
  });

  it('clicking Edit unlocks Walking/Playtime/Medications alongside Feeding', async () => {
    setupMocks();
    renderPanel(BOOKING_WITH_CATALOG_FEEDING);

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(
      screen.getByRole('button', { name: 'Done editing' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add walk time' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add playtime' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add feeding time' })
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
    const { onCheckedIn } = renderPanel(BOOKING_WITH_FREETEXT_FEEDING);

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    // No success screen here anymore - the panel hands control straight
    // back to its parent, which navigates away and shows the queue's modal.
    await waitFor(() => expect(onCheckedIn).toHaveBeenCalledWith('stay-1'));

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

  it('warns before checking in to a cage of a different size, and lets staff go back', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockClear();
    renderPanel();

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick L cage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Cage Makati-L-01 is size L, but this pet is size S.'
    );
    expect(checkInHotelStay).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose another cage' })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(checkInHotelStay).not.toHaveBeenCalled();
  });

  it('"Check in anyway" checks the pet in to the different-size cage', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockClear();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    const { onCheckedIn } = renderPanel();

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick L cage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in anyway' }));

    await waitFor(() => expect(onCheckedIn).toHaveBeenCalledWith('stay-1'));
    expect(checkInHotelStay).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ cage_id: 'cage-l' })
    );
  });

  it('checks in with no warning when the cage matches the pet size', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockClear();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    const { onCheckedIn } = renderPanel();

    await screen.findByText(/Suggested size: S/);

    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    await waitFor(() => expect(onCheckedIn).toHaveBeenCalledWith('stay-1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('picking a staff library food item appends a fully pre-filled row with no catalog id', async () => {
    setupMocks();
    vi.mocked(listPickableFoodItems).mockResolvedValue({
      data: [
        {
          id: 'staff-food-1',
          owner_staff_id: 'staff-1',
          name: 'Salmon oil',
          quantity: '2',
          quantity_unit: 'tablespoon',
          special_instructions: 'Mix into dinner',
          photo_url: null,
          is_public: true,
          archived_at: null,
          created_at: '',
          updated_at: '',
          owner_display_name: 'Pat Reyes',
          is_mine: false,
        },
      ],
      error: null,
    });
    vi.mocked(checkInHotelStay).mockClear();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    const { onCheckedIn } = renderPanel();

    await screen.findByText(/Suggested size: S/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const picker = await screen.findByRole('combobox', {
      name: 'Add feeding time from library',
    });
    fireEvent.change(picker, { target: { value: 'staff-food-1' } });

    expect(screen.getByDisplayValue('Salmon oil')).toBeInTheDocument();
    // A row populated from the library has nothing new to save, so the
    // checkbox doesn't render for it.
    expect(
      screen.queryByText('Save to my private library')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    await waitFor(() => expect(onCheckedIn).toHaveBeenCalledWith('stay-1'));
    expect(checkInHotelStay).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        feeding: expect.arrayContaining([
          expect.objectContaining({
            food_type: 'Salmon oil',
            quantity: '2',
            food_catalog_id: undefined,
          }),
        ]),
      })
    );
  });

  it('checking "Save to my private library" on a freetext row creates a new private item on submit', async () => {
    setupMocks();
    vi.mocked(checkInHotelStay).mockClear();
    vi.mocked(checkInHotelStay).mockResolvedValue({
      data: { stay: { id: 'stay-1' } },
      error: null,
    } as never);
    const { onCheckedIn } = renderPanel();

    await screen.findByText(/Suggested size: S/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add feeding time' }));

    const [foodTypeInput] = screen.getAllByPlaceholderText(
      'Food type - search or type a custom value...'
    );
    fireEvent.focus(foodTypeInput);
    fireEvent.change(foodTypeInput, { target: { value: 'Grain-free mix' } });
    const [quantityInput] = screen.getAllByPlaceholderText('Quantity');
    fireEvent.change(quantityInput, { target: { value: '1' } });

    fireEvent.click(screen.getByText('Save to my private library'));
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    await waitFor(() => expect(onCheckedIn).toHaveBeenCalledWith('stay-1'));
    expect(createFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grain-free mix',
        quantity: '1',
        is_public: false,
      }),
      'token'
    );
  });
});
