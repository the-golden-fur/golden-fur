import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPetServiceHistory } from '../../../api/customer.api';
import type {
  PetServiceHistoryEntry,
  PetServiceHistoryPayment,
} from '../../../customer.types';
import { ServiceHistoryList } from './ServiceHistoryList';

vi.mock('../../../api/customer.api', () => ({
  listPetServiceHistory: vi.fn(),
}));

vi.mock('../../../../maintenance/api/maintenance.api', () => ({
  listBranchLetterheads: vi.fn(() =>
    Promise.resolve({
      data: [
        {
          id: 'branch-1',
          name: 'Main Branch',
          address: '12 Rizal St.',
          contact_number: '0917 000 0000',
        },
      ],
      error: null,
    })
  ),
}));

function entry(
  overrides: Partial<PetServiceHistoryEntry> = {}
): PetServiceHistoryEntry {
  return {
    booking_id: 'booking-1',
    date: '2026-10-01T04:30:00.000Z',
    service_category: 'Grooming',
    status: 'Completed',
    items: ['Full Groom', 'Nail Trim'],
    branch_name: 'Main Branch',
    staff_name: 'Ana Groomer',
    total_price: 850,
    cancellation_reason: null,
    payments: [],
    ...overrides,
  };
}

function payment(
  overrides: Partial<PetServiceHistoryPayment> = {}
): PetServiceHistoryPayment {
  return {
    id: 'abcd1234-ef56-7890-abcd-ef1234567890',
    booking_id: 'booking-1',
    booking_group_id: null,
    branch_id: 'branch-1',
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Fully Paid',
    payment_choice: 'full',
    total_amount: 850,
    misc_sale_description: null,
    created_at: '2026-10-01T05:00:00.000Z',
    customer_name: 'Maria Santos',
    bookings: { service_category: 'Grooming', pets: { name: 'Buddy' } },
    transaction_line_items: [],
    ...overrides,
  };
}

function renderList() {
  return render(
    createElement(ServiceHistoryList, { petId: 'pet-1', accessToken: 'token' })
  );
}

describe('ServiceHistoryList', () => {
  beforeEach(() => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a completed booking with its items, branch, staff and price', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [entry()],
      error: null,
    });

    renderList();

    expect(await screen.findByText('Grooming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Full Groom, Nail Trim')).toBeInTheDocument();
    expect(screen.getByText('Main Branch · Ana Groomer')).toBeInTheDocument();
    expect(screen.getByText('₱850.00')).toBeInTheDocument();
  });

  it('marks a cancelled booking as not charged and shows the reason', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [
        entry({
          service_category: 'Hotel',
          status: 'Cancelled',
          items: [],
          staff_name: null,
          total_price: 2400,
          cancellation_reason: 'Owner changed plans',
        }),
      ],
      error: null,
    });

    renderList();

    expect(
      await screen.findByText('₱2,400.00 · not charged')
    ).toBeInTheDocument();
    expect(screen.getByText('Reason: Owner changed plans')).toBeInTheDocument();
  });

  it('offers no receipt for a booking with no paid payment', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [entry()],
      error: null,
    });

    renderList();

    await screen.findByText('Grooming');
    expect(
      screen.queryByRole('button', { name: 'Print receipt' })
    ).not.toBeInTheDocument();
  });

  it('lists one receipt per paid payment', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [
        entry({
          service_category: 'Hotel',
          payments: [
            payment({
              id: 'txn-down',
              payment_choice: 'downpayment',
              total_amount: 1200,
            }),
            payment({
              id: 'txn-balance',
              payment_choice: 'balance',
              total_amount: 1200,
            }),
          ],
        }),
      ],
      error: null,
    });

    renderList();

    expect(await screen.findByText('Down payment')).toBeInTheDocument();
    expect(screen.getByText('Balance payment')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Print receipt' })
    ).toHaveLength(2);
  });

  it('prints the same receipt slip the Transactions page prints', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [entry({ payments: [payment()] })],
      error: null,
    });

    renderList();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Print receipt' })
    );

    expect(window.print).toHaveBeenCalledTimes(1);
    const slip = screen.getByRole('document', { name: 'Receipt' });
    // Printed as the reference and again under the barcode.
    expect(within(slip).getAllByText('ABCD1234EF56')).toHaveLength(2);
    expect(within(slip).getByText('Maria Santos')).toBeInTheDocument();
    expect(within(slip).getByText('Buddy')).toBeInTheDocument();
    expect(within(slip).getByText('Main Branch')).toBeInTheDocument();
  });

  it('prints the whole history as one report, with what the completed services came to', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [
        entry(),
        entry({
          booking_id: 'booking-2',
          service_category: 'Hotel',
          status: 'Cancelled',
          items: [],
          staff_name: null,
          total_price: 2400,
          cancellation_reason: 'Owner changed plans',
        }),
      ],
      error: null,
    });

    render(
      createElement(ServiceHistoryList, {
        petId: 'pet-1',
        petName: 'Buddy',
        accessToken: 'token',
      })
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Print history' })
    );

    expect(window.print).toHaveBeenCalledTimes(1);
    const report = screen.getByRole('document', {
      name: 'Service history report',
    });
    expect(within(report).getByText('Buddy')).toBeInTheDocument();
    expect(within(report).getByText('2 (1 completed)')).toBeInTheDocument();
    const rows = within(report).getAllByRole('row');
    // Header, the two bookings, the total.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('Full Groom, Nail Trim');
    expect(rows[1]).toHaveTextContent('Main Branch · Ana Groomer');
    expect(rows[2]).toHaveTextContent('Not charged');
    expect(rows[2]).toHaveTextContent('Reason: Owner changed plans');
    // Only the completed booking counts towards the total.
    expect(rows[3]).toHaveTextContent('₱850.00');

    // Taken down again once the print dialog closes.
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(
      screen.queryByRole('document', { name: 'Service history report' })
    ).not.toBeInTheDocument();
  });

  it('renders an empty state when the pet has no past bookings', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: [],
      error: null,
    });

    renderList();

    expect(
      await screen.findByText('No service history yet.')
    ).toBeInTheDocument();
  });

  it('renders the error message when loading fails', async () => {
    vi.mocked(listPetServiceHistory).mockResolvedValue({
      data: null,
      error: 'Forbidden',
    });

    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
  });
});
