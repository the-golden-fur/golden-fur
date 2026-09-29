import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getMfaPreference, setMfaPreference } from './mfaPreference.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

describe('mfaPreference.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMfaPreference', () => {
    it('returns the stored preferred_method', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { preferred_method: 'email' },
              error: null,
            }),
          }),
        }),
      } as any);

      expect(await getMfaPreference('user-1')).toBe('email');
    });

    it('defaults to authenticator when no row exists yet', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      } as any);

      expect(await getMfaPreference('user-1')).toBe('authenticator');
    });

    it('throws on a query error', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: null, error: new Error('boom') }),
          }),
        }),
      } as any);

      await expect(getMfaPreference('user-1')).rejects.toThrow('boom');
    });
  });

  describe('setMfaPreference', () => {
    it('upserts the preference keyed on user_id', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ upsert } as any);

      await setMfaPreference('user-1', 'email');

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          preferred_method: 'email',
        }),
        { onConflict: 'user_id' }
      );
    });

    it('throws on a write error', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: new Error('boom') }),
      } as any);

      await expect(setMfaPreference('user-1', 'email')).rejects.toThrow('boom');
    });
  });
});
