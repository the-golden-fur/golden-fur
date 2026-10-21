import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBookingActivityReport } from './bookingActivity.service.ts';
import { listBookings } from '../../booking/services/booking.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../booking/services/booking.service.ts', () => ({
  listBookings: vi.fn(),
}));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

function stubNameLookups(
  pets: unknown = { data: [] },
  customers: unknown = { data: [] }
) {
  const petBuilder: Record<string, unknown> = {};
  petBuilder.select = vi.fn(() => petBuilder);
  petBuilder.in = vi.fn(() => Promise.resolve(pets));

  const customerBuilder: Record<string, unknown> = {};
  customerBuilder.select = vi.fn(() => customerBuilder);
  customerBuilder.in = vi.fn(() => Promise.resolve(customers));

  vi.mocked(supabase.from).mockImplementation(
    (table: string) =>
      (table === 'pets' ? petBuilder : customerBuilder) as never
  );
}

function booking(overrides: Record<string, unknown>) {
  return {
    id: 'bk-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-makati',
    service_category: 'Grooming',
    scheduled_start: '2026-10-19T01:00:00.000Z',
    scheduled_end: '2026-10-19T02:00:00.000Z',
    status: 'Pending',
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getBookingActivityReport', () => {
  it('Admin/Supervisor are pinned to their own branch regardless of what branchId they pass', async () => {
    vi.mocked(listBookings).mockResolvedValue([] as never);
    stubNameLookups();

    await getBookingActivityReport({
      requesterId: 'staff-1',
      requesterRole: 'Admin',
      requesterBranchId: 'branch-makati',
      branchId: 'branch-southwoods',
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
    });

    expect(listBookings).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      filters: {
        branchId: 'branch-makati',
        dateFrom: '2026-10-19',
        dateTo: '2026-10-19',
      },
    });
  });

  it('Superadmin may request a specific branch, or omit one for the combined view', async () => {
    vi.mocked(listBookings).mockResolvedValue([] as never);
    stubNameLookups();

    const result = await getBookingActivityReport({
      requesterId: 'staff-1',
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      branchId: null,
      dateFrom: '2026-10-19',
      dateTo: '2026-10-20',
    });

    expect(listBookings).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      filters: {
        branchId: undefined,
        dateFrom: '2026-10-19',
        dateTo: '2026-10-20',
      },
    });
    expect(result.branch_id).toBeNull();
  });

  it('counts each status bucket from the returned bookings', async () => {
    vi.mocked(listBookings).mockResolvedValue([
      booking({ id: 'bk-pending', status: 'Pending' }),
      booking({ id: 'bk-late', status: 'Late' }),
      booking({
        id: 'bk-in-progress',
        status: 'In Progress',
        started_at: '2026-10-19T01:05:00.000Z',
      }),
      booking({
        id: 'bk-completed',
        status: 'Completed',
        started_at: '2026-10-19T01:05:00.000Z',
        completed_at: '2026-10-19T02:00:00.000Z',
      }),
      booking({ id: 'bk-noshow', status: 'No-show' }),
      booking({ id: 'bk-cancelled', status: 'Cancelled' }),
    ] as never);
    stubNameLookups();

    const result = await getBookingActivityReport({
      requesterId: 'staff-1',
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
    });

    expect(result.totals).toEqual({
      total_bookings: 6,
      pending: 1,
      late: 1,
      checked_in: 2,
      checked_out: 1,
      no_show: 1,
      cancelled: 1,
    });
  });

  it("resolves each record's pet and customer name from a batched lookup", async () => {
    vi.mocked(listBookings).mockResolvedValue([
      booking({ pet_id: 'pet-1', customer_id: 'cust-1' }),
    ] as never);
    stubNameLookups(
      { data: [{ id: 'pet-1', name: 'Mochi' }] },
      { data: [{ id: 'cust-1', full_name: 'Ada Lovelace' }] }
    );

    const result = await getBookingActivityReport({
      requesterId: 'staff-1',
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
    });

    expect(result.records[0]).toMatchObject({
      pet_name: 'Mochi',
      customer_name: 'Ada Lovelace',
    });
  });

  it('falls back to a null name when the pet/customer lookup comes up empty', async () => {
    vi.mocked(listBookings).mockResolvedValue([booking({})] as never);
    stubNameLookups();

    const result = await getBookingActivityReport({
      requesterId: 'staff-1',
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
    });

    expect(result.records[0]).toMatchObject({
      pet_name: null,
      customer_name: null,
    });
  });
});
