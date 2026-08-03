import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import * as staffApi from '../../../staff/api/staff.api';
import * as discountsApi from '../../../discounts/api/discounts.api';
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

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../discounts/api/discounts.api', () => ({
  listDiscounts: vi.fn(),
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
  StaffPickerList: ({ onUnavailable }: { onUnavailable?: () => void }) =>
    createElement(
      'div',
      { 'data-testid': 'staff-picker' },
      onUnavailable
        ? createElement(
            'button',
            {
              type: 'button',
              onClick: () => onUnavailable(),
            },
            'Simulate staff picker unavailable'
          )
        : null
    ),
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
  requires_assessed_pet: true,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

const GROOMING_SERVICE = {
  id: 'service-1',
  category: 'Grooming' as const,
  name: 'Bath',
  base_price: 300,
  duration_minutes: 60,
  is_active: true,
  requires_assessed_pet: true,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

const ASSESSMENT_SERVICE = {
  id: 'service-assessment-1',
  category: 'Misc' as const,
  name: 'Initial Assessment',
  base_price: 0,
  duration_minutes: 30,
  is_active: true,
  requires_assessed_pet: false,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

const UNASSESSED_PET = {
  ...PET,
  id: 'pet-2',
  name: 'Choot',
  weight_class: null,
  coat_type: null,
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
        services: [GROOMING_SERVICE, HOTEL_SERVICE],
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
    vi.mocked(staffApi.listStaff).mockResolvedValue({ data: [], error: null });
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('auto-selects Initial Assessment and hides other category tabs for an unassessed pet', async () => {
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [UNASSESSED_PET],
      error: null,
    });
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [GROOMING_SERVICE, ASSESSMENT_SERVICE, HOTEL_SERVICE],
        packages: [],
        promos: [],
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Choot')).toBeInTheDocument());
    await user.click(screen.getByText('Choot'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    // Only the Misc tab is offered - Grooming/Hotel/Daycare/Veterinary are
    // always dead ends for an unassessed pet.
    await waitFor(() => expect(screen.getByText('Misc')).toBeInTheDocument());
    expect(screen.queryByText('Grooming')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel')).not.toBeInTheDocument();

    // Initial Assessment is pre-selected without the user clicking it.
    await waitFor(() =>
      expect(screen.getByText('Initial Assessment')).toBeInTheDocument()
    );
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeEnabled();
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

  it('Hotel: selecting a second cage replaces the first (one cage per booking)', async () => {
    const SMALL_CAGE = {
      id: 'service-hotel-2',
      category: 'Hotel' as const,
      name: 'Hotel Stay - Small Cage',
      base_price: 500,
      duration_minutes: 1440,
      is_active: true,
      requires_assessed_pet: true,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
    };
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [HOTEL_SERVICE, SMALL_CAGE],
        packages: [],
        promos: [],
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Hotel')).toBeInTheDocument());
    await user.click(screen.getByText('Hotel'));

    const mediumCage = await screen.findByText('Hotel Stay - Medium Cage');
    await user.click(mediumCage);
    // CSS Modules hash class names at build time (e.g. "_selected_a1b2c"),
    // so a substring match on className rather than an exact toHaveClass.
    expect(mediumCage.closest('button')?.className).toMatch(/selected/);

    const smallCage = await screen.findByText('Hotel Stay - Small Cage');
    await user.click(smallCage);

    // Picking the second cage deselects the first - only one cage per
    // booking (a Hotel booking is one cage, not a cart of cages).
    expect(smallCage.closest('button')?.className).toMatch(/selected/);
    expect(mediumCage.closest('button')?.className).not.toMatch(/selected/);
  });

  it('regression: Staff Picker turning out unavailable after being mounted advances past it, not straight to Review & Pay skipping content', async () => {
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
    await user.click(screen.getByText('Select slot'));

    // Lands on the Staff step first, same as the existing "own separate
    // Staff step" test.
    expect(await screen.findByTestId('staff-picker')).toBeInTheDocument();

    // Staff Picker resolves disabled for this branch+category only after
    // mounting - this used to leave the wizard's numeric step index
    // pointing at whatever step slid into the Staff step's old slot
    // (Review & Pay), silently skipping it instead of landing on it
    // properly.
    await user.click(screen.getByText('Simulate staff picker unavailable'));

    await waitFor(() =>
      expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Confirm booking')).toBeInTheDocument();
  });

  it("switching category tabs to browse preserves each tab's own selections", async () => {
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
    // Both the option card and the running total show "PHP 300.00".
    expect(screen.getAllByText('PHP 300.00')).toHaveLength(2);

    // Browse to Hotel - Grooming's total is gone from view (a different
    // category's running total), but Bath itself hasn't been deselected.
    await user.click(screen.getByText('Hotel'));
    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();

    // Switching back to Grooming restores the selection - it was never
    // cleared, just not the active tab.
    await user.click(screen.getByText('Grooming'));
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    expect(screen.getByText('Bath').closest('button')?.className).toMatch(
      /selected/
    );
    expect(screen.getAllByText('PHP 300.00')).toHaveLength(2);
  });

  it('warns when browsing to a different category tab while another tab still has picks', async () => {
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

    // No warning yet - Grooming is both the only category with picks and the
    // active tab, so there's nothing "elsewhere" to warn about.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByText('Hotel'));
    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );

    const notice = screen.getByRole('alert');
    expect(notice.textContent).toContain('Grooming');
    expect(notice.textContent).toContain('Hotel');

    // Switching back to the tab that actually holds the picks clears the
    // warning again.
    await user.click(screen.getByText('Grooming'));
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("selecting an item in a different category clears the previous category's selection", async () => {
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

    // Just browsing to Hotel doesn't clear Grooming's pick yet.
    await user.click(screen.getByText('Hotel'));
    const cage = await screen.findByText('Hotel Stay - Medium Cage');
    expect(screen.getByRole('alert').textContent).toContain('Grooming');

    // Actually selecting something here clears Grooming's pick.
    await user.click(cage);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByText('Grooming'));
    await waitFor(() => expect(screen.queryByText('Bath')).toBeInTheDocument());
    expect(screen.getByText('Bath').closest('button')?.className).not.toMatch(
      /selected/
    );
  });

  it('Hotel: the running total scales with the number of nights', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Hotel')).toBeInTheDocument());
    await user.click(screen.getByText('Hotel'));

    const cage = await screen.findByText('Hotel Stay - Medium Cage');
    await user.click(cage);

    expect(
      screen.getByText('Running total (before promos/discounts)')
    ).toBeInTheDocument();
    expect(screen.getByText('PHP 800.00')).toBeInTheDocument();

    const nightsInput = screen.getByLabelText('Number of nights');
    fireEvent.change(nightsInput, { target: { value: '3' } });

    // 800/night x 3 nights.
    expect(await screen.findByText('PHP 2400.00')).toBeInTheDocument();
  });

  it('Hotel: number of nights survives browsing away to another category and back', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Hotel')).toBeInTheDocument());
    await user.click(screen.getByText('Hotel'));

    const nightsInput = screen.getByLabelText('Number of nights');
    fireEvent.change(nightsInput, { target: { value: '5' } });
    expect(nightsInput).toHaveValue(5);

    // Browse to Grooming and back - nights is not category-scoped state, so
    // it should still read 5 rather than snapping back to the 1 default.
    await user.click(screen.getByText('Grooming'));
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());

    await user.click(screen.getByText('Hotel'));
    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Number of nights')).toHaveValue(5);
  });
});
