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
import { listHotelStays } from '../../api/hotel.api';
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
}));

function renderPicker(props: Parameters<typeof HotelBookingPicker>[0]) {
  return render(
    createElement(MemoryRouter, null, createElement(HotelBookingPicker, props))
  );
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Hotel',
    service_id: 'svc-1',
    package_id: null,
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
  facebook_id: null,
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

    renderPicker({
      accessToken: 'token',
      branchId: 'branch-1',
      onSelect: vi.fn(),
    });

    expect(await screen.findByText('Mochi')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
    expect(screen.getByText('Hotel Stay - Small Cage')).toBeInTheDocument();
  });

  it('clicking a Pending card calls onSelect with that booking', async () => {
    setupMocks([booking()]);
    const onSelect = vi.fn();

    renderPicker({ accessToken: 'token', branchId: 'branch-1', onSelect });

    fireEvent.click(await screen.findByText('Mochi'));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'booking-1' })
    );
  });

  it('a non-Pending booking renders its status badge and is not selectable', async () => {
    setupMocks([booking({ id: 'booking-2', status: 'Cancelled' })]);
    const onSelect = vi.fn();

    renderPicker({ accessToken: 'token', branchId: 'branch-1', onSelect });

    await screen.findByText('Mochi');
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Mochi'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('an already-checked-in booking (In Progress, with a hotel_stays row) shows a badge, a checkout link, and is not selectable for check-in again', async () => {
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
    const onSelect = vi.fn();

    renderPicker({ accessToken: 'token', branchId: 'branch-1', onSelect });

    expect(await screen.findByText('Already checked in')).toBeInTheDocument();
    expect(screen.getByText(/Go to checkout/)).toHaveAttribute(
      'href',
      '/staff/hotel/checkout/stay-1'
    );

    fireEvent.click(screen.getByText('Mochi'));
    expect(onSelect).not.toHaveBeenCalled();
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
    const onSelect = vi.fn();

    renderPicker({ accessToken: 'token', branchId: 'branch-1', onSelect });

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Already checked in')).not.toBeInTheDocument();
    expect(screen.queryByText(/Go to checkout/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Mochi'));
    expect(onSelect).not.toHaveBeenCalled();
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

    renderPicker({
      accessToken: 'token',
      branchId: 'branch-1',
      onSelect: vi.fn(),
    });

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

    renderPicker({
      accessToken: 'token',
      branchId: 'branch-1',
      onSelect: vi.fn(),
    });

    expect(
      await screen.findByText(/No Hotel bookings match these filters/)
    ).toBeInTheDocument();
  });
});
