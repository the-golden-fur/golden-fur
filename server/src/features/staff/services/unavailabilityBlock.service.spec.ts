import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelUnavailabilityBlock,
  clearAutoBuildSchedule,
  commitAutoBuildSchedule,
  createUnavailabilityBlock,
  listBranchSchedule,
  listPendingUnavailabilityBlocks,
  listUnavailabilityBlocks,
  previewAutoBuildSchedule,
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
    builder.in = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
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
        now: new Date('2026-07-01T00:00:00.000Z'),
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
          now: new Date('2026-07-01T00:00:00.000Z'),
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
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
        now: new Date('2026-07-01T00:00:00.000Z'),
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
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
        now: new Date('2026-07-01T00:00:00.000Z'),
      });

      expect(result.created_by).toBe('supervisor-1');
      expect(result.staff_id).toBe('staff-2');
    });

    it('rejects a Supervisor creating a block for a staff member at a different branch', async () => {
      queueFromResults({
        data: { id: 'staff-2', branch_id: 'branch-a' },
        error: null,
      });

      await expect(
        createUnavailabilityBlock({
          requesterId: 'supervisor-1',
          requesterRole: 'Supervisor',
          requesterBranchId: 'branch-b',
          targetStaffId: 'staff-2',
          startTime: '2026-07-14T01:00:00.000Z',
          endTime: '2026-07-14T03:00:00.000Z',
          now: new Date('2026-07-01T00:00:00.000Z'),
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('allows a Superadmin to create a block on behalf of staff at any branch', async () => {
      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-b' }, error: null },
        { data: [], error: null },
        {
          data: {
            id: 'block-7',
            staff_id: 'staff-2',
            start_time: '2026-07-14T01:00:00.000Z',
            end_time: '2026-07-14T03:00:00.000Z',
            reason: null,
            created_by: 'super-1',
            created_at: '2026-07-13T00:00:00.000Z',
          },
          error: null,
        }
      );

      const result = await createUnavailabilityBlock({
        requesterId: 'super-1',
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        startTime: '2026-07-14T01:00:00.000Z',
        endTime: '2026-07-14T03:00:00.000Z',
        now: new Date('2026-07-01T00:00:00.000Z'),
      });

      expect(result.staff_id).toBe('staff-2');
    });

    it('Rest Day: rejects a self-service request with 403 before touching supabase', async () => {
      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          isFullDay: true,
          date: '2026-07-20',
          leaveType: 'Rest Day',
          now: new Date('2026-07-01T00:00:00.000Z'),
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('Rest Day: allows a manager to set it on behalf of a staff member, tagged with leave_type', async () => {
      const insertSpy = vi.fn((payload: Record<string, unknown>) => payload);

      queueFromResults(
        { data: { id: 'staff-2', branch_id: 'branch-a' }, error: null },
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
            id: 'block-8',
            staff_id: 'staff-2',
            leave_type: 'Rest Day',
            created_by: 'supervisor-1',
          },
          error: null,
        }
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
        requesterId: 'supervisor-1',
        requesterRole: 'Supervisor',
        requesterBranchId: 'branch-a',
        targetStaffId: 'staff-2',
        isFullDay: true,
        date: '2026-07-13', // a Monday
        leaveType: 'Rest Day',
        now: new Date('2026-07-01T00:00:00.000Z'),
      });

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ leave_type: 'Rest Day' })
      );
      expect(result.leave_type).toBe('Rest Day');
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

    it("Entire Day option: resolves start/end from that date's full branch operating hours", async () => {
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
        now: new Date('2026-07-01T00:00:00.000Z'),
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

    it('rejects a custom range whose start_time is in the past', async () => {
      queueFromResults({
        data: { id: 'staff-1', branch_id: 'branch-a' },
        error: null,
      });

      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          startTime: '2026-07-13T01:00:00.000Z',
          endTime: '2026-07-13T03:00:00.000Z',
          now: new Date('2026-07-14T00:00:00.000Z'),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects an Entire Day request for a date whose window has already passed', async () => {
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
          date: '2026-07-13', // a Monday
          now: new Date('2026-07-14T00:00:00.000Z'),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('a quick action is never rejected as "in the past", even though its window starts at now', async () => {
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
            id: 'block-6',
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

      await expect(
        createUnavailabilityBlock({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          targetStaffId: 'staff-1',
          quickAction: true,
          now,
        })
      ).resolves.toMatchObject({ id: 'block-6' });
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
        { data: { branch_id: 'branch-a' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'admin-1',
          requesterRole: 'Admin',
          requesterBranchId: 'branch-a',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).resolves.toBeUndefined();
    });

    it("#28 AC-2: allows a Supervisor to cancel another staff member's block", async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: { branch_id: 'branch-a' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'supervisor-1',
          requesterRole: 'Supervisor',
          requesterBranchId: 'branch-a',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).resolves.toBeUndefined();
    });

    it('rejects a Supervisor cancelling a block for a staff member at a different branch', async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: { branch_id: 'branch-a' }, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'supervisor-1',
          requesterRole: 'Supervisor',
          requesterBranchId: 'branch-b',
          targetStaffId: 'staff-2',
          blockId: 'block-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('allows a Superadmin to cancel a block for staff at any branch', async () => {
      queueFromResults(
        { data: { id: 'block-1' }, error: null },
        { data: { branch_id: 'branch-b' }, error: null },
        { data: null, error: null }
      );

      await expect(
        cancelUnavailabilityBlock({
          requesterId: 'super-1',
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-a',
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

    it('Custom change (My Schedule): given a range, returns full-day blocks overlapping it regardless of whether they are past or future', async () => {
      queueFromResults({
        data: [
          {
            id: 'block-past',
            staff_id: 'staff-1',
            start_time: '2026-06-05T00:00:00.000Z',
            end_time: '2026-06-06T00:00:00.000Z',
            leave_type: 'Rest Day',
            is_full_day: true,
            reason: null,
            created_by: 'admin-1',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await listUnavailabilityBlocks({
        requesterId: 'staff-1',
        requesterRole: 'Groomer',
        targetStaffId: 'staff-1',
        rangeStart: '2026-06-01T00:00:00.000Z',
        rangeEnd: '2026-07-01T00:00:00.000Z',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'block-past' });
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

  describe('listBranchSchedule', () => {
    const scheduleRow = {
      id: 'block-1',
      staff_id: 'staff-2',
      is_full_day: true,
      leave_type: 'Rest Day',
      created_by: 'supervisor-1',
      created_at: '2026-08-01T00:00:00.000Z',
      staff: {
        id: 'staff-2',
        display_name: 'Staff Two',
        profile_photo_url: null,
        role: 'Groomer',
        branch_id: 'branch-a',
      },
    };

    it('returns branch-scoped entries with the creator display name resolved (the requested "who added this, when" log)', async () => {
      queueFromResults(
        { data: [scheduleRow], error: null },
        {
          data: [{ id: 'supervisor-1', display_name: 'Supervisor One' }],
          error: null,
        }
      );

      const result = await listBranchSchedule({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        rangeStart: '2026-08-01T00:00:00.000Z',
        rangeEnd: '2026-09-01T00:00:00.000Z',
      });

      expect(result).toHaveLength(1);
      expect(result[0].created_by_name).toBe('Supervisor One');
      expect(result[0].created_at).toBe('2026-08-01T00:00:00.000Z');
    });

    it("rejects an Admin/Supervisor requesting a different branch's schedule", async () => {
      await expect(
        listBranchSchedule({
          requesterRole: 'Admin',
          requesterBranchId: 'branch-b',
          branchId: 'branch-a',
          rangeStart: '2026-08-01T00:00:00.000Z',
          rangeEnd: '2026-09-01T00:00:00.000Z',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('allows a Superadmin to view any branch schedule regardless of their own branch', async () => {
      queueFromResults(
        { data: [scheduleRow], error: null },
        {
          data: [{ id: 'supervisor-1', display_name: 'Supervisor One' }],
          error: null,
        }
      );

      const result = await listBranchSchedule({
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-b',
        branchId: 'branch-a',
        rangeStart: '2026-08-01T00:00:00.000Z',
        rangeEnd: '2026-09-01T00:00:00.000Z',
      });

      expect(result).toHaveLength(1);
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        listBranchSchedule({
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-a',
          branchId: 'branch-a',
          rangeStart: '2026-08-01T00:00:00.000Z',
          rangeEnd: '2026-09-01T00:00:00.000Z',
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  const OPEN_ALL_WEEK = {
    sunday: { open: '09:00', close: '18:00' },
    monday: { open: '09:00', close: '18:00' },
    tuesday: { open: '09:00', close: '18:00' },
    wednesday: { open: '09:00', close: '18:00' },
    thursday: { open: '09:00', close: '18:00' },
    friday: { open: '09:00', close: '18:00' },
    saturday: { open: '09:00', close: '18:00' },
  };

  describe('previewAutoBuildSchedule (Auto Build Monthly Schedule)', () => {
    it('proposes close to the full weekly quota per staff when nothing conflicts (July 2026 = 31 days)', async () => {
      queueFromResults(
        { data: [{ id: 'staff-1' }], error: null },
        {
          data: { timezone: 'Asia/Manila', operating_hours: OPEN_ALL_WEEK },
          error: null,
        },
        { data: [], error: null }
      );

      const result = await previewAutoBuildSchedule({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
        restDaysPerWeek: 1,
      });

      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].staff_id).toBe('staff-1');
      // July 2026 spans 5 Monday-start weeks - 1/week with zero conflicts
      // should hit the target exactly.
      expect(result.targetPerStaff).toBeGreaterThanOrEqual(4);
      expect(result.assignments[0].dates).toHaveLength(result.targetPerStaff);
      expect(new Set(result.assignments[0].dates).size).toBe(
        result.assignments[0].dates.length
      );
      for (const date of result.assignments[0].dates) {
        expect(date).toMatch(/^2026-07-\d{2}$/);
      }
    });

    it('proposes no dates for a staff member whose entire month is already blocked', async () => {
      queueFromResults(
        { data: [{ id: 'staff-1' }], error: null },
        {
          data: { timezone: 'Asia/Manila', operating_hours: OPEN_ALL_WEEK },
          error: null,
        },
        {
          data: [
            {
              staff_id: 'staff-1',
              start_time: '2026-06-25T00:00:00.000Z',
              end_time: '2026-08-05T00:00:00.000Z',
            },
          ],
          error: null,
        }
      );

      const result = await previewAutoBuildSchedule({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
        restDaysPerWeek: 1,
      });

      expect(result.assignments[0].dates).toEqual([]);
      expect(result.targetPerStaff).toBeGreaterThan(0);
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        previewAutoBuildSchedule({
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-a',
          branchId: 'branch-a',
          year: 2026,
          month: 7,
          restDaysPerWeek: 1,
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("rejects an Admin building a different branch's schedule", async () => {
      await expect(
        previewAutoBuildSchedule({
          requesterRole: 'Admin',
          requesterBranchId: 'branch-b',
          branchId: 'branch-a',
          year: 2026,
          month: 7,
          restDaysPerWeek: 1,
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('commitAutoBuildSchedule (Auto Build Monthly Schedule)', () => {
    it('inserts one Rest Day row per assignment date, tagged created_by_auto_build', async () => {
      const insertSpy = vi.fn((payload: unknown) => payload);

      queueFromResults(
        {
          data: { timezone: 'Asia/Manila', operating_hours: OPEN_ALL_WEEK },
          error: null,
        },
        { data: [], error: null },
        { data: [{ id: 'new-1' }, { id: 'new-2' }], error: null }
      );

      const originalFrom = vi.mocked(supabase.from).getMockImplementation()!;
      vi.mocked(supabase.from).mockImplementation((table) => {
        const builder = originalFrom(table) as unknown as Record<
          string,
          unknown
        >;
        const originalInsert = builder.insert as (_payload: unknown) => unknown;
        builder.insert = vi.fn((payload: unknown) => {
          insertSpy(payload);
          return originalInsert(payload);
        });
        return builder as never;
      });

      const result = await commitAutoBuildSchedule({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
        assignments: [
          { staff_id: 'staff-1', dates: ['2026-07-06', '2026-07-13'] },
        ],
      });

      expect(result).toEqual({ inserted: 2 });
      expect(insertSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          staff_id: 'staff-1',
          leave_type: 'Rest Day',
          is_full_day: true,
          created_by: 'admin-1',
          created_by_auto_build: true,
        }),
        expect.objectContaining({
          staff_id: 'staff-1',
          leave_type: 'Rest Day',
          created_by_auto_build: true,
        }),
      ]);
    });

    it("drops a date that's now conflicting since the preview, without failing the rest", async () => {
      const insertSpy = vi.fn((payload: unknown) => payload);

      queueFromResults(
        {
          data: { timezone: 'Asia/Manila', operating_hours: OPEN_ALL_WEEK },
          error: null,
        },
        {
          // 2026-07-06 now conflicts; 2026-07-13 is still free.
          data: [
            {
              staff_id: 'staff-1',
              start_time: '2026-07-06T00:00:00.000Z',
              end_time: '2026-07-07T00:00:00.000Z',
            },
          ],
          error: null,
        },
        { data: [{ id: 'new-1' }], error: null }
      );

      const originalFrom = vi.mocked(supabase.from).getMockImplementation()!;
      vi.mocked(supabase.from).mockImplementation((table) => {
        const builder = originalFrom(table) as unknown as Record<
          string,
          unknown
        >;
        const originalInsert = builder.insert as (_payload: unknown) => unknown;
        builder.insert = vi.fn((payload: unknown) => {
          insertSpy(payload);
          return originalInsert(payload);
        });
        return builder as never;
      });

      const result = await commitAutoBuildSchedule({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
        assignments: [
          { staff_id: 'staff-1', dates: ['2026-07-06', '2026-07-13'] },
        ],
      });

      expect(result).toEqual({ inserted: 1 });
      expect(insertSpy).toHaveBeenCalledWith([
        expect.objectContaining({ staff_id: 'staff-1' }),
      ]);
      const insertedRows = insertSpy.mock.calls[0][0] as Array<{
        start_time: string;
      }>;
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].start_time.startsWith('2026-07-13')).toBe(true);
    });

    it('returns { inserted: 0 } without ever calling insert when every date now conflicts', async () => {
      queueFromResults(
        {
          data: { timezone: 'Asia/Manila', operating_hours: OPEN_ALL_WEEK },
          error: null,
        },
        {
          data: [
            {
              staff_id: 'staff-1',
              start_time: '2026-07-01T00:00:00.000Z',
              end_time: '2026-08-01T00:00:00.000Z',
            },
          ],
          error: null,
        }
      );

      const result = await commitAutoBuildSchedule({
        requesterId: 'admin-1',
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
        assignments: [{ staff_id: 'staff-1', dates: ['2026-07-06'] }],
      });

      expect(result).toEqual({ inserted: 0 });
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        commitAutoBuildSchedule({
          requesterId: 'staff-1',
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-a',
          branchId: 'branch-a',
          year: 2026,
          month: 7,
          assignments: [],
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('clearAutoBuildSchedule (Auto Build Monthly Schedule)', () => {
    it("deletes only this branch roster's auto-build rows for the month and returns the count", async () => {
      const deleteEqSpy = vi.fn();

      queueFromResults({
        data: [{ id: 'staff-1' }, { id: 'staff-2' }],
        error: null,
      });

      const originalFrom = vi.mocked(supabase.from).getMockImplementation()!;
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'staff_profiles') {
          return originalFrom(table);
        }

        const builder: Record<string, unknown> = {};
        builder.delete = vi.fn(() => builder);
        builder.in = vi.fn((...args: unknown[]) => {
          deleteEqSpy('in', ...args);
          return builder;
        });
        builder.eq = vi.fn((...args: unknown[]) => {
          deleteEqSpy('eq', ...args);
          return builder;
        });
        builder.lt = vi.fn(() => builder);
        builder.gt = vi.fn(() => builder);
        builder.select = vi
          .fn()
          .mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
        return builder as never;
      });

      const result = await clearAutoBuildSchedule({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
      });

      expect(result).toEqual({ deleted: 2 });
      expect(deleteEqSpy).toHaveBeenCalledWith('in', 'staff_id', [
        'staff-1',
        'staff-2',
      ]);
      expect(deleteEqSpy).toHaveBeenCalledWith(
        'eq',
        'created_by_auto_build',
        true
      );
    });

    it('returns { deleted: 0 } without querying further when the branch has no staff', async () => {
      queueFromResults({ data: [], error: null });

      const result = await clearAutoBuildSchedule({
        requesterRole: 'Admin',
        requesterBranchId: 'branch-a',
        branchId: 'branch-a',
        year: 2026,
        month: 7,
      });

      expect(result).toEqual({ deleted: 0 });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it('rejects a non-manager role with 403 before touching supabase', async () => {
      await expect(
        clearAutoBuildSchedule({
          requesterRole: 'Groomer',
          requesterBranchId: 'branch-a',
          branchId: 'branch-a',
          year: 2026,
          month: 7,
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });
});
