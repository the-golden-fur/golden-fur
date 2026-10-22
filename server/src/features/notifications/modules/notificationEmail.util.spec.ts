import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  customerNotificationEmail,
  staffNotificationEmail,
} from './notificationEmail.util.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendEmail } from '../../../shared/email/brevo.client.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../../shared/email/brevo.client.ts', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const selectCalls: Array<{ table: string; columns: string }> = [];

function returning(row: unknown) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((columns: string) => {
      selectCalls.push({ table, columns });
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: row, error: null })
    );
    return builder;
  }) as never);
}

describe('notificationEmail.util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCalls.length = 0;
  });

  it("emails a customer at their account email, mirroring the notification's title and message", async () => {
    returning({ account_email: 'owner@example.com' });

    await customerNotificationEmail(
      'customer-1',
      'Your booking slot is no longer available',
      'Another customer paid for this slot first.'
    )();

    expect(selectCalls).toEqual([
      { table: 'customer_profiles', columns: 'account_email' },
    ]);
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'owner@example.com',
      subject: 'Golden Fur - Your booking slot is no longer available',
      html: '<p>Another customer paid for this slot first.</p>',
    });
  });

  it('emails a staff member at their registered email', async () => {
    returning({ registered_email: 'groomer@goldenfur.com' });

    await staffNotificationEmail(
      'staff-1',
      'You were selected as preferred staff',
      'Ana selected you.'
    )();

    expect(selectCalls).toEqual([
      { table: 'staff_profiles', columns: 'registered_email' },
    ]);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'groomer@goldenfur.com' })
    );
  });

  it('sends nothing when there is no address on file', async () => {
    returning(null);

    await customerNotificationEmail('customer-1', 'Title', 'Message')();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does no lookup until createNotification actually calls the thunk', () => {
    returning({ account_email: 'owner@example.com' });

    customerNotificationEmail('customer-1', 'Title', 'Message');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('escapes free text in the body (customer names, rejection reasons)', async () => {
    returning({ account_email: 'owner@example.com' });

    await customerNotificationEmail(
      'customer-1',
      'Needs another look',
      'Reason: <b>blurry</b> & unreadable'
    )();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<p>Reason: &lt;b&gt;blurry&lt;/b&gt; &amp; unreadable</p>',
      })
    );
  });
});
