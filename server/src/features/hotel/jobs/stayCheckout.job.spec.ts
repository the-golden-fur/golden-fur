import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatReminderLead, runStayCheckoutJob } from './stayCheckout.job.ts';
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

/** No customer has picked a checkout reminder lead - the 15-minute default
 * applies. */
const NO_PREFERENCES: QueryResult = { data: [], error: null };

function preferring(minutes: number): QueryResult {
  return {
    data: [
      {
        id: 'customer-1',
        notification_preferences: {
          checkout_reminder: {
            email: true,
            in_browser: true,
            reminder_offset_minutes: minutes,
          },
        },
      },
    ],
    error: null,
  };
}

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

  it('only looks at bookings whose checkout is at most the longest lead (1 day) away', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [], error: null }
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(filterCalls).toContainEqual([
      'lte',
      'scheduled_end',
      '2026-10-05T08:00:00.000Z',
    ]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('sends the 15-minute reminder before checkout, with the fee for Daycare', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking(IN_10_MINUTES)], error: null },
      NO_PREFERENCES,
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

  it('skips a 15-minute reminder that is more than 5 minutes overdue (server was asleep)', async () => {
    // Checkout at 16:08 Manila - the reminder was due at 15:53, 7 minutes ago.
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking('2026-10-04T08:08:00.000Z')], error: null },
      NO_PREFERENCES
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(updateCalls).toEqual([]);
    expect(createNotification).not.toHaveBeenCalled();
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
      { data: [booking(IN_10_MINUTES)], error: null },
      NO_PREFERENCES
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
      NO_PREFERENCES,
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
      NO_PREFERENCES,
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
      NO_PREFERENCES,
      ...CLAIM_AND_LOOKUPS
    );

    expect(await runStayCheckoutJob(NOW)).toBe(1);
    expect(sentNotification().message).not.toContain('overdue fee');
  });

  it('does not double-send when a concurrent run already claimed the notice', async () => {
    queueFromResults(
      { data: [DAYCARE_STAY], error: null },
      { data: [booking(FIVE_MINUTES_AGO)], error: null },
      NO_PREFERENCES,
      { data: null, error: null } // claim UPDATE matched no row - already taken
    );

    expect(await runStayCheckoutJob(NOW)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
  describe("the customer's chosen reminder lead", () => {
    // Checkout at 16:50 Manila.
    const IN_50_MINUTES = '2026-10-04T08:50:00.000Z';
    // Checkout at 17:01 Manila.
    const IN_61_MINUTES = '2026-10-04T09:01:00.000Z';

    it('fires an hour ahead for a customer who picked "1 hour before"', async () => {
      queueFromResults(
        { data: [DAYCARE_STAY], error: null },
        { data: [booking(IN_50_MINUTES)], error: null },
        preferring(60),
        ...CLAIM_AND_LOOKUPS
      );

      expect(await runStayCheckoutJob(NOW)).toBe(1);
      expect(sentNotification()).toEqual(
        expect.objectContaining({
          eventType: 'checkout_reminder',
          title: 'Checkout in 1 hour',
          message: expect.stringContaining('1 hour from now'),
        })
      );
    });

    it('waits until the lead time is reached', async () => {
      queueFromResults(
        { data: [DAYCARE_STAY], error: null },
        { data: [booking(IN_61_MINUTES)], error: null },
        preferring(60)
      );

      expect(await runStayCheckoutJob(NOW)).toBe(0);
      expect(updateCalls).toEqual([]);
    });

    it('keeps the 15-minute default when the customer never picked one', async () => {
      queueFromResults(
        { data: [DAYCARE_STAY], error: null },
        { data: [booking(IN_50_MINUTES)], error: null },
        NO_PREFERENCES
      );

      expect(await runStayCheckoutJob(NOW)).toBe(0);
    });

    it('skips the reminder when its moment passed before the pet was checked in', async () => {
      queueFromResults(
        {
          // Checked in at 14:00 Manila - well after "1 day before" a 21:00
          // checkout.
          data: [{ ...DAYCARE_STAY, check_in_at: '2026-10-04T06:00:00.000Z' }],
          error: null,
        },
        { data: [booking('2026-10-04T13:00:00.000Z')], error: null },
        preferring(1440)
      );

      expect(await runStayCheckoutJob(NOW)).toBe(0);
      expect(createNotification).not.toHaveBeenCalled();
    });

    it('sends a 1-day reminder for a Hotel stay checked in days earlier', async () => {
      queueFromResults(
        {
          data: [{ ...HOTEL_STAY, check_in_at: '2026-10-01T06:00:00.000Z' }],
          error: null,
        },
        { data: [booking('2026-10-05T06:00:00.000Z')], error: null },
        preferring(1440),
        ...CLAIM_AND_LOOKUPS
      );

      expect(await runStayCheckoutJob(NOW)).toBe(1);
      expect(sentNotification().title).toBe('Checkout in 1 day');
    });
  });

  it('formats each reminder lead in words', () => {
    expect(formatReminderLead(15)).toBe('15 minutes');
    expect(formatReminderLead(60)).toBe('1 hour');
    expect(formatReminderLead(180)).toBe('3 hours');
    expect(formatReminderLead(1440)).toBe('1 day');
  });
});
