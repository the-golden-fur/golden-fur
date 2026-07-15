import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  checkMfaLockout,
  incrementMfaLockout,
  resetMfaLockout,
} from './mfaLockout.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('mfaLockout.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('reports unlocked when the user has no lockout row', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as any);

    await expect(checkMfaLockout('user-id')).resolves.toEqual({
      locked: false,
      lockedUntil: null,
      retryAfterSeconds: null,
      failedAttempts: 0,
    });
  });

  it('increments failed attempts without locking before the threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));

    const maybeSingle = vi.fn().mockResolvedValue({
      data: { failed_attempts: 3, locked_until: null },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const readSelect = vi.fn().mockReturnValue({ eq });
    const single = vi.fn().mockResolvedValue({
      data: { failed_attempts: 4, locked_until: null },
      error: null,
    });
    const writeSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: writeSelect });

    vi.mocked(supabase.from)
      .mockReturnValueOnce({ select: readSelect } as any)
      .mockReturnValueOnce({ upsert } as any);

    const status = await incrementMfaLockout('user-id');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-id',
        failed_attempts: 4,
        locked_until: null,
      }),
      { onConflict: 'user_id' }
    );
    expect(status.locked).toBe(false);
    expect(status.failedAttempts).toBe(4);
  });

  it('locks for 15 minutes on the fifth failed attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));

    const lockedUntil = '2026-07-04T00:15:00.000Z';
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { failed_attempts: 4, locked_until: null },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const readSelect = vi.fn().mockReturnValue({ eq });
    const single = vi.fn().mockResolvedValue({
      data: { failed_attempts: 5, locked_until: lockedUntil },
      error: null,
    });
    const writeSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: writeSelect });

    vi.mocked(supabase.from)
      .mockReturnValueOnce({ select: readSelect } as any)
      .mockReturnValueOnce({ upsert } as any);

    const status = await incrementMfaLockout('user-id');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-id',
        failed_attempts: 5,
        locked_until: lockedUntil,
      }),
      { onConflict: 'user_id' }
    );
    expect(status).toEqual({
      locked: true,
      lockedUntil,
      retryAfterSeconds: 900,
      failedAttempts: 5,
    });
  });

  it('resets attempts and clears the lockout on success', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as any);

    await resetMfaLockout('user-id');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-id',
        failed_attempts: 0,
        locked_until: null,
      }),
      { onConflict: 'user_id' }
    );
  });
});
