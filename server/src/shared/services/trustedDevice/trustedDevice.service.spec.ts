import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  issueTrustedDeviceToken,
  isTrustedDevice,
  revokeAllTrustedDevices,
} from './trustedDevice.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

describe('trustedDevice.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('issueTrustedDeviceToken', () => {
    it('inserts a hashed row and returns the raw token, not the hash', async () => {
      const insert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ insert } as any);

      const token = await issueTrustedDeviceToken('user-1');

      expect(token).toEqual(expect.any(String));
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1' })
      );
      const inserted = insert.mock.calls[0][0];
      expect(inserted.token_hash).not.toBe(token);
      expect(new Date(inserted.expires_at).getTime()).toBeGreaterThan(
        Date.now() + 29 * 24 * 60 * 60 * 1000
      );
    });

    it('throws on an insert error', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: new Error('boom') }),
      } as any);

      await expect(issueTrustedDeviceToken('user-1')).rejects.toThrow('boom');
    });
  });

  describe('isTrustedDevice', () => {
    function mockLookup(row: unknown) {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'trusted_devices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi
                    .fn()
                    .mockResolvedValue({ data: row, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
          } as any;
        }
        return {} as any;
      });
    }

    it('returns false when no matching row exists', async () => {
      mockLookup(null);
      expect(await isTrustedDevice('user-1', 'some-token')).toBe(false);
    });

    it('returns false when the row has expired', async () => {
      mockLookup({
        id: 'row-1',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      expect(await isTrustedDevice('user-1', 'some-token')).toBe(false);
    });

    it('returns true for a matching, unexpired row', async () => {
      mockLookup({
        id: 'row-1',
        expires_at: new Date(Date.now() + 1000 * 60).toISOString(),
      });
      expect(await isTrustedDevice('user-1', 'some-token')).toBe(true);
    });
  });

  describe('revokeAllTrustedDevices', () => {
    it('deletes every trusted-device row for the user', async () => {
      const deleteEq = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: deleteEq }),
      } as any);

      await revokeAllTrustedDevices('user-1');

      expect(deleteEq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('throws on a delete error', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('boom') }),
        }),
      } as any);

      await expect(revokeAllTrustedDevices('user-1')).rejects.toThrow('boom');
    });
  });
});
