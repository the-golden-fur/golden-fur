import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendCareLogCompletedNotification,
  sendStayCheckedOutNotification,
} from './careLogNotifications.service.ts';
import { sendStayCheckedOutEmail } from '../../../shared/email/stayCheckedOutEmail.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { resolveEffectivePolicy } from '../../booking/services/staffPicker.service.ts';
import type { CareLogEntry } from '../hotel.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../booking/services/staffPicker.service.ts', () => ({
  resolveEffectivePolicy: vi.fn(),
}));

vi.mock('../../../shared/email/careLogCompletedEmail.ts', () => ({
  sendCareLogCompletedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../shared/email/stayCheckedOutEmail.ts', () => ({
  sendStayCheckedOutEmail: vi.fn().mockResolvedValue(undefined),
}));

function mockLookups() {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve(
        table === 'pets'
          ? { data: { name: 'Rex', customer_id: 'cust-1' }, error: null }
          : { data: { account_email: 'owner@example.com' }, error: null }
      )
    );
    return builder;
  }) as never);
}

const ENTRY = {
  id: 'entry-1',
  description: 'Morning walk',
  stays: { branch_id: 'branch-1' },
} as unknown as CareLogEntry;

describe('sendCareLogCompletedNotification - per-task email gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookups();
  });

  it('omits the email thunk when care_log_task_email_enabled is false (default)', async () => {
    vi.mocked(resolveEffectivePolicy).mockResolvedValue({
      care_log_task_email_enabled: false,
    } as never);

    await sendCareLogCompletedNotification(ENTRY, 'pet-1');

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'care_log_completed',
        sendEmail: undefined,
      })
    );
  });

  it('attaches the email thunk when an admin enables care_log_task_email_enabled', async () => {
    vi.mocked(resolveEffectivePolicy).mockResolvedValue({
      care_log_task_email_enabled: true,
    } as never);

    await sendCareLogCompletedNotification(ENTRY, 'pet-1');

    const call = vi.mocked(createNotification).mock.calls[0][0];
    expect(typeof call.sendEmail).toBe('function');
  });
});

describe('sendStayCheckedOutNotification', () => {
  function mockCheckoutLookups({
    pet = { name: 'Rex', customer_id: 'cust-1' } as unknown,
    email = 'owner@example.com' as string | null,
  } = {}) {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq']) {
        builder[method] = vi.fn(() => builder);
      }
      const data =
        table === 'pets'
          ? pet
          : table === 'branches'
            ? { name: 'Southwoods', timezone: 'Asia/Manila' }
            : email
              ? { account_email: email }
              : null;
      builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
      return builder;
    }) as never);
  }

  const PARAMS = {
    stayType: 'Hotel' as const,
    petId: 'pet-1',
    branchId: 'branch-1',
    bookingId: 'booking-1',
    // 18:30 in Manila.
    checkedOutAt: new Date('2026-10-20T10:30:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies the owner in-app and emails them', async () => {
    mockCheckoutLookups();

    await sendStayCheckedOutNotification(PARAMS);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'cust-1',
        eventType: 'stay_checked_out',
        title: 'Rex has been checked out',
        relatedBookingId: 'booking-1',
        sendEmail: expect.any(Function),
      })
    );

    const { sendEmail } = vi.mocked(createNotification).mock.calls[0][0];
    await sendEmail!();
    expect(sendStayCheckedOutEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        petName: 'Rex',
        branchName: 'Southwoods',
        stayLabel: 'hotel stay',
        checkedOutAt: expect.stringContaining('6:30'),
      })
    );
  });

  it('still notifies in-app, without an email, when the owner has no address', async () => {
    mockCheckoutLookups({ email: null });

    await sendStayCheckedOutNotification(PARAMS);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ sendEmail: undefined })
    );
  });

  it('notifies a walk-in owner even with no booking row', async () => {
    mockCheckoutLookups();

    await sendStayCheckedOutNotification({
      ...PARAMS,
      stayType: 'Daycare',
      bookingId: null,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'cust-1',
        relatedBookingId: undefined,
      })
    );
  });

  it('never throws - a failed lookup is logged, not passed to the checkout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('connection lost');
    });

    await expect(
      sendStayCheckedOutNotification(PARAMS)
    ).resolves.toBeUndefined();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
