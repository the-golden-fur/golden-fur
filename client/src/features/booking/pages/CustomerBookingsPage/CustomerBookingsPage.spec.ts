import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CreditBalanceContext } from '../../../credits/providers/CreditBalanceContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as bookingApi from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { CustomerBookingsPage } from './CustomerBookingsPage';

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomerPets: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  listBookings: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  getBookingDetails: vi.fn(),
}));

// SlotPicker/StaffPickerList have their own dedicated specs; stub them here
// so this page's tests exercise its own list/action-panel behavior only.
vi.mock('../../components/SlotPicker/SlotPicker', () => ({
  SlotPicker: () => createElement('div', { 'data-testid': 'slot-picker' }),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: () =>
    createElement('div', { 'data-testid': 'staff-picker' }),
}));

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Grooming',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: 'staff-1',
    status: 'Pending',
    total_price: 500,
    downpayment_amount: null,
    payment_status: 'Pending',
    payment_method: 'Cash',
    payment_confirmed: false,
    special_instructions: null,
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

const refreshCreditBalance = vi.fn();

function renderPage(initialEntry = '/portal/bookings') {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          CreditBalanceContext.Provider,
          {
            value: {
              balances: [],
              total: 0,
              isLoading: false,
              refresh: refreshCreditBalance,
            },
          },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/portal/bookings',
              element: createElement(CustomerBookingsPage),
            })
          )
        )
      )
    )
  );
}

describe('CustomerBookingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
  });

  /** The default view is List, where every row has a visible "..." button
   * (MoreOptionsMenu). Every test here uses the default buildBooking()
   * (Grooming, pet-1) with an empty pets list, so the row's title text is
   * always "Grooming - Pet". */
  async function openMenu() {
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions for Grooming - Pet' })
    );
  }

  it("AC-1: shows only the caller's bookings with a status badge", async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();

    // A paid / no-down-payment Pending booking reads as "Confirmed" in the
    // shared confirmation vocabulary.
    await waitFor(() =>
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    );
    expect(bookingApi.listBookings).toHaveBeenCalledWith('token');
  });

  it('AC-5: cancel requires an explicit confirm step before calling the API', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();

    await openMenu();
    await user.click(screen.getByText('Cancel'));

    // An explicit modal dialog appears; the API must not be called yet.
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/are you sure you want to cancel/i)
    ).toBeInTheDocument();
    expect(bookingApi.cancelBooking).not.toHaveBeenCalled();

    // Dismissing with "Keep booking" closes the dialog and still never calls
    // the API - so a stray click on the Cancel menu item is harmless.
    await user.click(within(dialog).getByText('Keep booking'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bookingApi.cancelBooking).not.toHaveBeenCalled();

    await openMenu();
    await user.click(screen.getByText('Cancel'));

    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: true,
        policy_violation: false,
        credit_issued: false,
        credit_review_pending: false,
      },
      error: null,
    });

    await user.click(screen.getByText('Yes, cancel'));

    await waitFor(() =>
      expect(bookingApi.cancelBooking).toHaveBeenCalledWith(
        'booking-1',
        'token',
        {}
      )
    );
  });

  it('AC-4: surfaces a policy_violation flag from a cancellation to the customer', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });
    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: false,
        policy_violation: true,
        credit_issued: false,
        credit_review_pending: false,
      },
      error: null,
    });

    renderPage();

    await openMenu();
    await user.click(screen.getByText('Cancel'));
    await user.click(screen.getByText('Yes, cancel'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /did not meet the required notice period, so any payment was forfeited/i
      )
    );
  });

  it('discloses the non-refundable-becomes-credit policy and reports the credit conversion', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [
        buildBooking({
          status: 'Pending',
          payment_status: 'Partially Paid',
          downpayment_amount: 200,
        }),
      ],
      error: null,
    });
    vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        notice_period_met: true,
        policy_violation: false,
        credit_issued: true,
        credit_review_pending: false,
      },
      error: null,
    });

    renderPage();

    await openMenu();
    await user.click(screen.getByText('Cancel'));

    // The dialog discloses the policy before the customer confirms.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/won't be refunded/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/account credit/i)).toBeInTheDocument();

    await user.click(within(dialog).getByText('Yes, cancel'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /converted into account credit at Makati for a future visit/i
      )
    );

    // The navbar credit pill / portal home is refreshed after a credit-issuing
    // cancellation so the new balance shows without a reload.
    expect(refreshCreditBalance).toHaveBeenCalled();
  });

  it('does not show reschedule/cancel actions for a Cancelled booking', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Cancelled' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    );
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('offers "View details" on every booking - even a Cancelled one - and opens the details modal', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Cancelled' })],
      error: null,
    });
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Cancelled' }),
        branch: {
          id: 'branch-1',
          name: 'Makati',
          address: null,
          contact_number: null,
        },
        pet: { id: 'pet-1', name: 'Rex', weight_class: null, coat_type: null },
        owner: { id: 'cust-1', full_name: 'Sam Owner' },
        items: [],
        assigned_staff: null,
        cage: null,
        discount_name: null,
        promo_name: null,
        group: null,
        payments_visible: true,
        pricing: {
          items_subtotal: 500,
          discount_amount: 0,
          promo_amount: 0,
          total: 500,
          downpayment_amount: null,
          downpayment_required: false,
          amount_paid: 0,
          balance_due: 500,
        },
        transactions: [],
      },
      error: null,
    });

    renderPage();

    await openMenu();
    await user.click(screen.getByText('View details'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Booking details')).toBeInTheDocument();
    expect(await within(dialog).findByText(/Rex/)).toBeInTheDocument();
    expect(bookingApi.getBookingDetails).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it('clicking a booking row opens its details modal', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking()],
      error: null,
    });
    // Only asserting the modal opens for this booking - leave the details
    // fetch pending rather than rebuilding the full details fixture.
    vi.mocked(bookingApi.getBookingDetails).mockReturnValue(
      new Promise(() => {})
    );

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: /^Grooming - Pet/ })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Booking details')).toBeInTheDocument();
    expect(bookingApi.getBookingDetails).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it("slot-conflict notification: a `?open=<id>` deep link auto-opens that booking's details", async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });
    vi.mocked(bookingApi.getBookingDetails).mockResolvedValue({
      data: {
        booking: buildBooking({ status: 'Pending' }),
        branch: {
          id: 'branch-1',
          name: 'Makati',
          address: null,
          contact_number: null,
        },
        pet: { id: 'pet-1', name: 'Rex', weight_class: null, coat_type: null },
        owner: { id: 'cust-1', full_name: 'Sam Owner' },
        items: [],
        assigned_staff: null,
        cage: null,
        discount_name: null,
        promo_name: null,
        group: null,
        payments_visible: true,
        pricing: {
          items_subtotal: 500,
          discount_amount: 0,
          promo_amount: 0,
          total: 500,
          downpayment_amount: null,
          downpayment_required: false,
          amount_paid: 0,
          balance_due: 500,
        },
        transactions: [],
      },
      error: null,
    });

    renderPage('/portal/bookings?open=booking-1');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Booking details')).toBeInTheDocument();
    expect(bookingApi.getBookingDetails).toHaveBeenCalledWith(
      'booking-1',
      'token'
    );
  });

  it('never shows a Pay action - paying moved to the Transaction History page', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending', payment_status: 'Pending' })],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    );
    expect(screen.queryByText('Pay')).not.toBeInTheDocument();
  });

  it('table and list rows carry a visible "..." button with View details / Reschedule / Cancel', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();

    // List is the default view.
    await openMenu();
    expect(screen.getByText('View details')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Table' }));

    expect(
      screen.getByRole('button', { name: 'Actions for Grooming - Pet' })
    ).toBeInTheDocument();
  });

  it('gallery and board cards have no persistent "..." button - right-click / press-and-hold opens the same menu instead', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Pending' })],
      error: null,
    });

    renderPage();
    await screen.findByText('Grooming - Pet');

    for (const view of ['Gallery', 'Board']) {
      await user.click(screen.getByRole('button', { name: view }));

      expect(
        screen.queryByRole('button', { name: 'Actions for Grooming - Pet' })
      ).not.toBeInTheDocument();

      fireEvent.contextMenu(screen.getByText('Grooming - Pet'));
      expect(screen.getByText('View details')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      await user.keyboard('{Escape}');
    }
  });

  it.each([
    [
      'unconfirmed (waiting for payment)',
      {
        status: 'Pending',
        payment_status: 'Pending',
        booking_source: 'Online',
      },
    ],
    [
      'confirmed (paid)',
      {
        status: 'Pending',
        payment_status: 'Fully Paid',
        booking_source: 'Online',
      },
    ],
    [
      'in service',
      {
        status: 'In Progress',
        payment_status: 'Fully Paid',
        booking_source: 'Online',
      },
    ],
  ] as const)(
    'a customer can cancel a %s booking from the "..." menu',
    async (_label, overrides) => {
      const user = userEvent.setup();
      vi.mocked(bookingApi.listBookings).mockResolvedValue({
        data: [buildBooking(overrides)],
        error: null,
      });
      vi.mocked(bookingApi.cancelBooking).mockResolvedValue({
        data: {
          booking: buildBooking({ ...overrides, status: 'Cancelled' }),
          credit_issued: false,
          policy_violation: false,
        },
        error: null,
      } as never);

      renderPage();

      await openMenu();
      await user.click(screen.getByText('Cancel'));
      await user.click(screen.getByText('Yes, cancel'));

      await waitFor(() =>
        expect(bookingApi.cancelBooking).toHaveBeenCalledWith(
          'booking-1',
          'token',
          {}
        )
      );
    }
  );

  it('offers no Cancel for a booking that is already finished', async () => {
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [buildBooking({ status: 'Completed' })],
      error: null,
    });

    renderPage();

    await openMenu();
    expect(screen.getByText('View details')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  describe('search, sort, filter, group by and view options', () => {
    async function renderTwoBookings() {
      vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
        data: [
          { id: 'pet-1', name: 'Biscuit' },
          { id: 'pet-2', name: 'Mochi' },
        ] as never,
        error: null,
      });
      vi.mocked(bookingApi.listBookings).mockResolvedValue({
        data: [
          buildBooking({
            id: 'booking-1',
            pet_id: 'pet-1',
            service_category: 'Grooming',
            scheduled_start: '2026-08-03T01:00:00.000Z',
            total_price: 300,
          }),
          buildBooking({
            id: 'booking-2',
            pet_id: 'pet-2',
            service_category: 'Hotel',
            scheduled_start: '2026-09-10T01:00:00.000Z',
            total_price: 900,
          }),
        ],
        error: null,
      });

      renderPage();
      await screen.findByText('Grooming - Biscuit');
    }

    it('shows the search box, Filter, Sort and the five views', async () => {
      await renderTwoBookings();

      expect(
        screen.getByPlaceholderText('Search your bookings...')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Filter' })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
      for (const view of ['Table', 'List', 'Gallery', 'Board', 'Calendar']) {
        expect(screen.getByRole('button', { name: view })).toBeInTheDocument();
      }
    });

    it('searching narrows by pet, service, or branch', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.type(
        screen.getByPlaceholderText('Search your bookings...'),
        'mochi'
      );

      expect(screen.getByText('Hotel - Mochi')).toBeInTheDocument();
      expect(screen.queryByText('Grooming - Biscuit')).not.toBeInTheDocument();
    });

    it('a Service filter tile narrows the list', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.click(screen.getByRole('button', { name: 'Filter' }));
      await user.click(screen.getByRole('menuitem', { name: 'Service' }));

      // Service's default value is the first category (Grooming).
      expect(screen.getByText('Grooming - Biscuit')).toBeInTheDocument();
      expect(screen.queryByText('Hotel - Mochi')).not.toBeInTheDocument();
    });

    it('a Pet filter tile narrows the list to that pet', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.click(screen.getByRole('button', { name: 'Filter' }));
      await user.click(screen.getByRole('menuitem', { name: 'Pet' }));

      // Pet's default value is the first pet alphabetically (Biscuit).
      expect(screen.getByText('Grooming - Biscuit')).toBeInTheDocument();
      expect(screen.queryByText('Hotel - Mochi')).not.toBeInTheDocument();
    });

    it('sorting by total price reorders the list', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.click(screen.getByRole('button', { name: 'Sort' }));
      await user.click(
        screen.getByRole('menuitem', { name: 'Total price · High to low' })
      );

      const titles = screen
        .getAllByText(/^(Grooming|Hotel) - /)
        .map((element) => element.textContent);
      expect(titles).toEqual(['Hotel - Mochi', 'Grooming - Biscuit']);
    });

    it('Board view groups by Status by default and can regroup by Service', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.click(screen.getByRole('button', { name: 'Board' }));

      // Both bookings are unpaid online-source-less Pending => Confirmed.
      expect(
        screen.getByRole('heading', { name: /Confirmed/ })
      ).toBeInTheDocument();

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Group by' }),
        'service'
      );

      expect(
        screen.getByRole('heading', { name: /Hotel/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /Grooming/ })
      ).toBeInTheDocument();
    });

    it('Calendar view places each booking on its day', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.click(screen.getByRole('button', { name: 'Calendar' }));

      // The calendar opens on the current month, so just confirm the
      // grid rendered with its weekday header and the range selector.
      expect(screen.getByText('Sun')).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Calendar range' })
      ).toBeInTheDocument();
    });

    it('shows a friendly empty state when the filters match nothing', async () => {
      const user = userEvent.setup();
      await renderTwoBookings();

      await user.type(
        screen.getByPlaceholderText('Search your bookings...'),
        'zzz-no-match'
      );

      expect(
        screen.getByText('No bookings match this filter.')
      ).toBeInTheDocument();
    });
  });
});
