import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelUnavailabilityBlock,
  createUnavailabilityBlock,
  listPendingUnavailabilityBlocks,
  listUnavailabilityBlocks,
  reviewUnavailabilityBlock,
} from './unavailabilityBlock.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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
    builder.lt = vi.fn(() => builder);
    builder.gt = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('unavailabilityBlock.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUnavailabilityBlock', () => {
    it('AC-1: quick action ends the block at the branch closing time for the current day', async () => {
      // Monday 13:00 in Asia/Manila (UTC+8) == 05:00 UTC
      const now = new Date('2026-07-13T05:00:00.000Z');

      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        {
          data: {
            timezone: 'Asia/Manila',
            operating_hours: { monday: { open: '09:00', close: '18:00' } },
          },
          error: null,
        },
        { data: [], error: null },
        {
          data: {
            id: 'block-1',
            staff_id: 'staff-1',
            start_time: now.toISOString(),
            end_time: '2026-07-13T10:00:00.000Z',
            reason: null,
            created_by: 'staff-1',
            created_at: now.toISOString(),
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
        quickAction: true,
        now,
      });

      // 18:00 Asia/Manila == 10:00 UTC
      expect(result.end_time).toBe('2026-07-13T10:00:00.000Z');
      expect(supabase.from).toHaveBeenCalledWith('branches');
    });

    it('AC-2: custom range creates a block for the exact requested window', async () => {
      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        { data: [], error: null },
        {
          data: {
            id: 'block-2',
            staff_id: 'staff-1',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-14T03:00:00.000Z',
            reason: 'Vet appointment',
            created_by: 'staff-1',
            created_at: '2026-07-13T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
        reason: 'Vet appointment',
      });

      expect(result.start_time).toBe('2026-07-14T01:00:00.000Z');
      expect(result.end_time).toBe('2026-07-14T03:00:00.000Z');
    });

    it('bug fix regression: a self quick action is inserted with is_quick_action true, so the DB trigger approves it', async () => {
      const now = new Date('2026-07-13T05:00:00.000Z');
      const insertSpy = vi.fn((payload: Record<string, unknown>) => payload);

      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        {
          data: {
            timezone: 'Asia/Manila',
            operating_hours: { monday: { open: '09:00', close: '18:00' } },
          },
          error: null,
        },
        { data: [], error: null },
        { data: { id: 'block-1', is_quick_action: true }, error: null }
      );

      const originalFrom = vi.mocked(supabase.from).getMockImplementation()!;
      vi.mocked(supabase.from).mockImplementation((table) => {
        const builder = originalFrom(table) as unknown as Record<
          string,
          unknown
        >;
        const originalInsert = builder.insert as (
          _payload: Record<string, unknown>
        ) => unknown;
        builder.insert = vi.fn((payload: Record<string, unknown>) => {
          insertSpy(payload);
          return originalInsert(payload);
        });
        return builder as never;
      });

      const result = await createUnavailabilityBlock({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
        quickAction: true,
        now,
      });

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ is_quick_action: true })
      );
      expect(result.id).toBe('block-1');
    });

    it('AC-3: rejects a block that overlaps an existing active block with 409', async () => {
      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        { data: [{ id: 'existing-block' }], error: null }
      );

      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          startTime: '2026-07-14T01:00:00.000Z',
          endTime: '2026-07-14T03:00:00.000Z',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('allows an Admin to create a block on behalf of another staff member', async () => {
      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-a' }, error: null },
        { data: [], error: null },
        {
          data: {
            id: 'block-3',
            staff_id: 'staff-2',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-14T03:00:00.000Z',
            reason: null,
            created_by: 'admin-1',
            created_at: '2026-07-13T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        targetStaffId: 'staff-2',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
      });

      expect(result.created_by).toBe('admin-1');
      expect(result.staff_id).toBe('staff-2');
    });

    it('#28 AC-1: allows a Supervisor to create a block on behalf of another staff member', async () => {
      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-a' }, error: null },
        { data: [], error: null },
        {
          data: {
            id: 'block-4',
            staff_id: 'staff-2',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-14T03:00:00.000Z',
            reason: null,
            created_by: 'supervisor-1',
            created_at: '2026-07-13T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'supervisor-1',
        requesterRole: 'Supervisor',
        targetStaffId: 'staff-2',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
      });

      expect(result.created_by).toBe('supervisor-1');
      expect(result.staff_id).toBe('staff-2');
    });

    it('rejects a non-admin creating a block for another staff member with 403', async () => {
      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-2',
          startTime: '2026-07-14T01:00:00.000Z',
          endTime: '2026-07-14T03:00:00.000Z',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('Entire Day option: resolves start/end from that date\'s full branch operating hours', async () => {
      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        {
          data: {
            timezone: 'Asia/Manila',
            operating_hours: { monday: { open: '09:00', close: '18:00' } },
          },
          error: null,
        },
        { data: [], error: null },
        {
          data: {
            id: 'block-5',
            staff_id: 'staff-1',
            start_time: '2026-07-13T01:00:00.000Z',
            end_time: '2026-07-13T10:00:00.000Z',
            reason: null,
            created_by: 'staff-1',
            created_at: '2026-07-13T00:00:00.000Z',
            is_full_day: true,
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
        isFullDay: true,
        date: '2026-07-13', // a Monday
      });

      // 09:00-18:00 Asia/Manila == 01:00-10:00 UTC
      expect(result.start_time).toBe('2026-07-13T01:00:00.000Z');
      expect(result.end_time).toBe('2026-07-13T10:00:00.000Z');
      expect(supabase.from).toHaveBeenCalledWith('branches');
    });

    it('Entire Day option: requires date', async () => {
      queueFromResults(
        { data: { id: 'staff-1', branch_id: 'branch-a' }, error: null },
        {
          data: {
            timezone: 'Asia/Manila',
            operating_hours: { monday: { open: '09:00', close: '18:00' } },
          },
          error: null,
        }
      );

      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          isFullDay: true,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a custom range where end_time is not after start_time', async () => {
      queueFromResults({
        data: { id: 'staff-1', branch_id: 'branch-a' },
        error: null,
      });

      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          startTime: '2026-07-14T03:00:00.000Z',
          endTime: '2026-07-14T01:00:00.000Z',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('cancelUnavailabilityBlock', () => {
    it('AC-4: cancels an active block owned by the requester', async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          blockId: 'block-1',
        })
      ).resolves.toBeUndefined();
    });

    it("AC-4: rejects cancelling another staff member's block when the requester is not Admin/Superadmin", async () => {
      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("AC-4: allows an Admin to cancel another staff member's block", async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).resolves.toBeUndefined();
    });

    it("#28 AC-2: allows a Supervisor to cancel another staff member's block", async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'supervisor-1',
          requesterRole: 'Supervisor',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).resolves.toBeUndefined();
    });

    it('returns 404 when the block does not belong to the target staff member', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          blockId: 'missing-block',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listUnavailabilityBlocks', () => {
    it('AC-5: returns active and upcoming blocks for the staff member', async () => {
      queueFromResults({
        data: [
          {
            id: 'block-1',
            staff_id: 'staff-1',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-20T00:00:00.000Z',
            reason: null,
            created_by: 'staff-1',
            created_at: '2026-07-13T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await listUnavailabilityBlocks({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'block-1' });
    });

    it("rejects a non-admin listing another staff member's blocks with 403", async () => {
      await expect(
        listUnavailabilityBlocks({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-2',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("#28 AC-3: allows a Supervisor to list another staff member's blocks", async () => {
      queueFromResults({
        data: [
          {
            id: 'block-1',
            staff_id: 'staff-2',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-20T00:00:00.000Z',
            reason: null,
            created_by: 'staff-2',
            created_at: '2026-07-13T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await listUnavailabilityBlocks({
        requesterId: 'supervisor-1',
        requesterRole: 'Supervisor',
        targetStaffId: 'staff-2',
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('reviewUnavailabilityBlock', () => {
    it("AC-4: an Admin approves another staff member's pending request", async () => {
      queueFromResults(
        { data: { id: 'block-1', status: 'pending' }, error: null },
        {
          data: {
            id: 'block-1',
            staff_id: 'staff-2',
            status: 'approved',
            reviewed_by: 'admin-1',
            reviewed_at: '2026-07-13T00:00:00.000Z',
            denial_reason: null,
          },
          error: null,
        }
      );

      const result = await reviewUnavailabilityBlock({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        targetStaffId: 'staff-2',
        blockId: 'block-1',
        decision: 'approved',
      });

      expect(result.status).toBe('approved');
      expect(result.reviewed_by).toBe('admin-1');
    });

    it('AC-5: denies a request and records the reason', async () => {
      queueFromResults(
        { data: { id: 'block-1', status: 'pending' }, error: null },
        {
          data: {
            id: 'block-1',
            staff_id: 'staff-2',
            status: 'denied',
            reviewed_by: 'admin-1',
            reviewed_at: '2026-07-13T00:00:00.000Z',
            denial_reason: 'Short staffed that day',
          },
          error: null,
        }
      );

      const result = await reviewUnavailabilityBlock({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        targetStaffId: 'staff-2',
        blockId: 'block-1',
        decision: 'denied',
        denialReason: 'Short staffed that day',
      });

      expect(result.status).toBe('denied');
      expect(result.denial_reason).toBe('Short staffed that day');
    });

    it('AC-9: rejects self-review with cannot_review_own_request and never calls supabase', async () => {
      await expect(
        reviewUnavailabilityBlock({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          targetStaffId: 'admin-1',
          blockId: 'block-1',
          decision: 'approved',
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'cannot_review_own_request',
      });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("AC-10: allows reviewing another elevated-role user's pending request", async () => {
      queueFromResults(
        { data: { id: 'block-1', status: 'pending' }, error: null },
        {
          data: {
            id: 'block-1',
            staff_id: 'supervisor-2',
            status: 'approved',
            reviewed_by: 'admin-1',
            reviewed_at: '2026-07-13T00:00:00.000Z',
            denial_reason: null,
          },
          error: null,
        }
      );

      const result = await reviewUnavailabilityBlock({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        targetStaffId: 'supervisor-2',
        blockId: 'block-1',
        decision: 'approved',
      });

      expect(result.status).toBe('approved');
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        reviewUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
          decision: 'approved',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('AC-6: returns 404 when the block is not pending', async () => {
      queueFromResults({
        data: { id: 'block-1', status: 'approved' },
        error: null,
      });

      await expect(
        reviewUnavailabilityBlock({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
          decision: 'approved',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listPendingUnavailabilityBlocks', () => {
    const pendingRows = [
      {
        id: 'block-1',
        staff_id: 'staff-2',
        status: 'pending',
        staff: {
          id: 'staff-2',
          display_name: 'Staff Two',
          profile_photo_url: null,
          role: 'Groomer',
          branch_id: 'branch-a',
        },
      },
      {
        id: 'block-2',
        staff_id: 'staff-3',
        status: 'pending',
        staff: {
          id: 'staff-3',
          display_name: 'Staff Three',
          profile_photo_url: null,
          role: 'Receptionist',
          branch_id: 'branch-b',
        },
      },
      {
        id: 'block-3',
        staff_id: 'admin-1',
        status: 'pending',
        staff: {
          id: 'admin-1',
          display_name: 'Admin One',
          profile_photo_url: null,
          role: 'Admin',
          branch_id: 'branch-a',
        },
      },
    ];

    it('AC-8: scopes results to the caller branch and flags own row non-reviewable', async () => {
      queueFromResults({ data: pendingRows, error: null });

      const result = await listPendingUnavailabilityBlocks({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
      });

      expect(result.map((row) => row.id)).toEqual(['block-1', 'block-3']);
      expect(result.find((row) => row.id === 'block-1')?.reviewable).toBe(true);
      expect(result.find((row) => row.id === 'block-3')?.reviewable).toBe(
        false
      );
    });

    it('AC-6 (cross-branch): a Superadmin sees pending requests across both branches', async () => {
      queueFromResults({ data: pendingRows, error: null });

      const result = await listPendingUnavailabilityBlocks({
        requesterId: 'super-1',
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-a',
      });

      expect(result).toHaveLength(3);
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        listPendingUnavailabilityBlocks({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-a',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });
});
