import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  msUntilNextRun,
  runPromoExpiryJob,
  startPromoExpiryScheduler,
} from './promoExpiry.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

describe('promoExpiry.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runPromoExpiryJob', () => {
    it('AC-2: invokes deactivate_expired_promos and returns the deactivated count', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 3,
        error: null,
      } as never);

      const count = await runPromoExpiryJob();

      expect(supabase.rpc).toHaveBeenCalledWith('deactivate_expired_promos');
      expect(count).toBe(3);
    });

    it('AC-3 (shape): the job delegates entirely to the SQL function, whose WHERE clause exempts NULL end_date rows - no promo filtering happens in JS', async () => {
      // The NULL-end_date exemption itself is asserted against the real
      // function in testing/docs/issues/42-promos-crud-and-expiry (SQL
      // verification); this guards that the job never adds its own criteria.
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 0,
        error: null,
      } as never);

      await runPromoExpiryJob();

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(supabase.rpc).toHaveBeenCalledWith('deactivate_expired_promos');
    });

    it('throws when the RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'db down' },
      } as never);

      await expect(runPromoExpiryJob()).rejects.toThrow(
        'Promo expiry job failed: db down'
      );
    });
  });

  describe('msUntilNextRun', () => {
    it('targets 00:05 the next day when past 00:05 today', () => {
      const now = new Date('2026-07-15T10:00:00');
      const ms = msUntilNextRun(now);
      const next = new Date(now.getTime() + ms);

      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(5);
      expect(next.getDate()).toBe(16);
    });

    it('targets 00:05 today when before 00:05', () => {
      const now = new Date('2026-07-15T00:01:00');
      const ms = msUntilNextRun(now);

      expect(ms).toBe(4 * 60 * 1000);
    });
  });

  describe('startPromoExpiryScheduler', () => {
    it('runs the job at the next 00:05 and reschedules daily', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T23:00:00'));
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 1,
        error: null,
      } as never);

      const stop = startPromoExpiryScheduler();

      await vi.advanceTimersByTimeAsync(65 * 60 * 1000); // past 00:05
      expect(supabase.rpc).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); // next day
      expect(supabase.rpc).toHaveBeenCalledTimes(2);

      stop();
    });

    it('a failing run is logged and does not stop the schedule', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T23:00:00'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'transient' },
        } as never)
        .mockResolvedValue({ data: 0, error: null } as never);

      const stop = startPromoExpiryScheduler();

      await vi.advanceTimersByTimeAsync(65 * 60 * 1000);
      expect(consoleSpy).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(supabase.rpc).toHaveBeenCalledTimes(2);

      stop();
      consoleSpy.mockRestore();
    });
  });
});
