import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStaffAccount,
  manageStaffAccount,
} from './staffManagement.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  createStaffAuthUser,
  deleteAuthUser,
} from '../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  createStaffAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));

    return builder as never;
  });
}

describe('staffManagement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createStaffAccount', () => {
    const baseParams = {
      requesterRole: 'Admin',
      requesterBranchId: 'branch-a',
      username: 'new.hire',
      registeredEmail: 'new.hire@goldenfur.com',
      displayName: 'New Hire',
      role: 'Receptionist' as const,
      branchId: 'branch-a',
    };

    it('Issue #73: allows an Admin to create a staff account at a different branch (full parity with Superadmin)', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: null, error: null },
        {
          data: {
            id: 'new-auth-id',
            branch_id: 'branch-b',
            role: 'Receptionist',
          },
          error: null,
        }
      );

      vi.mocked(createStaffAuthUser).mockResolvedValue({
        data: { user: { id: 'new-auth-id' } },
        error: null,
      } as never);

      const result = await createStaffAccount({
        ...baseParams,
        branchId: 'branch-b',
      });

      expect(result.staff.branch_id).toBe('branch-b');
    });

    it('rejects a duplicate username with 409', async () => {
      queueFromResults({ data: { id: 'existing-staff' }, error: null });

      await expect(createStaffAccount(baseParams)).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(createStaffAuthUser).not.toHaveBeenCalled();
    });

    it('rejects a duplicate registered email with 409', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: { id: 'existing-staff' }, error: null }
      );

      await expect(createStaffAccount(baseParams)).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(createStaffAuthUser).not.toHaveBeenCalled();
    });

    it('creates the auth user and staff_profiles row, returning a temporary password', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: null, error: null },
        {
          data: {
            id: 'new-auth-id',
            branch_id: 'branch-a',
            role: 'Receptionist',
            username: 'new.hire',
            registered_email: 'new.hire@goldenfur.com',
            display_name: 'New Hire',
          },
          error: null,
        }
      );

      vi.mocked(createStaffAuthUser).mockResolvedValue({
        data: { user: { id: 'new-auth-id' } },
        error: null,
      } as never);

      const result = await createStaffAccount(baseParams);

      expect(createStaffAuthUser).toHaveBeenCalledWith(
        'new.hire@goldenfur.com',
        expect.any(String)
      );
      expect(result.staff.id).toBe('new-auth-id');
      expect(result.temporaryPassword).toEqual(expect.any(String));
      expect(result.temporaryPassword.length).toBeGreaterThan(0);
    });

    it('compensates by deleting the auth user when the profile insert fails', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: { message: 'insert failed' } }
      );

      vi.mocked(createStaffAuthUser).mockResolvedValue({
        data: { user: { id: 'new-auth-id' } },
        error: null,
      } as never);

      await expect(createStaffAccount(baseParams)).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(deleteAuthUser).toHaveBeenCalledWith('new-auth-id');
    });

    it('allows a Superadmin to create a staff account at any branch', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: null, error: null },
        {
          data: {
            id: 'new-auth-id',
            branch_id: 'branch-b',
            role: 'Receptionist',
          },
          error: null,
        }
      );

      vi.mocked(createStaffAuthUser).mockResolvedValue({
        data: { user: { id: 'new-auth-id' } },
        error: null,
      } as never);

      const result = await createStaffAccount({
        ...baseParams,
        requesterRole: 'Superadmin',
        branchId: 'branch-b',
      });

      expect(result.staff.branch_id).toBe('branch-b');
    });
  });

  describe('manageStaffAccount', () => {
    it('rejects an unknown target staff id with 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        manageStaffAccount({
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-a',
          targetStaffId: 'missing-staff',
          isActive: false,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects an Admin managing a staff member at a different branch with 403', async () => {
      queueFromResults({
        data: { id: 'staff-2', branch_id: 'branch-b' },
        error: null,
      });

      await expect(
        manageStaffAccount({
          requesterRole: 'Admin',
          requesterBranchId: 'branch-a',
          targetStaffId: 'staff-2',
          isActive: false,
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an Admin attempting a role change with 403 (Superadmin-only)', async () => {
      queueFromResults({
        data: { id: 'staff-2', branch_id: 'branch-a' },
        error: null,
      });

      await expect(
        manageStaffAccount({
          requesterRole: 'Admin',
          requesterBranchId: 'branch-a',
          targetStaffId: 'staff-2',
          role: 'Supervisor',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an Admin attempting a branch transfer with 403 (Superadmin-only)', async () => {
      queueFromResults({
        data: { id: 'staff-2', branch_id: 'branch-a' },
        error: null,
      });

      await expect(
        manageStaffAccount({
          requesterRole: 'Admin',
          requesterBranchId: 'branch-a',
          targetStaffId: 'staff-2',
          branchId: 'branch-b',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('allows an Admin to deactivate a staff member at their own branch', async () => {
      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-a' }, error: null },
        {
          data: { id: 'staff-2', branch_id: 'branch-a', is_active: false },
          error: null,
        }
      );

      const result = await manageStaffAccount({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        isActive: false,
      });

      expect(result.is_active).toBe(false);
    });

    it('allows a Superadmin to promote/demote and transfer branch', async () => {
      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-a' }, error: null },
        {
          data: {
            id: 'staff-2',
            branch_id: 'branch-b',
            role: 'Supervisor',
          },
          error: null,
        }
      );

      const result = await manageStaffAccount({
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        role: 'Supervisor',
        branchId: 'branch-b',
      });

      expect(result.role).toBe('Supervisor');
      expect(result.branch_id).toBe('branch-b');
    });
  });
});
