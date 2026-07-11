import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelUnavailabilityBlock,
  createUnavailabilityBlock,
  listUnavailabilityBlocks,
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
  });
});
