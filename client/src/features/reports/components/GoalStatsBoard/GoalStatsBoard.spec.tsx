import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '../../../booking/booking.types';
import type { TransactionRecord } from '../../reports.types';
import { listBookings } from '../../../booking/api/booking.api';
import { getTransactionHistory } from '../../api/reports.api';
import { GoalStatsBoard } from './GoalStatsBoard';

vi.mock('../../../booking/api/booking.api', () => ({ listBookings: vi.fn() }));
vi.mock('../../api/reports.api', () => ({ getTransactionHistory: vi.fn() }));

// Dates relative to "now" so the this-month / last-month buckets land right
// whenever the suite runs.
const now = new Date();
const thisMonth = (day: number) =>
  new Date(now.getFullYear(), now.getMonth(), day).toISOString();
const lastMonth = (day: number) =>
  new Date(now.getFullYear(), now.getMonth() - 1, day).toISOString();
const monthsAgo = (n: number, day: number) =>
  new Date(now.getFullYear(), now.getMonth() - n, day).toISOString();

function booking(overrides: Partial<Booking>): Booking {
  // Only id / service_category / created_at are read by GoalStatsBoard.
  return {
    id: 'b-1',
    service_category: 'Grooming',
    created_at: thisMonth(2),
    ...overrides,
  } as unknown as Booking;
}

function txn(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    id: 't-1',
    booking_id: 'b-1',
    booking_group_id: null,
    customer_id: 'c-1',
    branch_id: 'br-1',
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Fully Paid',
    payment_choice: 'full',
    total_amount: 0,
    misc_sale_description: null,
    created_at: thisMonth(2),
    bookings: null,
    ...overrides,
  };
}

function renderBoard() {
  return render(createElement(GoalStatsBoard, { accessToken: 'token' }));
}

describe('GoalStatsBoard', () => {
  beforeEach(() => {
    vi.mocked(listBookings).mockResolvedValue({
      data: [
        booking({
          id: 'a',
          service_category: 'Grooming',
          created_at: thisMonth(2),
        }),
        booking({
          id: 'b',
          service_category: 'Veterinary',
          created_at: thisMonth(3),
        }),
        booking({
          id: 'c',
          service_category: 'Grooming',
          created_at: lastMonth(3),
        }),
        booking({
          id: 'd',
          service_category: 'Grooming',
          created_at: lastMonth(4),
        }),
        booking({
          id: 'e',
          service_category: 'Hotel',
          created_at: lastMonth(20),
        }),
        booking({
          id: 'f',
          service_category: 'Daycare',
          created_at: monthsAgo(3, 15),
        }),
      ],
      error: null,
    });
    vi.mocked(getTransactionHistory).mockResolvedValue({
      data: [
        txn({ id: 't1', total_amount: 1000, created_at: thisMonth(1) }),
        txn({ id: 't2', total_amount: 500, created_at: lastMonth(10) }),
        txn({ id: 't3', total_amount: 500, created_at: lastMonth(15) }),
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('totals appointments by month with a +10% goal off last month', async () => {
    renderBoard();

    const row = await screen.findByRole('row', { name: /All appointments/ });
    const cells = within(row).getAllByRole('cell');
    // this month = 2, last month = 3, goal = round(3 * 1.1) = 3
    expect(cells[0]).toHaveTextContent('2');
    expect(cells[1]).toHaveTextContent('3');
    expect(cells[2]).toHaveTextContent('3');
  });

  it('breaks appointments out by service', async () => {
    renderBoard();

    const grooming = await screen.findByRole('row', { name: /Grooming/ });
    const gCells = within(grooming).getAllByRole('cell');
    // Grooming: this 1, last 2, goal round(2.2) = 2
    expect(gCells[0]).toHaveTextContent('1');
    expect(gCells[1]).toHaveTextContent('2');
    expect(gCells[2]).toHaveTextContent('2');

    const hotel = screen.getByRole('row', { name: /Pet Hotel/ });
    const hCells = within(hotel).getAllByRole('cell');
    // Hotel: this 0, last 1, goal round(1.1) = 1
    expect(hCells[0]).toHaveTextContent('0');
    expect(hCells[1]).toHaveTextContent('1');
    expect(hCells[2]).toHaveTextContent('1');
  });

  it('sums revenue by transaction month with a currency goal', async () => {
    renderBoard();

    const row = await screen.findByRole('row', { name: /Revenue/ });
    const cells = within(row).getAllByRole('cell');
    // this month = 1000, last month = 1000, goal = 1100
    expect(cells[0]).toHaveTextContent('₱1,000.00');
    expect(cells[1]).toHaveTextContent('₱1,000.00');
    expect(cells[2]).toHaveTextContent('₱1,100.00');
  });

  it('surfaces a load error', async () => {
    vi.mocked(listBookings).mockResolvedValue({ data: null, error: 'boom' });

    renderBoard();

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
