import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendFollowUpScheduledNotification } from './followUpNotifications.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendFollowUpScheduledEmail } from '../../../shared/email/followUpScheduledEmail.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../shared/email/followUpScheduledEmail.ts', () => ({
  sendFollowUpScheduledEmail: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Results by table, since the four lookups run in parallel. */
function stubLookups(byTable: Record<string, QueryResult>) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve(byTable[table] ?? { data: null, error: null })
    );
    return builder;
  }) as never);
}

const BOOKING = {
  id: 'booking-2',
  customer_id: 'customer-1',
  pet_id: 'pet-1',
  branch_id: 'branch-makati',
  // 10:00 AM in Manila.
  scheduled_start: '2026-08-01T02:00:00.000Z',
};

function notification() {
  return vi.mocked(createNotification).mock.calls[0][0];
}

describe('sendFollowUpScheduledNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tells the owner when, with whom and why the follow-up is booked', async () => {
    stubLookups({
      customer_profiles: {
        data: { account_email: 'c@example.com' },
        error: null,
      },
      branches: {
        data: { name: 'Makati', timezone: 'Asia/Manila' },
        error: null,
      },
      pets: { data: { name: 'Mochi' }, error: null },
      staff_profiles: { data: { display_name: 'Dr. Reyes' }, error: null },
    });

    await sendFollowUpScheduledNotification({
      booking: BOOKING,
      veterinarianId: 'vet-1',
      reason: 'Recheck the ear',
    });

    expect(notification()).toEqual(
      expect.objectContaining({
        recipientCustomerId: 'customer-1',
        eventType: 'booking_confirmed',
        title: 'Follow-up visit booked',
        relatedBookingId: 'booking-2',
      })
    );
    const { message } = notification();
    expect(message).toContain('Mochi');
    expect(message).toContain('Dr. Reyes');
    expect(message).toContain('Makati');
    expect(message).toContain('Reason: Recheck the ear');
    // In the branch's timezone, not the server's.
    expect(message).toMatch(/10:00/);

    await notification().sendEmail?.();
    expect(sendFollowUpScheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'c@example.com',
        petName: 'Mochi',
        veterinarianName: 'Dr. Reyes',
        reason: 'Recheck the ear',
      })
    );
  });

  it('still notifies in-app when the owner has no email on file', async () => {
    stubLookups({
      customer_profiles: { data: { account_email: null }, error: null },
    });

    await sendFollowUpScheduledNotification({
      booking: BOOKING,
      veterinarianId: 'vet-1',
      reason: 'Recheck the ear',
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(notification().sendEmail).toBeUndefined();
  });

  it('never throws when sending fails', async () => {
    stubLookups({});
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      sendFollowUpScheduledNotification({
        booking: BOOKING,
        veterinarianId: 'vet-1',
        reason: 'Recheck the ear',
      })
    ).resolves.toBeUndefined();

    consoleError.mockRestore();
  });
});
