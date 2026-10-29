import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDayOffRequested,
  notifyDayOffReviewed,
} from './dayOffNotifications.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { UnavailabilityBlock } from '../staff.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);
    return builder as never;
  });

  return builders;
}

const BLOCK: UnavailabilityBlock = {
  id: 'block-1',
  staff_id: 'staff-1',
  start_time: '2026-11-02T01:00:00.000Z',
  end_time: '2026-11-02T10:00:00.000Z',
  reason: 'Family trip',
  created_by: 'staff-1',
  created_at: '2026-10-29T00:00:00.000Z',
  status: 'pending',
  is_quick_action: false,
  is_full_day: true,
  reviewed_by: null,
  reviewed_at: null,
  denial_reason: null,
  requested_reviewer_id: null,
  leave_type: 'Vacation Leave',
  created_by_auto_build: false,
} as UnavailabilityBlock;

const REQUESTER_ROWS: QueryResult[] = [
  {
    data: { display_name: 'Gina Groomer', branch_id: 'branch-a' },
    error: null,
  },
  { data: { timezone: 'Asia/Manila' }, error: null },
];

describe('dayOffNotifications.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotification).mockResolvedValue(null);
  });

  it('notifies only the requested reviewer when one was picked', async () => {
    queueFromResults(...REQUESTER_ROWS);

    await notifyDayOffRequested({
      ...BLOCK,
      requested_reviewer_id: 'sup-1',
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientStaffId: 'sup-1',
        eventType: 'day_off_requested',
        message: expect.stringContaining(
          'Gina Groomer requested Vacation Leave'
        ),
        sendEmail: expect.any(Function),
      })
    );
  });

  it("notifies every active manager at the requester's branch when no reviewer was picked", async () => {
    const builders = queueFromResults(...REQUESTER_ROWS, {
      data: [{ id: 'sup-1' }, { id: 'admin-1' }],
      error: null,
    });

    await notifyDayOffRequested(BLOCK);

    expect(builders[2]?.eq).toHaveBeenCalledWith('branch_id', 'branch-a');
    expect(builders[2]?.in).toHaveBeenCalledWith('role', [
      'Admin',
      'Supervisor',
      'Superadmin',
    ]);
    expect(
      vi
        .mocked(createNotification)
        .mock.calls.map(([params]) => params.recipientStaffId)
    ).toEqual(['sup-1', 'admin-1']);
  });

  it('never throws, even when the lookups fail', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('db down');
    });

    await expect(notifyDayOffRequested(BLOCK)).resolves.toBeUndefined();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('tells the requester their request was denied, with the reason', async () => {
    queueFromResults(...REQUESTER_ROWS);

    await notifyDayOffReviewed({
      ...BLOCK,
      status: 'denied',
      denial_reason: 'Short-staffed',
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientStaffId: 'staff-1',
        eventType: 'day_off_reviewed',
        title: 'Day off request denied',
        message: expect.stringContaining('Reason: Short-staffed.'),
      })
    );
  });

  it('tells the requester their request was approved', async () => {
    queueFromResults(...REQUESTER_ROWS);

    await notifyDayOffReviewed({ ...BLOCK, status: 'approved' });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Day off request approved' })
    );
  });
});
