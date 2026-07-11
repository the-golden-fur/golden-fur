import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveStaffLoginIdentifier,
  signInWithPassword,
  getStaffRole,
  getStaffBranch,
  createCustomerAuthUser,
  createCustomerProfile,
  getCustomerProfileByEmail,
  enrollTotpFactor,
  getTotpEnrollmentStatus,
  unenrollAllTotpFactors,
  findTotpFactorForVerify,
} from './supabaseAuth.api.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      admin: {
        createUser: vi.fn(),
      },
    },
  },
}));

const mockSignInClient = {
  auth: {
    signInWithPassword: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => mockSignInClient),
  };
});

describe('supabaseAuth.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveStaffLoginIdentifier', () => {
    it('passes an email-shaped identifier straight through without querying', async () => {
      const email = await resolveStaffLoginIdentifier('staff@example.com');

      expect(email).toBe('staff@example.com');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('resolves a username to its registered_email', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { registered_email: 'staff@example.com' },
            error: null,
          }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const email = await resolveStaffLoginIdentifier('staffuser');

      expect(supabase.from).toHaveBeenCalledWith('staff_profiles');
      expect(email).toBe('staff@example.com');
    });

    it('throws when the username lookup fails', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error('Not found') }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      await expect(resolveStaffLoginIdentifier('staffuser')).rejects.toThrow(
        'Profile resolution failed'
      );
    });
  });

  describe('signInWithPassword', () => {
    it('delegates to a throwaway client, not the shared service-role singleton', async () => {
      mockSignInClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'acc' } },
        error: null,
      } as any);

      const result = await signInWithPassword('staff@example.com', 'pw');

      expect(mockSignInClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'staff@example.com',
        password: 'pw',
      });
      expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(result.data.session).toEqual({ access_token: 'acc' });
    });
  });

  describe('getStaffRole', () => {
    it('queries staff_profiles.role by id', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: 'Admin' }, error: null }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { data } = await getStaffRole('staff-1');

      expect(supabase.from).toHaveBeenCalledWith('staff_profiles');
      expect(mockSelect).toHaveBeenCalledWith('role');
      expect(data).toEqual({ role: 'Admin' });
    });
  });

  describe('getStaffBranch', () => {
    it('queries staff_profiles.role,branch_id by id', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { role: 'Receptionist', branch_id: 'branch-makati' },
            error: null,
          }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { data } = await getStaffBranch('staff-1');

      expect(supabase.from).toHaveBeenCalledWith('staff_profiles');
      expect(mockSelect).toHaveBeenCalledWith('role, branch_id');
      expect(data).toEqual({
        role: 'Receptionist',
        branch_id: 'branch-makati',
      });
    });
  });

  describe('createCustomerAuthUser', () => {
    it('delegates to supabase.auth.admin.createUser with email_confirm true', async () => {
      vi.mocked(supabase.auth.admin.createUser).mockResolvedValue({
        data: { user: { id: 'user-id' } },
        error: null,
      } as any);

      await createCustomerAuthUser('john@example.com', 'password123', {
        full_name: 'John Doe',
      });

      expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'password123',
        email_confirm: true,
        user_metadata: { full_name: 'John Doe' },
      });
    });
  });

  describe('createCustomerProfile', () => {
    it('inserts a row into customer_profiles', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

      const fields = {
        id: 'user-id',
        account_email: 'john@example.com',
        full_name: 'John Doe',
        primary_auth_provider: 'email' as const,
      };

      await createCustomerProfile(fields);

      expect(supabase.from).toHaveBeenCalledWith('customer_profiles');
      expect(insertMock).toHaveBeenCalledWith(fields);
    });
  });

  describe('getCustomerProfileByEmail', () => {
    it('looks up a customer profile by account_email', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'existing-id', account_email: 'john@example.com' },
            error: null,
          }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { data } = await getCustomerProfileByEmail('john@example.com');

      expect(supabase.from).toHaveBeenCalledWith('customer_profiles');
      expect(data).toEqual({
        id: 'existing-id',
        account_email: 'john@example.com',
      });
    });
  });

  describe('enrollTotpFactor', () => {
    function mockUserClient() {
      return {
        auth: {
          mfa: {
            listFactors: vi.fn(),
            unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
            enroll: vi.fn().mockResolvedValue({
              data: { id: 'new-factor', type: 'totp' },
              error: null,
            }),
          },
        },
      } as any;
    }

    it('enrolls a fresh TOTP factor when the caller has none', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: { all: [] },
        error: null,
      });

      const { data } = await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.unenroll).not.toHaveBeenCalled();
      expect(userClient.auth.mfa.enroll).toHaveBeenCalledWith({
        factorType: 'totp',
        issuer: 'Golden Fur',
      });
      expect(data).toEqual({ id: 'new-factor', type: 'totp' });
    });

    it('unenrolls prior unverified factors before enrolling a new one', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [
            { id: 'stale-1', factor_type: 'totp', status: 'unverified' },
            { id: 'stale-2', factor_type: 'totp', status: 'unverified' },
          ],
        },
        error: null,
      });

      await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'stale-1',
      });
      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'stale-2',
      });
      expect(userClient.auth.mfa.enroll).toHaveBeenCalledWith({
        factorType: 'totp',
        issuer: 'Golden Fur',
      });
    });

    it('does not unenroll an already-verified factor on the initial pass', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'verified-1', factor_type: 'totp', status: 'verified' }],
        },
        error: null,
      });

      await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.unenroll).not.toHaveBeenCalled();
    });

    it('ignores non-totp factors when deciding what to clean up', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'phone-1', factor_type: 'phone', status: 'unverified' }],
        },
        error: null,
      });

      await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.unenroll).not.toHaveBeenCalled();
      expect(userClient.auth.mfa.enroll).toHaveBeenCalledWith({
        factorType: 'totp',
        issuer: 'Golden Fur',
      });
    });

    it('retries once by re-cleaning and re-enrolling when a racing call already claimed the factor', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors
        .mockResolvedValueOnce({ data: { all: [] }, error: null })
        .mockResolvedValueOnce({
          data: {
            all: [
              {
                id: 'racing-factor',
                factor_type: 'totp',
                status: 'unverified',
              },
            ],
          },
          error: null,
        });
      userClient.auth.mfa.enroll
        .mockResolvedValueOnce({
          data: null,
          error: new Error(
            'A factor with the friendly name "" for this user already exists'
          ),
        })
        .mockResolvedValueOnce({
          data: { id: 'fresh-factor', type: 'totp' },
          error: null,
        });

      const { data, error } = await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.listFactors).toHaveBeenCalledTimes(2);
      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'racing-factor',
      });
      expect(userClient.auth.mfa.enroll).toHaveBeenCalledTimes(2);
      expect(error).toBeNull();
      expect(data).toEqual({ id: 'fresh-factor', type: 'totp' });
    });

    it('escalates to removing a stale verified factor when the conflict survives the first retry', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [
            { id: 'stale-verified', factor_type: 'totp', status: 'verified' },
          ],
        },
        error: null,
      });
      userClient.auth.mfa.enroll
        .mockResolvedValueOnce({
          data: null,
          error: new Error('A factor with the friendly name "" already exists'),
        })
        .mockResolvedValueOnce({
          data: null,
          error: new Error('A factor with the friendly name "" already exists'),
        })
        .mockResolvedValueOnce({
          data: { id: 'fresh-factor', type: 'totp' },
          error: null,
        });

      const { data, error } = await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'stale-verified',
      });
      expect(userClient.auth.mfa.enroll).toHaveBeenCalledTimes(3);
      expect(error).toBeNull();
      expect(data).toEqual({ id: 'fresh-factor', type: 'totp' });
    });

    it('gives up after the escalated attempt still conflicts (e.g. verified factor needs aal2 to remove)', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: {
          all: [
            { id: 'stuck-verified', factor_type: 'totp', status: 'verified' },
          ],
        },
        error: null,
      });
      userClient.auth.mfa.unenroll.mockResolvedValue({
        data: null,
        error: new Error('AAL2 required'),
      });
      userClient.auth.mfa.enroll.mockResolvedValue({
        data: null,
        error: new Error('A factor with the friendly name "" already exists'),
      });

      const { data, error } = await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.enroll).toHaveBeenCalledTimes(3);
      expect(data).toBeNull();
      expect(error?.message).toContain('already exists');
    });

    it('does not retry for an unrelated enroll error', async () => {
      const userClient = mockUserClient();
      userClient.auth.mfa.listFactors.mockResolvedValue({
        data: { all: [] },
        error: null,
      });
      userClient.auth.mfa.enroll.mockResolvedValueOnce({
        data: null,
        error: new Error('Something else went wrong'),
      });

      const { error } = await enrollTotpFactor(userClient);

      expect(userClient.auth.mfa.enroll).toHaveBeenCalledTimes(1);
      expect(error?.message).toBe('Something else went wrong');
    });
  });

  describe('getTotpEnrollmentStatus', () => {
    it('reports enrolled when a verified TOTP factor exists', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'factor-1', factor_type: 'totp', status: 'verified' },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data } = await getTotpEnrollmentStatus(userClient);

      expect(data).toEqual({ enrolled: true });
    });

    it('reports not enrolled when only unverified/no factors exist', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'factor-1', factor_type: 'totp', status: 'unverified' },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data } = await getTotpEnrollmentStatus(userClient);

      expect(data).toEqual({ enrolled: false });
    });

    it('ignores non-totp factors when computing enrollment status', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'phone-1', factor_type: 'phone', status: 'verified' },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data } = await getTotpEnrollmentStatus(userClient);

      expect(data).toEqual({ enrolled: false });
    });

    it('returns an error when listFactors fails', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('boom'),
            }),
          },
        },
      } as any;

      const { data, error } = await getTotpEnrollmentStatus(userClient);

      expect(data).toBeNull();
      expect(error).toBeTruthy();
    });
  });

  describe('unenrollAllTotpFactors', () => {
    it('unenrolls every totp factor and reports them all removed', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'factor-1', factor_type: 'totp', status: 'verified' },
                  { id: 'factor-2', factor_type: 'totp', status: 'unverified' },
                ],
              },
              error: null,
            }),
            unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
          },
        },
      } as any;

      const { removed, failed } = await unenrollAllTotpFactors(userClient);

      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'factor-1',
      });
      expect(userClient.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: 'factor-2',
      });
      expect(removed).toEqual(expect.arrayContaining(['factor-1', 'factor-2']));
      expect(failed).toEqual([]);
    });

    it('reports a per-factor failure without throwing (e.g. verified factor needs aal2)', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'factor-1', factor_type: 'totp', status: 'verified' },
                ],
              },
              error: null,
            }),
            unenroll: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('AAL2 required'),
            }),
          },
        },
      } as any;

      const { removed, failed } = await unenrollAllTotpFactors(userClient);

      expect(removed).toEqual([]);
      expect(failed).toEqual([
        { factorId: 'factor-1', message: 'AAL2 required' },
      ]);
    });

    it('returns an empty result when the caller has no factors', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi
              .fn()
              .mockResolvedValue({ data: { all: [] }, error: null }),
            unenroll: vi.fn(),
          },
        },
      } as any;

      const { removed, failed } = await unenrollAllTotpFactors(userClient);

      expect(removed).toEqual([]);
      expect(failed).toEqual([]);
      expect(userClient.auth.mfa.unenroll).not.toHaveBeenCalled();
    });
  });

  describe('findTotpFactorForVerify', () => {
    it('finds a just-enrolled unverified factor (regression: .totp is verified-only, .all is not)', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  {
                    id: 'fresh-factor',
                    factor_type: 'totp',
                    status: 'unverified',
                  },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data, error } = await findTotpFactorForVerify(userClient);

      expect(error).toBeNull();
      expect(data).toEqual({
        id: 'fresh-factor',
        factor_type: 'totp',
        status: 'unverified',
      });
    });

    it('prefers a verified factor over an unverified one', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  {
                    id: 'stale-unverified',
                    factor_type: 'totp',
                    status: 'unverified',
                  },
                  {
                    id: 'active-verified',
                    factor_type: 'totp',
                    status: 'verified',
                  },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data } = await findTotpFactorForVerify(userClient);

      expect(data?.id).toBe('active-verified');
    });

    it('ignores non-totp factors', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi.fn().mockResolvedValue({
              data: {
                all: [
                  { id: 'phone-1', factor_type: 'phone', status: 'verified' },
                ],
              },
              error: null,
            }),
          },
        },
      } as any;

      const { data } = await findTotpFactorForVerify(userClient);

      expect(data).toBeNull();
    });

    it('returns null (not an error) when the caller has no factors at all', async () => {
      const userClient = {
        auth: {
          mfa: {
            listFactors: vi
              .fn()
              .mockResolvedValue({ data: { all: [] }, error: null }),
          },
        },
      } as any;

      const { data, error } = await findTotpFactorForVerify(userClient);

      expect(data).toBeNull();
      expect(error).toBeNull();
    });
  });
});
