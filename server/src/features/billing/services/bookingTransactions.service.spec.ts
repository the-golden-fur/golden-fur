import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listBookingGroupTransactions,
  listBookingTransactions,
} from './bookingTransactions.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function mockFrom(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.then = (resolve: (_r: QueryResult) => unknown) => resolve(result);

  vi.mocked(supabase.from).mockReturnValue(builder as never);

  return builder;
}

describe('bookingTransactions.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listBookingTransactions: queries transactions by booking_id, oldest first', async () => {
    const builder = mockFrom({
      data: [{ id: 'txn-1', booking_id: 'booking-1' }],
      error: null,
    });

    const result = await listBookingTransactions('booking-1');

    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(builder.eq).toHaveBeenCalledWith('booking_id', 'booking-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: true,
    });
    expect(result).toEqual([{ id: 'txn-1', booking_id: 'booking-1' }]);
  });

  it('listBookingTransactions: surfaces a query error as a 400', async () => {
    mockFrom({ data: null, error: { message: 'boom' } });

    await expect(listBookingTransactions('booking-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('listBookingGroupTransactions (multi-booking checkout): queries transactions by booking_group_id, oldest first', async () => {
    const builder = mockFrom({
      data: [{ id: 'txn-1', booking_group_id: 'group-1' }],
      error: null,
    });

    const result = await listBookingGroupTransactions('group-1');

    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(builder.eq).toHaveBeenCalledWith('booking_group_id', 'group-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: true,
    });
    expect(result).toEqual([{ id: 'txn-1', booking_group_id: 'group-1' }]);
  });

  it('listBookingGroupTransactions: surfaces a query error as a 400', async () => {
    mockFrom({ data: null, error: { message: 'boom' } });

    await expect(listBookingGroupTransactions('group-1')).rejects.toMatchObject(
      { statusCode: 400 }
    );
  });

  it('listBookingGroupTransactions: returns an empty array rather than null when there are no rows', async () => {
    mockFrom({ data: null, error: null });

    const result = await listBookingGroupTransactions('group-1');

    expect(result).toEqual([]);
  });
});
