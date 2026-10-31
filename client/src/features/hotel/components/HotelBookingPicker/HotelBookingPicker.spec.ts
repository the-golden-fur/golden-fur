import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { listBookings } from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  listPackages,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import {
  completeCareLogEntry,
  listHotelStays,
  startCareLogEntry,
} from '../../api/hotel.api';
import type { CareLogEntry } from '../../hotel.types';
import { HotelBookingPicker } from './HotelBookingPicker';

vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listServices: vi.fn(),
  listPackages: vi.fn(),
}));

vi.mock('../../api/hotel.api', () => ({
  listHotelStays: vi.fn(),
  startCareLogEntry: vi.fn(),
  completeCareLogEntry: vi.fn(),
}));

function renderPicker(
  props: Partial<Parameters<typeof HotelBookingPicker>[0]> = {}
) {
  const merged: Parameters<typeof HotelBookingPicker>[0] = {
    accessToken: 'token',
    branchId: 'branch-1',
    onCheckIn: vi.fn(),
    onViewDetails: vi.fn(),
    careLogEntries: [],
    onViewChecklist: vi.fn(),
    onMarkChanged: vi.fn(),
    ...props,
  };
  return {
    ...render(
      createElement(
        MemoryRouter,
        null,
        createElement(HotelBookingPicker, merged)
      )
    ),
    props: merged,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Hotel',
    scheduled_start: '2026-07-27T01:00:00.000Z',
    scheduled_end: '2026-07-28T01:00:00.000Z',
    assigned_staff_id: null,
    status: 'Pending',
    total_price: 500,
    downpayment_amount: 250,
    payment_method: 'Cash',
    payment_confirmed: true,
    special_instructions: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-27T00:00:00.000Z',
    updated_at: '2026-07-27T00:00:00.000Z',
    booking_items: [
      {
        id: 'item-1',
        booking_id: 'booking-1',
        service_id: 'svc-1',
        package_id: null,
        price_at_booking: 500,
        duration_minutes_at_booking: 1440,
      },
    ],
    ...overrides,
  };
}

const PET: Pet = {
  id: 'pet-1',
  customer_id: 'cust-1',
  name: 'Mochi',
  pet_type: 'Dog',
  breed_id: null,
  photo_url: null,
  gender: 'Male',
  date_of_birth: null,
  weight_class: 'S',
  coat_type: 'SC',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const OWNER: CustomerProfile = {
  id: 'cust-1',
  full_name: 'Ana Cruz',
  contact_number: '+63 917 000 0001',
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: 'Call',
  account_email: 'ana@example.com',
  primary_auth_provider: 'email',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function setupMocks(bookings: Booking[]) {
  vi.mocked(listBookings).mockResolvedValue({ data: bookings, error: null });
  vi.mocked(getPet).mockResolvedValue({ data: PET, error: null });
  vi.mocked(getCustomerProfile).mockResolvedValue({ data: OWNER, error: null });
  vi.mocked(listServices).mockResolvedValue({
    data: [
      {
        id: 'svc-1',
        branch_id: 'branch-1',
        category: 'Hotel',
        name: 'Hotel Stay - Small Cage',
        base_price: 500,
        duration_minutes: 1440,
        is_active: true,
      },
    ],
    error: null,
  });
  vi.mocked(listPackages).mockResolvedValue({ data: [], error: null });
  vi.mocked(listHotelStays).mockResolvedValue({ data: [], error: null });
}

describe('HotelBookingPicker', () => {
  it('renders a detailed card for a matching Pending booking (pet, weight class, owner, service, dates)', async () => {
    setupMocks([booking()]);

    renderPicker();

    expect(await screen.findByText('Mochi')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
    expect(screen.getByText('Hotel Stay - Small Cage')).toBeInTheDocument();
  });

  it('lists the latest booking on top by default', async () => {
    setupMocks([
      booking({ id: 'booking-early' }),
      booking({
        id: 'booking-late',
        scheduled_start: '2026-07-29T01:00:00.000Z',
        scheduled_end: '2026-07-30T01:00:00.000Z',
      }),
    ]);

    renderPicker();

    await screen.findAllByText('Mochi');
    expect(
      screen.getByDisplayValue('Sort: Check-in date (latest)')
    ).toBeInTheDocument();

    const starts = screen
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(starts[0]).toContain('Jul 29');
    expect(starts[1]).toContain('Jul 27');
  });

  it('clicking the Check in button calls onCheckIn with that booking', async () => {
    setupMocks([booking()]);

    const { props } = renderPicker();

    await screen.findByText('Mochi');
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    expect(props.onCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'booking-1' })
    );
  });

  it('right-click "View booking details" calls onViewDetails with that booking', async () => {
    setupMocks([booking()]);

    const { props } = renderPicker();

    await screen.findByText('Mochi');
    fireEvent.contextMenu(screen.getByText('Mochi'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'View booking details' })
    );

    expect(props.onViewDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'booking-1' })
    );
  });

  it('tap-to-hold: no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
    setupMocks([booking()]);

    renderPicker();

    await screen.findByText('Mochi');

    expect(
      screen.queryByRole('button', { name: 'Actions for Mochi' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Mochi'));
    expect(
      screen.getByRole('menuitem', { name: 'View booking details' })
    ).toBeInTheDocument();
  });

  it('the booking being checked in shows a pending label and a disabled button', async () => {
    setupMocks([booking()]);

    renderPicker({ checkingInBookingId: 'booking-1' });

    await screen.findByText('Mochi');
    const button = screen.getByRole('button', { name: 'Checking in...' });
    expect(button).toBeDisabled();
  });

  // Custom change (clear check-in gate, groomer rest-day indicator): the
  // branch-level reason disables every "Check in" button at once and shows
  // the reason as a banner.
  it('a blockedReason disables every Check in button and shows the reason', async () => {
    setupMocks([booking()]);

    renderPicker({
      blockedReason:
        "Makati is closed today (Sunday) - check-in isn't available.",
    });

    await screen.findByText('Mochi');
    expect(screen.getByText(/is closed today \(Sunday\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check in' })).toBeDisabled();
  });

  it('a non-Pending booking renders its status badge and offers no Check in button', async () => {
    setupMocks([booking({ id: 'booking-2', status: 'Cancelled' })]);

    renderPicker();
    fireEvent.change(await screen.findByDisplayValue('Awaiting check-in'), {
      target: { value: 'All' },
    });

    await screen.findByText('Mochi');
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Check in' })
    ).not.toBeInTheDocument();
  });

  it('an already-checked-in booking (In Progress, with a hotel_stays row) shows a badge, a checkout link, and offers no Check in button', async () => {
    setupMocks([booking({ status: 'In Progress' })]);
    vi.mocked(listHotelStays).mockResolvedValue({
      data: [
        {
          id: 'stay-1',
          booking_id: 'booking-1',
          pet_id: 'pet-1',
          cage_id: 'cage-1',
          cage_label: 'Makati-S-01',
          check_in_at: '2026-07-27T01:00:00.000Z',
          scheduled_check_out_date: '2026-07-28',
          actual_check_out_at: null,
          downpayment_amount: 250,
          extension_fee: null,
          supplied_items_charge: null,
          notify_opt_in: false,
          created_by_staff_id: 'staff-1',
          created_at: '2026-07-27T01:00:00.000Z',
          updated_at: '2026-07-27T01:00:00.000Z',
        },
      ],
      error: null,
    });
    renderPicker();
    fireEvent.change(await screen.findByDisplayValue('Awaiting check-in'), {
      target: { value: 'All' },
    });

    expect(await screen.findByText('Already checked in')).toBeInTheDocument();
    expect(screen.getByText(/Go to checkout/)).toHaveAttribute(
      'href',
      '/staff/hotel/checkout/stay-1'
    );
    expect(
      screen.queryByRole('button', { name: 'Check in' })
    ).not.toBeInTheDocument();
  });

  it('a checked-out booking (Completed, with a hotel_stays row) shows its booking-status badge instead of a checkout link', async () => {
    setupMocks([booking({ status: 'Completed' })]);
    vi.mocked(listHotelStays).mockResolvedValue({
      data: [
        {
          id: 'stay-1',
          booking_id: 'booking-1',
          pet_id: 'pet-1',
          cage_id: 'cage-1',
          cage_label: 'Makati-S-01',
          check_in_at: '2026-07-27T01:00:00.000Z',
          scheduled_check_out_date: '2026-07-28',
          actual_check_out_at: '2026-07-28T09:00:00.000Z',
          downpayment_amount: 250,
          extension_fee: null,
          supplied_items_charge: null,
          notify_opt_in: false,
          created_by_staff_id: 'staff-1',
          created_at: '2026-07-27T01:00:00.000Z',
          updated_at: '2026-07-28T09:00:00.000Z',
        },
      ],
      error: null,
    });
    renderPicker();
    fireEvent.change(await screen.findByDisplayValue('Awaiting check-in'), {
      target: { value: 'All' },
    });

    await screen.findByText('Mochi');
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Already checked in')).not.toBeInTheDocument();
    expect(screen.queryByText(/Go to checkout/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Check in' })
    ).not.toBeInTheDocument();
  });

  it('a walk-in (In Progress, no stay yet) is listed by default and can be checked in', async () => {
    setupMocks([booking({ status: 'In Progress' })]);

    const { props } = renderPicker();

    expect(await screen.findByText('Not checked in yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));

    expect(props.onCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'booking-1' })
    );
    expect(listBookings).toHaveBeenLastCalledWith(
      'token',
      expect.objectContaining({ status: undefined })
    );
  });

  it('an In Progress booking offers no Check in while the stays lookup has not loaded', async () => {
    setupMocks([booking({ status: 'In Progress' })]);
    vi.mocked(listHotelStays).mockResolvedValue({
      data: null,
      error: 'Could not load stays.',
    });

    renderPicker();
    fireEvent.change(await screen.findByDisplayValue('Awaiting check-in'), {
      target: { value: 'All' },
    });

    await screen.findByText('Mochi');
    expect(
      screen.queryByRole('button', { name: 'Check in' })
    ).not.toBeInTheDocument();
  });

  it('the default "Awaiting check-in" view hides bookings that cannot be checked in', async () => {
    setupMocks([booking({ status: 'Cancelled' })]);

    renderPicker();

    expect(
      await screen.findByText(/No Hotel bookings match these filters/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Mochi')).not.toBeInTheDocument();
  });

  it('search filters by pet, owner, or weight class', async () => {
    setupMocks([
      booking({ id: 'booking-1', pet_id: 'pet-1' }),
      booking({ id: 'booking-2', pet_id: 'pet-2', customer_id: 'cust-2' }),
    ]);
    vi.mocked(getPet).mockImplementation((id) =>
      Promise.resolve({
        data: id === 'pet-2' ? { ...PET, id: 'pet-2', name: 'Bantay' } : PET,
        error: null,
      })
    );
    vi.mocked(getCustomerProfile).mockImplementation((id) =>
      Promise.resolve({
        data:
          id === 'cust-2'
            ? { ...OWNER, id: 'cust-2', full_name: 'Ben Reyes' }
            : OWNER,
        error: null,
      })
    );

    renderPicker();

    await screen.findByText('Mochi');
    expect(screen.getByText('Bantay')).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('Search by pet, owner, or cage size...'),
      { target: { value: 'Bantay' } }
    );

    expect(screen.queryByText('Mochi')).not.toBeInTheDocument();
    expect(screen.getByText('Bantay')).toBeInTheDocument();
  });

  it('shows a widen-your-filters empty state instead of a hard "no bookings today" dead end', async () => {
    setupMocks([]);

    renderPicker();

    expect(
      await screen.findByText(/No Hotel bookings match these filters/)
    ).toBeInTheDocument();
  });

  // Custom change (Groomer/Pet Assistant check-in restriction): the "..."
  // menu's checklist-related items.
  describe('checklist menu items', () => {
    function careLogEntry(overrides: Partial<CareLogEntry> = {}): CareLogEntry {
      return {
        id: 'entry-1',
        stay_id: 'stay-1',
        care_type: 'Feeding',
        scheduled_date: '2026-07-27',
        description: 'Morning meal',
        time_block: 'Morning',
        status: 'Pending',
        completed_at: null,
        completed_by: null,
        created_at: '2026-07-27T00:00:00.000Z',
        ...overrides,
      };
    }

    function renderCheckedInPicker(
      careLogEntries: CareLogEntry[],
      props: Partial<Parameters<typeof HotelBookingPicker>[0]> = {}
    ) {
      setupMocks([booking({ status: 'In Progress' })]);
      vi.mocked(listHotelStays).mockResolvedValue({
        data: [
          {
            id: 'stay-1',
            booking_id: 'booking-1',
            pet_id: 'pet-1',
            cage_id: 'cage-1',
            cage_label: 'Makati-S-01',
            check_in_at: '2026-07-27T01:00:00.000Z',
            scheduled_check_out_date: '2026-07-28',
            actual_check_out_at: null,
            downpayment_amount: 250,
            extension_fee: null,
            supplied_items_charge: null,
            notify_opt_in: false,
            created_by_staff_id: 'staff-1',
            created_at: '2026-07-27T01:00:00.000Z',
            updated_at: '2026-07-27T01:00:00.000Z',
          },
        ],
        error: null,
      });
      return renderPicker({
        careLogEntries,
        showAllStatuses: true,
        ...props,
      });
    }

    it('offers no "View checklist items" or Mark item for a booking not checked in yet', async () => {
      setupMocks([booking()]);
      renderPicker();

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));

      expect(
        screen.getByRole('menuitem', { name: 'View booking details' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: 'View checklist items' })
      ).not.toBeInTheDocument();
    });

    it('offers "View checklist items" once checked in, navigating by stayId', async () => {
      const { props } = renderCheckedInPicker([]);

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'View checklist items' })
      );

      expect(props.onViewChecklist).toHaveBeenCalledWith('stay-1');
    });

    it('offers no direct Mark item when there are 0 actionable tasks', async () => {
      renderCheckedInPicker([
        careLogEntry({ status: 'Completed' }),
        careLogEntry({
          id: 'entry-2',
          stay_id: 'stay-other',
          status: 'Pending',
        }),
      ]);

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));

      expect(
        screen.queryByRole('menuitem', { name: 'Mark as in progress' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: 'Mark as done' })
      ).not.toBeInTheDocument();
    });

    it('offers no direct Mark item when there are 2+ actionable tasks (ambiguous)', async () => {
      renderCheckedInPicker([
        careLogEntry({ id: 'entry-1', status: 'Pending' }),
        careLogEntry({ id: 'entry-2', status: 'In Progress' }),
      ]);

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));

      expect(
        screen.queryByRole('menuitem', { name: 'Mark as in progress' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: 'Mark as done' })
      ).not.toBeInTheDocument();
    });

    it('a single Pending task offers "Mark as in progress", calling startCareLogEntry then onMarkChanged', async () => {
      vi.mocked(startCareLogEntry).mockResolvedValue({
        data: careLogEntry({ status: 'In Progress' }),
        error: null,
      });
      const { props } = renderCheckedInPicker([
        careLogEntry({ id: 'entry-1', status: 'Pending' }),
      ]);

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Mark as in progress' })
      );

      expect(startCareLogEntry).toHaveBeenCalledWith('entry-1', 'token');
      await screen.findByText('Mochi');
      expect(props.onMarkChanged).toHaveBeenCalled();
    });

    it('a single In Progress task offers "Mark as done", calling completeCareLogEntry then onMarkChanged', async () => {
      vi.mocked(completeCareLogEntry).mockResolvedValue({
        data: careLogEntry({ status: 'Completed' }),
        error: null,
      });
      const { props } = renderCheckedInPicker([
        careLogEntry({ id: 'entry-1', status: 'In Progress' }),
      ]);

      await screen.findByText('Mochi');
      fireEvent.contextMenu(screen.getByText('Mochi'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as done' }));

      expect(completeCareLogEntry).toHaveBeenCalledWith('entry-1', 'token');
      await screen.findByText('Mochi');
      expect(props.onMarkChanged).toHaveBeenCalled();
    });

    it('showAllStatuses hides the inline Check in/Go to checkout controls', async () => {
      renderCheckedInPicker([]);

      await screen.findByText('Mochi');
      expect(
        screen.queryByRole('button', { name: 'Check in' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Go to checkout/)).not.toBeInTheDocument();
    });
  });
});
