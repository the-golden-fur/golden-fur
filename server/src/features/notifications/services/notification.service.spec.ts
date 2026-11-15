import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyStaffRole,
  notifyStaffRoleAtBranch,
} from './notification.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data?: unknown;
  error: unknown;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

const calls: RecordedCall[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'insert']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const NO_PREFERENCES_ROW = { data: null, error: null };
const INSERTED_NOTIFICATION = {
  data: { id: 'notif-1' },
  error: null,
};

describe('notifyStaffRoleAtBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('notifies every matching staff member at that branch', async () => {
    queueFromResults(
      { data: [{ id: 'staff-1' }, { id: 'staff-2' }], error: null }, // role/branch lookup
      NO_PREFERENCES_ROW, // staff-1 preferences (defaults to on)
      INSERTED_NOTIFICATION, // staff-1 notification insert
      NO_PREFERENCES_ROW, // staff-2 preferences
      INSERTED_NOTIFICATION // staff-2 notification insert
    );

    await notifyStaffRoleAtBranch({
      role: 'Receptionist',
      branchId: 'branch-1',
      eventType: 'bug_report_submitted',
      title: 'Title',
      message: 'Message',
    });

    expect(calls).toContainEqual({
      method: 'eq',
      args: ['role', 'Receptionist'],
    });
    expect(calls).toContainEqual({
      method: 'eq',
      args: ['branch_id', 'branch-1'],
    });
    expect(calls.filter((c) => c.method === 'insert')).toHaveLength(2);
  });

  it("one recipient's failed insert does not stop the others from being notified", async () => {
    queueFromResults(
      { data: [{ id: 'staff-1' }, { id: 'staff-2' }], error: null },
      NO_PREFERENCES_ROW,
      { data: null, error: { message: 'insert failed' } }, // staff-1 insert fails
      NO_PREFERENCES_ROW,
      INSERTED_NOTIFICATION // staff-2 still gets notified
    );

    await expect(
      notifyStaffRoleAtBranch({
        role: 'Receptionist',
        branchId: 'branch-1',
        eventType: 'bug_report_submitted',
        title: 'Title',
        message: 'Message',
      })
    ).resolves.toBeUndefined();

    expect(calls.filter((c) => c.method === 'insert')).toHaveLength(2);
  });
});

describe('notifyStaffRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('notifies every matching staff member regardless of branch - no branch filter applied', async () => {
    queueFromResults(
      { data: [{ id: 'dev-1' }, { id: 'dev-2' }], error: null },
      NO_PREFERENCES_ROW,
      INSERTED_NOTIFICATION,
      NO_PREFERENCES_ROW,
      INSERTED_NOTIFICATION
    );

    await notifyStaffRole({
      role: 'Developer',
      eventType: 'bug_report_submitted',
      title: 'Bug report submitted',
      message: 'A customer reported a bug',
    });

    expect(calls).toContainEqual({ method: 'eq', args: ['role', 'Developer'] });
    expect(
      calls.some((call) => call.method === 'eq' && call.args[0] === 'branch_id')
    ).toBe(false);
    expect(calls.filter((c) => c.method === 'insert')).toHaveLength(2);
  });
});
