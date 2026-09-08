import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCareLogCompletedNotification } from './careLogNotifications.service.ts';
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
