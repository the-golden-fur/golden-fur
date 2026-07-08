import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveStaffLoginIdentifier,
  signInWithPassword,
  getStaffRole,
  getStaffBranch,
  createCustomerAuthUser,
  createCustomerProfile,
  getCustomerProfileByEmail,
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
    it('delegates to supabase.auth.signInWithPassword', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { session: { access_token: 'acc' } },
        error: null,
      } as any);

      const result = await signInWithPassword('staff@example.com', 'pw');

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'staff@example.com',
        password: 'pw',
      });
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
      expect(data).toEqual({ role: 'Receptionist', branch_id: 'branch-makati' });
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
      expect(data).toEqual({ id: 'existing-id', account_email: 'john@example.com' });
    });
  });
});
