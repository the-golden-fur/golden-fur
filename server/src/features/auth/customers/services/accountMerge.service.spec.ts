import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeOrCreate } from './accountMerge.service.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('accountMerge.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = (provider: string, email: string, facebookId?: string) =>
    ({
      user: {
        id: 'test-user-id',
        email,
        app_metadata: { provider },
        user_metadata: {
          full_name: 'Test User',
          ...(facebookId && { provider_id: facebookId }),
        },
      },
    }) as any;

  it('throws error if email is missing', async () => {
    await expect(
      mergeOrCreate({
        user: { email: '', app_metadata: {}, user_metadata: {} },
      } as any)
    ).rejects.toThrow('Email is required for account merge');
  });

  it('creates new profile when no matching email is found', async () => {
    const session = mockSession('google', 'new@test.com');
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnValue({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock chaining
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'customer_profiles') {
        return {
          select: selectMock,
          eq: eqMock,
          insert: insertMock,
        };
      }
    });

    const result = await mergeOrCreate(session);

    expect(result.action).toBe('created');
    expect(result.profile.primary_auth_provider).toBe('google');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_email: 'new@test.com',
        primary_auth_provider: 'google',
      })
    );
  });

  it('merges profile when matching email is found (match-by-email)', async () => {
    const session = mockSession('google', 'existing@test.com');
    const selectMock = vi.fn().mockReturnThis();
    const eqSelectMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'existing-id',
          account_email: 'existing@test.com',
          primary_auth_provider: 'email',
        },
        error: null,
      }),
    });
    const updateMock = vi.fn().mockReturnThis();
    const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'customer_profiles') {
        return {
          select: selectMock,
          update: updateMock,
          eq: (field: string, value: any) => {
            if (field === 'account_email') return eqSelectMock(field, value);
            if (field === 'id') return eqUpdateMock(field, value);
          },
        };
      }
    });

    const result = await mergeOrCreate(session);

    expect(result.action).toBe('merged');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primary_auth_provider: 'google',
      })
    );
  });

  it('updates facebook_id during merge (double-provider)', async () => {
    const session = mockSession('facebook', 'existing@test.com', 'fb-12345');
    const selectMock = vi.fn().mockReturnThis();
    const eqSelectMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'existing-id',
          account_email: 'existing@test.com',
          primary_auth_provider: 'google',
        },
        error: null,
      }),
    });
    const updateMock = vi.fn().mockReturnThis();
    const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'customer_profiles') {
        return {
          select: selectMock,
          update: updateMock,
          eq: (field: string, value: any) => {
            if (field === 'account_email') return eqSelectMock(field, value);
            if (field === 'id') return eqUpdateMock(field, value);
          },
        };
      }
    });

    const result = await mergeOrCreate(session);

    expect(result.action).toBe('merged');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primary_auth_provider: 'facebook',
        facebook_id: 'fb-12345',
      })
    );
  });
});
