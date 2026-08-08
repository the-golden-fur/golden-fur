import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { listHotelStays } from '../../api/hotel.api';
import type { HotelStayWithCage } from '../../hotel.types';
import { HotelStayPicker } from './HotelStayPicker';

function renderPicker(props: Parameters<typeof HotelStayPicker>[0]) {
  return render(
    createElement(MemoryRouter, null, createElement(HotelStayPicker, props))
  );
}

vi.mock('../../api/hotel.api', () => ({
  listHotelStays: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));

function stay(overrides: Partial<HotelStayWithCage> = {}): HotelStayWithCage {
  return {
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

function setupMocks(stays: HotelStayWithCage[]) {
  vi.mocked(listHotelStays).mockResolvedValue({ data: stays, error: null });
  vi.mocked(getPet).mockResolvedValue({ data: PET, error: null });
  vi.mocked(getCustomerProfile).mockResolvedValue({ data: OWNER, error: null });
}

describe('HotelStayPicker', () => {
  it('lists an active stay with cage, owner, and checkout-due date', async () => {
    setupMocks([stay()]);

    renderPicker({ accessToken: 'token', onSelect: vi.fn() });

    expect(await screen.findByText('Mochi')).toBeInTheDocument();
    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
  });

  it('only ever requests In Progress stays', async () => {
    setupMocks([stay()]);

    renderPicker({ accessToken: 'token', onSelect: vi.fn() });

    await screen.findByText('Mochi');
    expect(listHotelStays).toHaveBeenCalledWith('token', 'In Progress');
  });

  it('clicking the Check out button calls onSelect with that stay', async () => {
    setupMocks([stay()]);
    const onSelect = vi.fn();

    renderPicker({ accessToken: 'token', onSelect });

    await screen.findByText('Mochi');
    fireEvent.click(screen.getByRole('button', { name: 'Check out' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stay-1' })
    );
  });

  it('search filters by pet, owner, or cage', async () => {
    setupMocks([stay()]);

    renderPicker({ accessToken: 'token', onSelect: vi.fn() });

    await screen.findByText('Mochi');

    fireEvent.change(
      screen.getByPlaceholderText('Search by pet, owner, or cage...'),
      {
        target: { value: 'nonexistent' },
      }
    );

    expect(
      await screen.findByText(/No active stays match your search/)
    ).toBeInTheDocument();
  });
});
