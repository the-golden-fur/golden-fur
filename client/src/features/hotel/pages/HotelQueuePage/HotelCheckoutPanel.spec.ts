import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  checkOutHotelStay,
  getHotelCheckoutPreview,
} from '../../api/hotel.api';
import { HotelStayPicker } from '../../components/HotelStayPicker/HotelStayPicker';
import { HotelCheckoutPanel } from './HotelCheckoutPanel';

vi.mock('../../api/hotel.api', () => ({
  checkOutHotelStay: vi.fn(),
  // No preview unless a test sets one - the panel then just confirms.
  getHotelCheckoutPreview: vi
    .fn()
    .mockResolvedValue({ data: null, error: 'no preview' }),
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
  vi.mocked(HotelStayPicker).mockImplementation(({ onSelect }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onSelect(STAY) },
      'Pick stay'
    )
  );
}

function renderPanel(initialStayId: string | null) {
  return render(
    createElement(HotelCheckoutPanel, {
      accessToken: 'token',
      initialStayId,
    })
  );
}

describe('HotelCheckoutPanel', () => {
  it('with an initialStayId, skips the picker and goes straight to confirm', async () => {
    setupMocks();

    renderPanel('stay-1');

    expect(
      await screen.findByText('Ready to check out this stay?')
    ).toBeInTheDocument();
    expect(screen.queryByText('Pick stay')).not.toBeInTheDocument();
  });

  it('without an initialStayId, shows the HotelStayPicker instead of a raw id field', async () => {
    setupMocks();

    renderPanel(null);

    expect(await screen.findByText('Pick stay')).toBeInTheDocument();
    expect(screen.queryByText('Hotel Stay ID')).not.toBeInTheDocument();
  });

  it('selecting a stay from the picker shows its details before confirming checkout', async () => {
    setupMocks();

    renderPanel(null);

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

    renderPanel('stay-1');

    fireEvent.click(await screen.findByText('Check out now'));

    expect(checkOutHotelStay).toHaveBeenCalledWith('stay-1', 'token');
    expect(
      await screen.findByText('Stay checked out. Cage released.')
    ).toBeInTheDocument();
  });

  it('shows the bill if checked out now before confirming, for the stay about to be checked out', async () => {
    setupMocks();
    vi.mocked(getHotelCheckoutPreview).mockResolvedValue({
      data: {
        breakdown: {
          nights: 3,
          nightly_rate: 850,
          stay_charge: 2550,
          discount: 0,
          late_nights: 2,
          late_rate: 850,
          late_charge: 1700,
          total: 4250,
          pay_at_checkout: false,
        },
        downpayment_collected: 250,
        added_at_checkout: 1700,
        amount_due: 4000,
        as_of: '2026-10-19T01:00:00.000Z',
      },
      error: null,
    });

    renderPanel(null);
    fireEvent.click(await screen.findByText('Pick stay'));

    expect(
      await screen.findByText('Late checkout - 2 nights × ₱850')
    ).toBeInTheDocument();
    expect(getHotelCheckoutPreview).toHaveBeenCalledWith('stay-1', 'token');
    expect(
      screen.getByText('To collect at the cashier').nextElementSibling
    ).toHaveTextContent('₱4000');
    expect(checkOutHotelStay).not.toHaveBeenCalled();
  });
});
