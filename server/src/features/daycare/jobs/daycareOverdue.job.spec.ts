import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDaycareOverdueJob } from './daycareOverdue.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Every filter call across every builder this test run made, in order -
 * lets a test assert the query's own filters without reaching into a
 * per-`from()` throwaway spy. */
let filterCalls: Array<[string, ...unknown[]]> = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  filterCalls = [];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'in', 'update']) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ['eq', 'is', 'not', 'lt']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        filterCalls.push([method, ...args]);
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const NOW = new Date('2026-10-04T08:00:00.000Z');

const STAY = {
  id: 'stay-1',
  booking_id: 'booking-1',
  pet_id: 'pet-1',
  branch_id: 'branch-1',
};

const OVERDUE_BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  scheduled_end: '2026-10-04T07:55:00.000Z',
};

describe('daycareOverdue.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no booked Daycare pet is checked in', async () => {
    queueFromResults({ data: [], error: null });

    expect(await runDaycareOverdueJob(NOW)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    // Only the stays query ran - no bookings lookup for an empty result set.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('only considers Active, booked, not-yet-notified Daycare stays', async () => {
    queueFromResults({ data: [], error: null });

    await runDaycareOverdueJob(NOW);

    expect(filterCalls).toContainEqual(['eq', 'stay_type', 'Daycare']);
    expect(filterCalls).toContainEqual(['eq', 'status', 'Active']);
    expect(filterCalls).toContainEqual(['is', 'overdue_notified_at', null]);
    // Walk-ins have no booked end time.
    expect(filterCalls).toContainEqual(['not', 'booking_id', 'is', null]);
  });

  it('does not notify while the booked end time has not passed yet', async () => {
    queueFromResults(
      { data: [STAY], error: null },
      { data: [], error: null } // no booking with scheduled_end < now
    );

    expect(await runDaycareOverdueJob(NOW)).toBe(0);
    expect(filterCalls).toContainEqual([
      'lt',
      'scheduled_end',
      NOW.toISOString(),
    ]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('claims the stay and notifies the owner once the booked end time has passed', async () => {
    queueFromResults(
      { data: [STAY], error: null },
      { data: [OVERDUE_BOOKING], error: null },
      { data: { id: STAY.id }, error: null }, // claim succeeds
      { data: { account_email: 'c@example.com' }, error: null },
      { data: { name: 'Makati' }, error: null },
      { data: { name: 'Mochi' }, error: null }
    );

    expect(await runDaycareOverdueJob(NOW)).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'customer-1',
        eventType: 'daycare_overdue',
        relatedBookingId: 'booking-1',
        message: expect.stringContaining('₱50 per hour'),
      })
    );
    expect(vi.mocked(createNotification).mock.calls[0][0].message).toContain(
      'Mochi'
    );
  });

  it('does not double-send when a concurrent run already claimed the stay', async () => {
    queueFromResults(
      { data: [STAY], error: null },
      { data: [OVERDUE_BOOKING], error: null },
      { data: null, error: null } // claim UPDATE matched no row - already taken
    );

    expect(await runDaycareOverdueJob(NOW)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
