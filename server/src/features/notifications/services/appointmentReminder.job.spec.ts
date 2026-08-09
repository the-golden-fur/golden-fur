import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAppointmentReminderJob } from './appointmentReminder.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from './notification.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('./notification.service.ts', () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'is', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const NOW = new Date('2026-08-09T12:00:00.000Z');

function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

const BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-1',
  service_category: 'Grooming',
  scheduled_start: hoursFromNow(23),
};

describe('appointmentReminder.job (configurable offset)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no bookings are in the lookahead window', async () => {
    queueFromResults({ data: [], error: null });

    const count = await runAppointmentReminderJob(NOW);

    expect(count).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    // Only the main bookings query ran - no customer_profiles lookup for an
    // empty result set.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('does not send when now is still before the fire time (default 1-day offset, booking is 23h out)', async () => {
    queueFromResults(
      { data: [BOOKING], error: null }, // bookings select
      { data: [], error: null } // customer_profiles offsets - none set, defaults to 1440
    );

    const count = await runAppointmentReminderJob(NOW);

    expect(count).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('sends and claims once the default 1-day fire time has passed', async () => {
    const dueBooking = { ...BOOKING, scheduled_start: hoursFromNow(23.5) };
    // 23.5h out - 24h default offset = fires 0.5h ago, before NOW.
    queueFromResults(
      { data: [dueBooking], error: null },
      { data: [], error: null }, // no stored preference - default applies
      { data: { id: dueBooking.id }, error: null }, // claim succeeds
      { data: { account_email: 'c@example.com' }, error: null }, // customer email
      { data: { name: 'Makati' }, error: null } // branch name
    );

    const count = await runAppointmentReminderJob(NOW);

    expect(count).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'customer-1',
        eventType: 'appointment_reminder',
        relatedBookingId: dueBooking.id,
      })
    );
  });

  it("honors a customer's own reminder_offset_minutes, firing earlier than the default would", async () => {
    // 30 min out - with the default (1440 min) this would NOT be due yet,
    // but this customer set a 60-min offset, so it fires now.
    const soonBooking = { ...BOOKING, scheduled_start: hoursFromNow(0.5) };
    queueFromResults(
      { data: [soonBooking], error: null },
      {
        data: [
          {
            id: 'customer-1',
            notification_preferences: {
              appointment_reminder: { reminder_offset_minutes: 60 },
            },
          },
        ],
        error: null,
      },
      { data: { id: soonBooking.id }, error: null },
      { data: { account_email: 'c@example.com' }, error: null },
      { data: { name: 'Makati' }, error: null }
    );

    const count = await runAppointmentReminderJob(NOW);

    expect(count).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('does not double-send when a concurrent run already claimed the booking', async () => {
    const dueBooking = { ...BOOKING, scheduled_start: hoursFromNow(23.5) };
    queueFromResults(
      { data: [dueBooking], error: null },
      { data: [], error: null },
      { data: null, error: null } // claim UPDATE matched no row - already taken
    );

    const count = await runAppointmentReminderJob(NOW);

    expect(count).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
