import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as hotelApi from '../../../hotel/api/hotel.api';
import * as bookingApi from '../../api/booking.api';
import { CustomerBookingFlowPage } from './CustomerBookingFlowPage';

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomerPets: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../hotel/api/hotel.api', () => ({
  listFoodCatalog: vi.fn(),
  listMedicationCatalog: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  getBookingCatalog: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock('../../components/SlotPicker/SlotPicker', () => ({
  SlotPicker: ({
    onSelect,
  }: {
    onSelect: (slot: { start: string; end: string }) => void;
  }) =>
    createElement(
      'button',
      {
        type: 'button',
        onClick: () =>
          onSelect({
            start: '2026-08-03T01:00:00.000Z',
            end: '2026-08-04T01:00:00.000Z',
          }),
      },
      'Select slot'
    ),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: () =>
    createElement('div', { 'data-testid': 'staff-picker' }),
}));

const PET = {
  id: 'pet-1',
  customer_id: 'cust-1',
  name: 'Max',
  pet_type: 'Dog' as const,
  breed_id: null,
  photo_url: null,
  gender: null,
  date_of_birth: null,
  weight_class: 'M' as const,
  coat_type: 'SC' as const,
  created_at: '',
  updated_at: '',
};

const BRANCH = { id: 'branch-1', name: 'Makati', is_vet_branch: true };

const HOTEL_SERVICE = {
  id: 'service-hotel-1',
  category: 'Hotel' as const,
  name: 'Hotel Stay - Medium Cage',
  base_price: 800,
  duration_minutes: 1440,
  is_active: true,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

const CUSTOMER = {
  id: 'cust-1',
  full_name: 'Jamie Cruz',
  contact_number: null,
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: null,
  account_email: 'jamie@example.com',
  primary_auth_provider: 'email' as const,
  facebook_id: null,
  created_at: '',
  updated_at: '',
};

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'customer1@goldenfur.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/portal/book'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/portal/book',
            element: createElement(CustomerBookingFlowPage),
          })
        )
      )
    )
  );
}

function renderStaffPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'receptionist@goldenfur.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/bookings/new'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/bookings/new',
            element: createElement(CustomerBookingFlowPage),
          })
        )
      )
    )
  );
}

describe('CustomerBookingFlowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [PET],
      error: null,
    });
    vi.mocked(customerApi.listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [BRANCH],
      error: null,
    });
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [
          {
            id: 'service-1',
            category: 'Grooming',
            name: 'Bath',
            base_price: 300,
            duration_minutes: 60,
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: '',
            updated_at: '',
          },
          HOTEL_SERVICE,
        ],
        packages: [],
        promos: [],
      },
      error: null,
    });
    vi.mocked(hotelApi.listFoodCatalog).mockResolvedValue({
      data: [
        {
          id: 'food-1',
          name: 'Premium Kibble',
          price: 50,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });
    vi.mocked(hotelApi.listMedicationCatalog).mockResolvedValue({
      data: [
        {
          id: 'med-1',
          name: 'Amoxicillin',
          price: 40,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });
  });

  it('never calls the staff-only GET /bookings/policy or /maintenance/* endpoints (regression: customer 403s)', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Grooming'));

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());

    expect(bookingApi.getBookingCatalog).toHaveBeenCalledWith('token', {
      branchId: 'branch-1',
    });
    expect(hotelApi.listFoodCatalog).not.toHaveBeenCalled();
  });

  it('Grooming/Veterinary: committing a time advances to its own separate Staff step', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Grooming'));

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    // Staff isn't shown yet - it's its own separate step, not merged into
    // Date & Time.
    expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument();

    await user.click(screen.getByText('Select slot'));

    // Committing a time advances straight to the separate Staff step.
    expect(await screen.findByTestId('staff-picker')).toBeInTheDocument();
    expect(screen.queryByText('Select slot')).not.toBeInTheDocument();
  });

  it('staff flow: Care Instructions offers a catalog dropdown, supplier radio, and a price x quantity estimate', async () => {
    const user = userEvent.setup();
    renderStaffPage();

    await waitFor(() =>
      expect(screen.getByText('Jamie Cruz')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Jamie Cruz'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Hotel')).toBeInTheDocument());
    await user.click(screen.getByText('Hotel'));

    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Hotel Stay - Medium Cage'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));

    // Hotel has no Staff step, so selecting a slot auto-advances straight to
    // Care Instructions (handleSlotSelect's own immediate-advance path).
    await waitFor(() =>
      expect(hotelApi.listFoodCatalog).toHaveBeenCalledWith('token')
    );

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: /morning/i })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('checkbox', { name: /morning/i }));

    const foodInput = await screen.findByPlaceholderText('Food type');
    await user.click(foodInput);
    await user.click(await screen.findByText('Premium Kibble'));

    expect(await screen.findByText('Owner will bring it')).toBeInTheDocument();
    const feedingStaffSuppliesRadio = screen.getByRole('radio', {
      name: /staff will purchase it/i,
    });
    await user.click(feedingStaffSuppliesRadio);

    // Default quantity is 1, so the estimate starts at the flat catalog price.
    expect(await screen.findByText('PHP 50.00')).toBeInTheDocument();

    const foodQuantityInput = screen.getByPlaceholderText('Quantity');
    await user.clear(foodQuantityInput);
    await user.type(foodQuantityInput, '3');

    expect(await screen.findByText('PHP 150.00')).toBeInTheDocument();

    // Medications get the same catalog dropdown/radio/price x quantity
    // estimate, with their own client-only quantity field (not part of the
    // submitted payload - dose already encodes amount per administration).
    await user.click(screen.getByText('Add medication'));

    const medicationInput =
      await screen.findByPlaceholderText('Medication name');
    await user.click(medicationInput);
    await user.click(await screen.findByText('Amoxicillin'));

    const medicationRadios = screen.getAllByRole('radio', {
      name: /staff will purchase it/i,
    });
    await user.click(medicationRadios[medicationRadios.length - 1]);

    // Default quantity is 1, so the estimate starts at the flat catalog price.
    expect(await screen.findByText('PHP 40.00')).toBeInTheDocument();

    const medicationQuantityInput =
      screen.getAllByPlaceholderText('Quantity')[1];
    await user.clear(medicationQuantityInput);
    await user.type(medicationQuantityInput, '2');

    expect(await screen.findByText('PHP 80.00')).toBeInTheDocument();
  }, 15000); // vitest's 5s default. // busy full-suite run (vs. this file in isolation) doesn't flake on // Long, many-step walk through the whole flow - generous timeout so a
});
