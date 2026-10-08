import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runStayCheckoutJob } from './stayCheckout.job.ts';
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
/** Every update() payload, in order. */
let updateCalls: unknown[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  filterCalls = [];
  updateCalls = [];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);
    builder.update = vi.fn((payload: unknown) => {
      updateCalls.push(payload);
      return builder;
    });
    for (const method of ['eq', 'in', 'is', 'not', 'lte']) {
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

// 16:00 in Manila.
const NOW = new Date('2026-10-04T08:00:00.000Z');

const DAYCARE_STAY = {
  id: 'stay-1',
  booking_id: 'booking-1',
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  stay_type: 'Daycare',
  checkout_reminder_notified_at: null,
};

const HOTEL_STAY = { ...DAYCARE_STAY, stay_type: 'Hotel' };

function booking(scheduledEnd: string, payAtCheckout = false) {
  return {
    id: 'booking-1',
    customer_id: 'customer-1',
    scheduled_end: scheduledEnd,
    pay_at_checkout: payAtCheckout,
  };
}

// Checkout at 16:10 Manila - inside the 15-minute reminder window.
const IN_10_MINUTES = '2026-10-04T08:10:00.000Z';
// Checkout at 15:55 Manila - countdown already complete.
const FIVE_MINUTES_AGO = '2026-10-04T07:55:00.000Z';

/** The claim, then the customer/branch/pet lookups behind the message. */
const CLAIM_AND_LOOKUPS: QueryResult[] = [
  { data: { id: 'stay-1' }, error: null },
  { data: { account_email: 'c@example.com' }, error: null },
  { data: { name: 'Makati', timezone: 'Asia/Manila' }, error: null },
  { data: { name: 'Mochi' }, error: null },
];

function sentNotification() {
  return vi.mocked(createNotification).mock.calls[0][0];
}

describe('stayCheckout.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no booked pet is checked in', async () => {
    queueFromResults({ data: [], error: null });

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    // Only the stays query ran - no bookings lookup for an empty result set.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('only considers Active, booked Hotel/Daycare stays not yet told time is up', async () => {
    queueFromResults({ data: [], error: null });

    await runStayCheckoutJob(NOW);

    expect(filterCalls).toContainEqual(['eq', 'status', 'Active']);
    expect(filterCalls).toContainEqual([
      'in',
      'stay_type',
      ['Hotel', 'Daycare'],
    ]);
    expect(filterCalls).toContainEqual(['is', 'overdue_notified_at', null]);
    // Walk-ins have no booked checkout time.
    expect(filterCalls).toContainEqual(['not', 'booking_id', 'is', null]);
  });

  it('only looks at bookings whose checkout is at most 15 minutes away', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [], error: null }
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(filterCalls).toContainEqual([
      'lte',
      'scheduled_end',
      '2026-10-04T08:15:00.000Z',
    ]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('sends the 15-minute reminder before checkout, with the fee for Daycare', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking(IN_10_MINUTES)], error: null },
      ...CLAIM_AND_LOOKUPS
    );

    expect(await runStayCheckoutJob(NOW)).toBe(1);
    expect(updateCalls).toEqual([
      { checkout_reminder_notified_at: NOW.toISOString() },
    ]);
    expect(sentNotification()).toEqual(
      expect.objectContaining({
        recipientCustomerId: 'customer-1',
        eventType: 'checkout_reminder',
        title: 'Checkout in 15 minutes',
        relatedBookingId: 'booking-1',
      })
    );
    expect(sentNotification().message).toContain('Mochi');
    // Formatted in the branch's timezone, not the server's.
    expect(sentNotification().message).toMatch(/4:10/);
    expect(sentNotification().message).toContain('₱50 per hour');
  });

  it('does not repeat the reminder once it has been sent', async () => {
    queueFromResults(
      {
        data: [
          {
            ...DAYCARE_STAY,
            checkout_reminder_notified_at: '2026-10-04T07:56:00.000Z',
          },
        ],
        error: null,
      },
      { data: [booking(IN_10_MINUTES)], error: null }
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(updateCalls).toEqual([]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifies once the countdown is complete, even if the reminder was sent', async () => {
    queueFromResults(
      {
        data: [
          {
            ...DAYCARE_STAY,
            checkout_reminder_notified_at: '2026-10-04T07:40:00.000Z',
          },
        ],
        error: null,
      },
      { data: [booking(FIVE_MINUTES_AGO)], error: null },
      ...CLAIM_AND_LOOKUPS
    );

    expect(await runStayCheckoutJob(NOW)).toBe(1);
    expect(updateCalls).toEqual([{ overdue_notified_at: NOW.toISOString() }]);
    expect(sentNotification()).toEqual(
      expect.objectContaining({
        eventType: 'daycare_overdue',
        title: 'Checkout time is up',
        relatedBookingId: 'booking-1',
        message: expect.stringContaining('₱50 per hour'),
      })
    );
  });

  it('notifies Hotel stays too, without any overdue fee', async () => {
    queueFromResults(
      { data: [HOTEL_STAY], error: null },
      { data: [booking(FIVE_MINUTES_AGO)], error: null },
      ...CLAIM_AND_LOOKUPS
    );

    expect(await runStayCheckoutJob(NOW)).toBe(1);
    expect(sentNotification().eventType).toBe('daycare_overdue');
    expect(sentNotification().message).toContain('hotel stay');
    expect(sentNotification().message).not.toContain('overdue fee');
  });

  it('leaves the fee out for a pay-at-checkout Daycare booking', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking(IN_10_MINUTES, true)], error: null },
      ...CLAIM_AND_LOOKUPS
    );

    expect(await runStayCheckoutJob(NOW)).toBe(1);
    expect(sentNotification().message).not.toContain('overdue fee');
  });

  it('does not double-send when a concurrent run already claimed the notice', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking(FIVE_MINUTES_AGO)], error: null },
      { data: null, error: null } // claim UPDATE matched no row - already taken
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
