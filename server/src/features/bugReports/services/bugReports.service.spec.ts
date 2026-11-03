import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBugReport,
  listBugReports,
  updateBugReportStatus,
} from './bugReports.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { notifyStaffRole } from '../../notifications/services/notification.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRoleOrNull: vi.fn(),
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  notifyStaffRole: vi.fn(),
}));

interface QueryResult {
  data: unknown;
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

    for (const method of ['select', 'eq', 'order', 'insert', 'update']) {
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

function written(method: 'insert' | 'update') {
  return calls.filter((call) => call.method === method).map((c) => c.args[0]);
}

const REPORT = {
  id: 'report-1',
  reporter_customer_id: null,
  reporter_staff_id: 'staff-1',
  category: 'bug' as const,
  title: 'Upload fails',
  description: 'It spins forever.',
  status: 'pending' as const,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-11-02T00:00:00.000Z',
  updated_at: '2026-11-02T00:00:00.000Z',
};

describe('bugReports.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  describe('createBugReport', () => {
    it('inserts a row for a staff reporter (getStaffRoleOrNull resolves a role) and notifies every Developer', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Admin');
      queueFromResults({ data: REPORT, error: null });

      const created = await createBugReport({
        requesterId: 'staff-1',
        category: 'bug',
        title: 'Upload fails',
        description: 'It spins forever.',
      });

      expect(created).toEqual(REPORT);
      expect(written('insert')[0]).toEqual({
        reporter_customer_id: null,
        reporter_staff_id: 'staff-1',
        category: 'bug',
        title: 'Upload fails',
        description: 'It spins forever.',
      });
      expect(notifyStaffRole).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'Developer',
          eventType: 'bug_report_submitted',
        })
      );
    });

    it('inserts a row for a customer reporter (getStaffRoleOrNull resolves null - no staff_profiles row)', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults({
        data: {
          ...REPORT,
          reporter_staff_id: null,
          reporter_customer_id: 'cust-1',
        },
        error: null,
      });

      await createBugReport({
        requesterId: 'cust-1',
        category: 'feature_request',
        title: 'Dark mode',
        description: 'Please add it.',
      });

      expect(written('insert')[0]).toMatchObject({
        reporter_customer_id: 'cust-1',
        reporter_staff_id: null,
      });
    });

    it('throws when the insert fails', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Admin');
      queueFromResults({ data: null, error: { message: 'db down' } });

      await expect(
        createBugReport({
          requesterId: 'staff-1',
          category: 'bug',
          title: 'Title',
          description: 'Description',
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(notifyStaffRole).not.toHaveBeenCalled();
    });
  });

  describe('listBugReports', () => {
    it('lists every report, oldest first', async () => {
      queueFromResults({ data: [REPORT], error: null });

      await expect(listBugReports()).resolves.toEqual([REPORT]);

      expect(calls).toContainEqual({
        method: 'order',
        args: ['created_at', { ascending: true }],
      });
    });
  });

  describe('updateBugReportStatus', () => {
    it('sets the status plus reviewed_by/reviewed_at', async () => {
      queueFromResults({
        data: { ...REPORT, status: 'resolved', reviewed_by: 'dev-1' },
        error: null,
      });

      const updated = await updateBugReportStatus({
        requesterId: 'dev-1',
        reportId: 'report-1',
        status: 'resolved',
      });

      expect(updated.status).toBe('resolved');
      const payload = written('update')[0] as Record<string, unknown>;
      expect(payload.status).toBe('resolved');
      expect(payload.reviewed_by).toBe('dev-1');
      expect(payload.reviewed_at).toEqual(expect.any(String));
    });

    it('404s when the report does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateBugReportStatus({
          requesterId: 'dev-1',
          reportId: 'missing',
          status: 'resolved',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
