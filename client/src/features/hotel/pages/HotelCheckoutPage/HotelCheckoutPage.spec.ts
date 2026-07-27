import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { checkOutHotelStay } from '../../api/hotel.api';
import { HotelStayPicker } from '../../components/HotelStayPicker/HotelStayPicker';
import { HotelCheckoutPage } from './HotelCheckoutPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/hotel.api', () => ({
  checkOutHotelStay: vi.fn(),
}));

vi.mock('../../components/HotelStayPicker/HotelStayPicker', () => ({
  HotelStayPicker: vi.fn(),
}));

const STAY = {
  id: 'stay-1',
  cage_label: 'Makati-S-01',
  scheduled_check_out_date: '2026-07-28',
  downpayment_amount: 250,
} as never;

function setupMocks() {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'staff-1' },
    accessToken: 'token',
  } as never);

  vi.mocked(getStaffProfile).mockResolvedValue({
    data: { role: 'Receptionist', branch_id: 'branch-1' },
    error: null,
  } as never);

  vi.mocked(HotelStayPicker).mockImplementation(({ onSelect }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onSelect(STAY) },
      'Pick stay'
    )
  );
}

function renderAt(path: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/staff/hotel/checkout/:stayId',
          element: createElement(HotelCheckoutPage),
        }),
        createElement(Route, {
          path: '/staff/hotel/checkout',
          element: createElement(HotelCheckoutPage),
        })
      )
    )
  );
}

describe('HotelCheckoutPage', () => {
  it('with a :stayId route param, skips the picker and goes straight to confirm', async () => {
    setupMocks();

    renderAt('/staff/hotel/checkout/stay-1');

    expect(
      await screen.findByText('Ready to check out this stay?')
    ).toBeInTheDocument();
    expect(screen.queryByText('Pick stay')).not.toBeInTheDocument();
  });

  it('without a :stayId, shows the HotelStayPicker instead of a raw id field', async () => {
    setupMocks();

    renderAt('/staff/hotel/checkout');

    expect(await screen.findByText('Pick stay')).toBeInTheDocument();
    expect(screen.queryByText('Hotel Stay ID')).not.toBeInTheDocument();
  });

  it('selecting a stay from the picker shows its details before confirming checkout', async () => {
    setupMocks();

    renderAt('/staff/hotel/checkout');

    fireEvent.click(await screen.findByText('Pick stay'));

    expect(await screen.findByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.getByText('₱250.00')).toBeInTheDocument();
  });

  it('confirming checkout calls checkOutHotelStay with the selected stay id', async () => {
    setupMocks();
    vi.mocked(checkOutHotelStay).mockResolvedValue({
      data: {
        stay: { id: 'stay-1' },
        downpaymentAmount: 250,
        extensionFee: null,
        suppliedItemsCharge: null,
        remainingBalance: 250,
      },
      error: null,
    } as never);

    renderAt('/staff/hotel/checkout/stay-1');

    fireEvent.click(await screen.findByText('Check out now'));

    expect(checkOutHotelStay).toHaveBeenCalledWith('stay-1', 'token');
    expect(
      await screen.findByText('Stay checked out. Cage released.')
    ).toBeInTheDocument();
  });
});
