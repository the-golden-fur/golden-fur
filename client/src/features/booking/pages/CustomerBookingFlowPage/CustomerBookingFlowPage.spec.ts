import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as catalogApi from '../../../catalog/api/catalog.api';
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

vi.mock('../../../catalog/api/catalog.api', () => ({
  listCustomerCatalog: vi.fn(),
  listCustomerCatalogForStaff: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  getBookingCatalog: vi.fn(),
  createBooking: vi.fn(),
  getNextAvailableSlot: vi.fn(),
  // Custom change: Service Types addendum - default to an empty list so
  // every existing test keeps seeing every ServiceCategory under its plain
  // literal label (today's behavior, unchanged).
  listServiceTypes: vi.fn().mockResolvedValue({ data: [], error: null }),
  // Custom change: duplicate-booking prevention - default to no conflicts
  // so every existing test's pet selection is unaffected.
  getPetBookingConflicts: vi.fn().mockResolvedValue({ data: [], error: null }),
  // Custom change: per-transaction downpayment config - default to
  // disabled so every existing test's pricing summary is unaffected.
  getDownpaymentStatus: vi.fn().mockResolvedValue({
    data: {
      downpayment_enabled: false,
      downpayment_type: null,
      downpayment_amount: null,
    },
    error: null,
  }),
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
    onAvailabilityChange,
    lockToNow,
  }: {
    onSelect: (slot: { start: string; end: string }) => void;
    onAvailabilityChange?: (info: {
      date: string;
      hasAnyAvailable: boolean;
      hasAnySlots: boolean;
    }) => void;
    // Walk-in booking flow: surfaced by the mock so page-level tests can
    // assert it's actually threaded through from bookingSource, without
    // re-testing SlotPicker's own lockToNow behavior (covered by
    // SlotPicker.spec.ts).
    lockToNow?: boolean;
  }) =>
    createElement(
      'div',
      null,
      lockToNow
        ? createElement(
            'span',
            { 'data-testid': 'slot-picker-locked' },
            'Walk-in — starting now'
          )
        : null,
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
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            onAvailabilityChange?.({
              date: '2026-08-03',
              hasAnyAvailable: false,
              hasAnySlots: true,
            }),
        },
        'Simulate day fully booked'
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            onAvailabilityChange?.({
              date: '2026-08-03',
              hasAnyAvailable: false,
              hasAnySlots: false,
            }),
        },
        'Simulate empty day (closed/past hours)'
      )
    ),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: ({
    onSelect,
    onUnavailable,
  }: {
    onSelect: (preference: { type: 'no_preference' }) => void;
    onUnavailable?: () => void;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'staff-picker' },
      createElement(
        'button',
        { type: 'button', onClick: () => onSelect({ type: 'no_preference' }) },
        'Pick no preference'
      ),
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
// Custom change: Cage Picker addendum - mocked the same way as
// StaffPickerList above, so existing tests never hit the real
// GET /bookings/cage-picker call.
vi.mock('../../components/CagePickerList/CagePickerList', () => ({
  CagePickerList: ({
    onSelect,
    onUnavailable,
  }: {
    onSelect: (preference: { type: 'no_preference' }) => void;
    onUnavailable?: () => void;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'cage-picker-list' },
      createElement(
        'button',
        { type: 'button', onClick: () => onSelect({ type: 'no_preference' }) },
        'Pick no cage preference'
      ),
      onUnavailable
        ? createElement(
            'button',
            {
              type: 'button',
              onClick: () => onUnavailable(),
            },
            'Simulate cage picker unavailable'
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

const GOLDEN_PACKAGE = {
  id: 'package-golden-1',
  branch_id: 'branch-1',
  name: 'Golden Package',
  bundled_price: 630,
  total_duration_minutes: 90,
  is_active: true,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  archived_at: null,
  package_services: [{ service_id: 'service-1' }],
};

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
    // Draft autosave/restore persists to real localStorage (must survive an
    // actual browser close, so sessionStorage won't do) - jsdom's
    // localStorage otherwise leaks a draft written by one test into the
    // next.
    localStorage.clear();
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
    // #22: fails open by default (error, not a real "fully booked" result)
    // so the fully-booked modal doesn't interfere with tests that aren't
    // exercising that feature - goNext() advances straight through on error.
    vi.mocked(bookingApi.getNextAvailableSlot).mockResolvedValue({
      data: null,
      error: 'not mocked in this test',
    });
    const FOOD_ITEM = {
      id: 'food-1',
      name: 'Premium Kibble',
      category: 'food',
      service_scope: 'hotel',
      price: 0,
      is_active: true,
      archived_at: null,
      created_at: '',
      updated_at: '',
      owner_customer_id: null,
    };
    const MEDICATION_ITEM = {
      id: 'med-1',
      name: 'Amoxicillin',
      category: 'medication',
      service_scope: 'hotel',
      price: 0,
      is_active: true,
      archived_at: null,
      created_at: '',
      updated_at: '',
      owner_customer_id: null,
    };
    const catalogByCategory = (category?: string) =>
      Promise.resolve(
        category === 'medication'
          ? { data: [MEDICATION_ITEM], error: null }
          : { data: [FOOD_ITEM], error: null }
      );
    vi.mocked(catalogApi.listCustomerCatalog).mockImplementation(
      (_accessToken, category) => catalogByCategory(category)
    );
    vi.mocked(catalogApi.listCustomerCatalogForStaff).mockImplementation(
      (_customerId, _accessToken, category) => catalogByCategory(category)
    );
    vi.mocked(staffApi.listStaff).mockResolvedValue({ data: [], error: null });
    vi.mocked(discountsApi.listDiscounts).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('Custom change (duplicate-booking prevention): a pet with an unresolved booking (any category) stays on the Pet step and never advances', async () => {
    vi.mocked(bookingApi.getPetBookingConflicts).mockResolvedValue({
      data: [
        {
          pet_id: 'pet-1',
          booking_id: 'booking-existing',
          service_category: 'Grooming',
          scheduled_start: '2026-08-10T08:00:00.000Z',
        },
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    const petButton = screen.getByText('Max').closest('button')!;
    expect(petButton).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    // Still stuck on the Pet step - Branch (the next step) never appeared.
    expect(screen.queryByText('Makati')).not.toBeInTheDocument();
  });

  it('Custom change (duplicate-booking prevention): clicking a conflicted pet shows a prompt linking to the existing booking instead of selecting it', async () => {
    vi.mocked(bookingApi.getPetBookingConflicts).mockResolvedValue({
      data: [
        {
          pet_id: 'pet-1',
          booking_id: 'booking-existing',
          service_category: 'Grooming',
          scheduled_start: '2026-08-10T08:00:00.000Z',
        },
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));

    expect(
      await screen.findByText(/Max already has a Grooming booking on/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go to My Bookings' })
    ).toBeInTheDocument();
  });

  it('Custom change (duplicate-booking prevention): a pet with no conflict remains selectable as normal', async () => {
    vi.mocked(bookingApi.getPetBookingConflicts).mockResolvedValue({
      data: [],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    const petButton = screen.getByText('Max').closest('button')!;
    expect(petButton).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
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

    await user.click(screen.getByText('Next'));
    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));
    await user.click(screen.getByText('Next'));

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
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));
    await screen.findByTestId('staff-picker');
    await user.click(screen.getByText('Pick no preference'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());

    expect(bookingApi.getBookingCatalog).toHaveBeenCalledWith('token', {
      branchId: 'branch-1',
    });
    expect(catalogApi.listCustomerCatalog).not.toHaveBeenCalled();
  });

  it('#22: Grooming/Veterinary: Staff Picker is merged into the availability step, appearing only once a slot is picked', async () => {
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
    // #22: category selection is its own step now - items aren't shown here.
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    // Staff isn't shown yet - only once a slot is picked, same step.
    expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument();

    await user.click(screen.getByText('Select slot'));

    // Staff Picker appears in the same 'availability' step, not a separate
    // one - "Select slot" stays on screen alongside it.
    expect(await screen.findByTestId('staff-picker')).toBeInTheDocument();
    expect(screen.getByText('Select slot')).toBeInTheDocument();

    // Items only appear after explicitly advancing past the availability step,
    // which requires a staff preference too (Grooming/Veterinary).
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeDisabled();

    await user.click(screen.getByText('Pick no preference'));
    await user.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
  });

  it('#22: staff flow: Care Instructions offers a catalog dropdown with no staff-buy option', async () => {
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
    await user.click(screen.getByText('Next'));

    // Walk-in booking flow: receptionist mode gets a Booking Type step
    // before availability now - 'Online' is the default, so just advance
    // past it without changing anything.
    await waitFor(() =>
      expect(screen.getByText('Online Booking')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    // Hotel gets no Staff Picker in the availability step - no
    // staff-picker testid should ever appear for this category.
    expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument();
    await user.click(screen.getByText('Select slot'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Hotel Stay - Medium Cage'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(catalogApi.listCustomerCatalogForStaff).toHaveBeenCalledWith(
        'cust-1',
        'token',
        'food'
      )
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add feeding time' })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Add feeding time' }));

    const foodInput = await screen.findByPlaceholderText('Food type');
    await user.click(foodInput);
    await user.click(await screen.findByText('Premium Kibble'));

    // No staff-buy option anywhere (#22) - it placed liability risk on
    // staff that the business no longer wants.
    expect(screen.queryByText('Owner will bring it')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /staff will purchase it/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('Add medication'));

    const medicationInput =
      await screen.findByPlaceholderText('Medication name');
    await user.click(medicationInput);
    await user.click(await screen.findByText('Amoxicillin'));

    expect(
      screen.queryAllByRole('radio', { name: /staff will purchase it/i })
    ).toHaveLength(0);

    // Playtime, added alongside walking (#22).
    expect(
      screen.getByRole('button', { name: 'Add playtime' })
    ).toBeInTheDocument();
  }, 15000); // vitest's 5s default. // busy full-suite run (vs. this file in isolation) doesn't flake on // Long, many-step walk through the whole flow - generous timeout so a

  it('Custom change (Daycare/Hotel parity follow-up): Daycare gets the same Care Instructions step as Hotel', async () => {
    const DAYCARE_SERVICE = {
      id: 'service-daycare-1',
      category: 'Daycare' as const,
      name: 'Daycare (per hour)',
      base_price: 100,
      duration_minutes: 60,
      is_active: true,
      requires_assessed_pet: true,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
      first_hour_fee: 100,
      succeeding_hour_fee: 50,
      daycare_overnight_fee: 850,
    };
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [GROOMING_SERVICE, DAYCARE_SERVICE],
        packages: [],
        promos: [],
      },
      error: null,
    });
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: {
        id: 'booking-1',
        status: 'Confirmed',
        scheduled_start: '2026-08-03T01:00:00.000Z',
      } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    await user.click(screen.getByText('Daycare'));
    // Daycare has no Staff Picker step.
    await advanceThroughAvailability(user, { staff: false });

    await waitFor(() =>
      expect(screen.getByText('Daycare (per hour)')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Daycare (per hour)'));
    await user.click(screen.getByText('Next'));

    // The step that used to only exist for Hotel now appears for Daycare
    // too, with the same feeding/walking/playtime/medications sections
    // (no per-night toggle - a Daycare session is a single day).
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add feeding time' })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Same instructions every night')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add feeding time' }));
    const foodInput = await screen.findByPlaceholderText('Food type');
    await user.click(foodInput);
    await user.click(await screen.findByText('Premium Kibble'));

    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Confirm booking')).toBeInTheDocument()
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Cash' } });
    await user.click(screen.getByText('Confirm booking'));

    await waitFor(() =>
      expect(bookingApi.createBooking).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          service_category: 'Daycare',
          hotel_preferences: expect.objectContaining({
            feeding: [
              expect.objectContaining({
                food_type: 'Premium Kibble',
                food_catalog_id: 'food-1',
              }),
            ],
          }),
        })
      )
    );
  });

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
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));
    await user.click(screen.getByText('Next'));

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

  it('#22: Staff Picker turning out unavailable mid-availability-step lets the wizard still advance normally (no staff preference required)', async () => {
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
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));

    expect(await screen.findByTestId('staff-picker')).toBeInTheDocument();
    // Next is disabled - a staff preference is still required while the
    // picker looks available.
    expect(screen.getByText('Next')).toBeDisabled();

    await user.click(screen.getByText('Simulate staff picker unavailable'));

    // Once unavailable, the picker disappears and Next no longer requires
    // a staff preference (there's nothing to prefer among).
    await waitFor(() =>
      expect(screen.queryByTestId('staff-picker')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Next')).toBeEnabled();

    await user.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    await user.click(screen.getByText('Next'));

    expect(screen.getByText('Confirm booking')).toBeInTheDocument();
  });

  /** #22: category selection and item selection are now separate steps, so
   * "browsing categories" only happens at the category step - this helper
   * walks pet/branch, lands on the category step, and (optionally) drives
   * a category all the way through to the items step. */
  async function goToCategoryStep(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
  }

  async function advanceThroughAvailability(
    user: ReturnType<typeof userEvent.setup>,
    { staff }: { staff: boolean }
  ) {
    await user.click(screen.getByText('Next'));
    await waitFor(() =>
      expect(screen.getByText('Select slot')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Select slot'));
    if (staff) {
      await screen.findByTestId('staff-picker');
      await user.click(screen.getByText('Pick no preference'));
    }
    await user.click(screen.getByText('Next'));
  }

  function serviceType(overrides: {
    key: string;
    name?: string;
    is_active?: boolean;
  }) {
    return {
      id: `st-${overrides.key}`,
      key: overrides.key,
      name: overrides.name ?? overrides.key,
      is_active: overrides.is_active ?? true,
      staff_picker_enabled: false,
      cage_picker_enabled: false,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
    };
  }

  it('Service Types addendum: a newly created, active service type with a brand-new key shows up in the Service Type step', async () => {
    vi.mocked(bookingApi.listServiceTypes).mockResolvedValue({
      data: [
        serviceType({ key: 'Grooming' }),
        serviceType({ key: 'Hotel' }),
        serviceType({ key: 'Daycare' }),
        serviceType({ key: 'Veterinary' }),
        serviceType({ key: 'Boarding', name: 'Overnight Boarding' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    // Exact name, not /Overnight Boarding/ - each card now also has an
    // "About <label>" ⓘ trigger button whose name would match a substring.
    expect(
      screen.getByRole('button', { name: 'Overnight Boarding' })
    ).toBeInTheDocument();
  });

  it('Service Types addendum: an inactive custom service type stays hidden from the Service Type step', async () => {
    vi.mocked(bookingApi.listServiceTypes).mockResolvedValue({
      data: [
        serviceType({ key: 'Grooming' }),
        serviceType({
          key: 'Boarding',
          name: 'Overnight Boarding',
          is_active: false,
        }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    expect(
      screen.queryByRole('button', { name: 'Overnight Boarding' })
    ).not.toBeInTheDocument();
  });

  it("the Service Type step's ⓘ button previews what the type covers plus its read-only service list for the branch", async () => {
    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    await user.click(screen.getByRole('button', { name: 'About Grooming' }));

    // GROOMING_SERVICE from the mocked branch catalog, shown read-only as a
    // plain name (no checkbox / clickable option, no price). findBy waits
    // out the catalog fetch, same as the Services-step tests.
    await screen.findByText('Bath');
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/bathing, brushing, haircuts/);
    expect(note).toHaveTextContent('Bath');
    // HOTEL_SERVICE belongs to another type and must not leak in here.
    expect(note).not.toHaveTextContent('Hotel Stay - Medium Cage');
  });

  it('the Service Type ⓘ popover for a custom type with no built-in definition shows only its service list, and the empty-state line when the branch has none', async () => {
    vi.mocked(bookingApi.listServiceTypes).mockResolvedValue({
      data: [
        serviceType({ key: 'Grooming' }),
        serviceType({ key: 'Boarding', name: 'Overnight Boarding' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    await user.click(
      screen.getByRole('button', { name: 'About Overnight Boarding' })
    );

    // No CATEGORY_DESCRIPTIONS entry for a custom key - the definition
    // paragraph is omitted, and the mocked catalog (loaded once the "no
    // services" line replaces "Loading services...") has no 'Boarding'
    // service, so the empty-state line shows instead of a list.
    await screen.findByText('No services are listed for this branch yet.');
    const note = screen.getByRole('note');
    expect(note).not.toHaveTextContent(/bathing, brushing/);
  });

  it("switching category tabs clears the previous tab's selection immediately, with no warning", async () => {
    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);

    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    // Both the option card and the running total show "PHP 300.00".
    expect(screen.getAllByText('PHP 300.00')).toHaveLength(2);

    // Back to category step, switch to Hotel - Bath's pick is dropped the
    // moment the category actually changes, not just once something new is
    // picked - so there's nothing left to warn about.
    await user.click(screen.getByText('Back'));
    await user.click(screen.getByText('Back'));
    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Hotel'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advanceThroughAvailability(user, { staff: false });
    await waitFor(() =>
      expect(screen.getByText('Hotel Stay - Medium Cage')).toBeInTheDocument()
    );
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();

    // Switching back to Grooming does NOT restore the dropped selection.
    await user.click(screen.getByText('Back'));
    await user.click(screen.getByText('Back'));
    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });
    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
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
    // #22: number of nights now lives on the availability step, alongside
    // Cage & Date - not on the items step where the running total shows.
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByLabelText('Number of nights')).toBeInTheDocument()
    );
    const nightsInput = screen.getByLabelText('Number of nights');
    fireEvent.change(nightsInput, { target: { value: '3' } });
    expect(nightsInput).toHaveValue(3);

    await user.click(screen.getByText('Select slot'));
    await user.click(screen.getByText('Next'));

    const cage = await screen.findByText('Hotel Stay - Medium Cage');
    await user.click(cage);

    // Now shows "... × 3 nights" alongside the label - regex to match
    // regardless of the multiplier suffix.
    expect(
      screen.getByText(/Running total \(before promos\/discounts\)/)
    ).toBeInTheDocument();
    // 800/night x 3 nights, set back on the availability step.
    expect(screen.getByText('PHP 2400.00')).toBeInTheDocument();
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
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByLabelText('Number of nights')).toBeInTheDocument()
    );
    const nightsInput = screen.getByLabelText('Number of nights');
    fireEvent.change(nightsInput, { target: { value: '5' } });
    expect(nightsInput).toHaveValue(5);

    // Browse back to category step, over to Grooming and back to Hotel -
    // nights is not category-scoped state, so it should still read 5
    // rather than snapping back to the 1 default.
    await user.click(screen.getByText('Back'));
    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Grooming'));
    await user.click(screen.getByText('Hotel'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByLabelText('Number of nights')).toHaveValue(5)
    );
  });

  it('#22 follow-up: an empty day (branch closed or past hours) never shows the fully-booked modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(
        screen.getByText('Simulate empty day (closed/past hours)')
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByText('Simulate empty day (closed/past hours)')
    );

    expect(bookingApi.getNextAvailableSlot).not.toHaveBeenCalled();
    expect(
      screen.queryByText('This looks fully booked')
    ).not.toBeInTheDocument();
  });

  it('#22 follow-up: a day with real slots all taken shows the fully-booked modal and searches from the next day', async () => {
    vi.mocked(bookingApi.getNextAvailableSlot).mockResolvedValue({
      data: {
        date: '2026-08-05',
        earliestSlot: {
          start: '2026-08-05T00:00:00.000Z',
          end: '2026-08-05T01:00:00.000Z',
        },
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Simulate day fully booked')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Simulate day fully booked'));

    expect(
      await screen.findByText('This looks fully booked')
    ).toBeInTheDocument();
    expect(bookingApi.getNextAvailableSlot).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ fromDate: '2026-08-04' })
    );
  });

  it('#22 follow-up regression: toggling a service/package on the Services step no longer wipes the already-picked slot (submit actually fires)', async () => {
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: {
        id: 'booking-1',
        status: 'Confirmed',
        scheduled_start: '2026-08-03T01:00:00.000Z',
      } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    // Toggling it off and back on again must not disturb the slot/staff
    // preference already committed on the previous step.
    await user.click(screen.getByText('Bath'));
    await user.click(screen.getByText('Bath'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Confirm booking')).toBeInTheDocument()
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Cash' } });

    await user.click(screen.getByText('Confirm booking'));

    await waitFor(() => expect(bookingApi.createBooking).toHaveBeenCalled());
    const payload = vi.mocked(bookingApi.createBooking).mock.calls[0][1];
    expect(payload.scheduled_start).toBe('2026-08-03T01:00:00.000Z');
    expect(payload.scheduled_end).toBeTruthy();
  });

  it('#22 follow-up: selecting a package deselects and disables its member services', async () => {
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [GROOMING_SERVICE, HOTEL_SERVICE],
        packages: [GOLDEN_PACKAGE],
        promos: [],
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    expect(screen.getByText('Bath').closest('button')?.className).toMatch(
      /selected/
    );

    await user.click(screen.getByText('Package'));
    await user.click(screen.getByText('Golden Package'));

    // Selecting the package deselects Bath and switching back to the
    // Individual service tab shows it disabled, tagged as included.
    await user.click(screen.getByText('Individual service'));
    const bathCard = screen.getByText('Bath').closest('button');
    expect(bathCard?.className).not.toMatch(/selected/);
    expect(bathCard).toBeDisabled();
    expect(screen.getByText('Included in Golden Package')).toBeInTheDocument();

    // Clicking the disabled card does nothing.
    await user.click(bathCard!);
    expect(bathCard?.className).not.toMatch(/selected/);
  });

  // Browser-close-safe draft autosave/restore - keyed off the signed-in
  // customer's own id (renderPage's user.id is 'cust-1'), matching
  // bookingDraftStorageKey's customer-mode branch.
  const CUSTOMER_DRAFT_KEY = 'booking-draft:customer:cust-1';

  function seedDraft(overrides: Record<string, unknown> = {}) {
    localStorage.setItem(
      CUSTOMER_DRAFT_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        selectedPetId: 'pet-1',
        selectedBranchId: '',
        category: '',
        selectionMode: 'service',
        selectionsByCategory: {},
        selectedSlot: null,
        hotelNights: 1,
        selectedPromoId: '',
        selectedDiscountId: '',
        paymentMethod: '',
        paymentChoice: 'downpayment',
        specialInstructions: '',
        hotelFeeding: [],
        hotelWalking: [],
        hotelPlaying: [],
        hotelMedications: [],
        currentStepKey: 'branch',
        reachedStepKeys: ['pet', 'branch'],
        walkInCustomer: null,
        ...overrides,
      })
    );
  }

  it('restores an in-progress draft on mount and shows the restored banner', async () => {
    seedDraft();

    renderPage();

    expect(
      await screen.findByText('We restored your in-progress booking.')
    ).toBeInTheDocument();
    // currentStepKey was restored to 'branch' - the wizard should land
    // there directly instead of back at the blank Pet step.
    expect(await screen.findByText('Makati')).toBeInTheDocument();
  });

  it('"Start over" clears the restored state and the stored draft', async () => {
    seedDraft();

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('We restored your in-progress booking.');
    await user.click(screen.getByText('Start over'));

    expect(
      screen.queryByText('We restored your in-progress booking.')
    ).not.toBeInTheDocument();
    // Back at a blank wizard - the Pet step, not the restored Branch step.
    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(localStorage.getItem(CUSTOMER_DRAFT_KEY)).toBeNull();
  });

  it('submitting a booking clears the stored draft', async () => {
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: {
        id: 'booking-1',
        status: 'Confirmed',
        scheduled_start: '2026-08-03T01:00:00.000Z',
      } as never,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Confirm booking')).toBeInTheDocument()
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Cash' } });
    await user.click(screen.getByText('Confirm booking'));

    await waitFor(() =>
      expect(screen.getByText('Booking confirmed')).toBeInTheDocument()
    );
    expect(localStorage.getItem(CUSTOMER_DRAFT_KEY)).toBeNull();
  });

  it('Review & Pay shows the down-payment split (due now / balance later) for an online booking when the branch policy is enabled', async () => {
    vi.mocked(bookingApi.getDownpaymentStatus).mockResolvedValue({
      data: {
        downpayment_enabled: true,
        downpayment_type: 'Flat',
        downpayment_amount: 100,
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await goToCategoryStep(user);
    await user.click(screen.getByText('Grooming'));
    await advanceThroughAvailability(user, { staff: true });

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
    await user.click(screen.getByText('Bath')); // base_price 300
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Confirm booking')).toBeInTheDocument()
    );

    // Own emphasised rows in the pricing box, not the old grey helper line.
    expect(screen.getByText('Downpayment due now')).toBeInTheDocument();
    expect(screen.getByText('PHP 100.00')).toBeInTheDocument();
    expect(screen.getByText('Balance due later')).toBeInTheDocument();
    expect(screen.getByText('PHP 200.00')).toBeInTheDocument();
  });

  it('does not restore (or show a banner for) a draft older than 24 hours', async () => {
    seedDraft({ savedAt: Date.now() - 25 * 60 * 60 * 1000 });

    renderPage();

    // Blank wizard - back at the Pet step, not the draft's restored Branch
    // step - and no banner, since there's nothing to tell the user about a
    // silently-dropped stale draft.
    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(
      screen.queryByText('We restored your in-progress booking.')
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(CUSTOMER_DRAFT_KEY)).toBeNull();
  });

  // Walk-in booking flow (custom change): new 'bookingType' step, gated to
  // receptionist mode, with a lockToNow SlotPicker + restricted payment
  // methods + hidden downpayment UI once 'Walk-in' is selected.
  describe('walk-in booking flow (custom change)', () => {
    /** Walks a fresh receptionist-mode render through customer/pet/branch/
     * category to land on the new 'bookingType' step. */
    async function goToBookingTypeStep(
      user: ReturnType<typeof userEvent.setup>
    ) {
      await waitFor(() =>
        expect(screen.getByText('Jamie Cruz')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Jamie Cruz'));
      await user.click(screen.getByText('Next'));

      await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
      await user.click(screen.getByText('Max'));
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Makati')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Makati'));
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Grooming')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Grooming'));
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Online Booking')).toBeInTheDocument()
      );
    }

    it('never appears at all in customer self-service mode - always implicitly Online', async () => {
      const user = userEvent.setup();
      renderPage();
      await goToCategoryStep(user);
      await user.click(screen.getByText('Grooming'));
      await user.click(screen.getByText('Next'));

      // Lands straight on the availability step - no 'Booking Type'/'Online
      // Booking'/'Walk-in' choice is ever shown for a remote customer.
      await waitFor(() =>
        expect(screen.getByText('Select slot')).toBeInTheDocument()
      );
      expect(screen.queryByText('Online Booking')).not.toBeInTheDocument();
      expect(screen.queryByText('Walk-in')).not.toBeInTheDocument();
    });

    it('defaults to Online: no lockToNow, every payment method offered, and booking_source "Online" is sent', async () => {
      vi.mocked(bookingApi.createBooking).mockResolvedValue({
        data: {
          id: 'booking-1',
          status: 'Pending',
          scheduled_start: '2026-08-03T01:00:00.000Z',
        } as never,
        error: null,
      });

      const user = userEvent.setup();
      renderStaffPage();
      await goToBookingTypeStep(user);

      // Default selection, no explicit click needed.
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Select slot')).toBeInTheDocument()
      );
      expect(
        screen.queryByTestId('slot-picker-locked')
      ).not.toBeInTheDocument();
      await user.click(screen.getByText('Select slot'));
      await screen.findByTestId('staff-picker');
      await user.click(screen.getByText('Pick no preference'));
      await user.click(screen.getByText('Next'));

      await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
      await user.click(screen.getByText('Bath'));
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Confirm booking')).toBeInTheDocument()
      );
      // Every payment method is offered, including the online ones.
      expect(screen.getByRole('option', { name: 'GCash' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Maya' })).toBeInTheDocument();

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'Cash' } });
      await user.click(screen.getByText('Confirm booking'));

      await waitFor(() =>
        expect(bookingApi.createBooking).toHaveBeenCalledWith(
          'token',
          expect.objectContaining({ booking_source: 'Online' })
        )
      );
    });

    it('selecting Walk-in locks the date/time picker (staff picker stays interactive), restricts payment methods to on-site options, hides the downpayment breakdown, and sends booking_source "Walk-in"', async () => {
      vi.mocked(bookingApi.getDownpaymentStatus).mockResolvedValue({
        data: {
          downpayment_enabled: true,
          downpayment_type: 'Flat',
          downpayment_amount: 100,
        },
        error: null,
      });
      vi.mocked(bookingApi.createBooking).mockResolvedValue({
        data: {
          id: 'booking-1',
          status: 'In Progress',
          scheduled_start: '2026-08-03T01:00:00.000Z',
        } as never,
        error: null,
      });

      const user = userEvent.setup();
      renderStaffPage();
      await goToBookingTypeStep(user);

      await user.click(screen.getByText('Walk-in'));
      await user.click(screen.getByText('Next'));

      // Date/time is locked; the staff picker alongside it is untouched -
      // still fully interactive once a slot exists.
      await waitFor(() =>
        expect(screen.getByTestId('slot-picker-locked')).toBeInTheDocument()
      );
      await user.click(screen.getByText('Select slot'));
      await screen.findByTestId('staff-picker');
      await user.click(screen.getByText('Pick no preference'));
      await user.click(screen.getByText('Next'));

      await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());
      await user.click(screen.getByText('Bath'));
      await user.click(screen.getByText('Next'));

      await waitFor(() =>
        expect(screen.getByText('Confirm booking')).toBeInTheDocument()
      );

      // On-site/counter options only - no online (GCash/Maya) checkout UI.
      expect(
        screen.queryByRole('option', { name: 'GCash' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Maya' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Cash' })).toBeInTheDocument();

      // No downpayment breakdown/toggle shown, even though the branch policy
      // has one enabled - it's forced off server-side for a walk-in.
      expect(screen.queryByText('Downpayment due now')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/requires a downpayment/)
      ).not.toBeInTheDocument();

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'Cash' } });
      await user.click(screen.getByText('Confirm booking'));

      await waitFor(() =>
        expect(bookingApi.createBooking).toHaveBeenCalledWith(
          'token',
          expect.objectContaining({ booking_source: 'Walk-in' })
        )
      );
    });
  });
});
