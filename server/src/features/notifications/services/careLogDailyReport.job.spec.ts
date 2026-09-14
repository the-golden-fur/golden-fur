import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runCareLogDailyReportJob,
  shouldRunAt,
} from './careLogDailyReport.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { resolveEffectivePolicy } from '../../booking/services/staffPicker.service.ts';
import { isEmailNotificationEnabled } from './notification.service.ts';
import { sendCareLogDailyReportEmail } from '../../../shared/email/careLogDailyReportEmail.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/staffPicker.service.ts', () => ({
  resolveEffectivePolicy: vi.fn(),
}));

vi.mock('./notification.service.ts', () => ({
  isEmailNotificationEnabled: vi.fn(),
}));

vi.mock('../../../shared/email/careLogDailyReportEmail.ts', () => ({
  sendCareLogDailyReportEmail: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Sequential mock queue, keyed loosely by table so a per-table lookup that
 * isn't part of the ordered flow (pets, branches, customer_profiles) can be
 * answered without consuming a queue slot. */
function mockSupabase(opts: {
  stays: QueryResult;
  careLogEntriesByStay?: Record<string, unknown[]>;
  petsById?: Record<string, { name: string; customer_id: string }>;
  branchesById?: Record<string, { name: string }>;
  customerEmailById?: Record<string, string | null>;
  claimResult?: (_stayId: string) => QueryResult;
}) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    let stayIdFilter: string | undefined;
    let idFilter: string | undefined;

    for (const method of ['select', 'eq', 'in', 'is', 'upsert']) {
      builder[method] = vi.fn((col?: string, value?: string) => {
        if (col === 'stay_id') stayIdFilter = value;
        if (col === 'id') idFilter = value;
        return builder;
      });
    }
    builder.upsert = vi.fn((row: { stay_id: string }) => {
      stayIdFilter = row.stay_id;
      return builder;
    });

    builder.maybeSingle = vi.fn(() => {
      if (table === 'care_log_daily_reports') {
        return Promise.resolve(
          opts.claimResult
            ? opts.claimResult(stayIdFilter ?? '')
            : { data: { stay_id: stayIdFilter }, error: null }
        );
      }
      if (table === 'pets') {
        return Promise.resolve({
          data: opts.petsById?.[idFilter ?? ''] ?? null,
          error: null,
        });
      }
      if (table === 'branches') {
        return Promise.resolve({
          data: opts.branchesById?.[idFilter ?? ''] ?? null,
          error: null,
        });
      }
      if (table === 'customer_profiles') {
        return Promise.resolve({
          data: {
            account_email: opts.customerEmailById?.[idFilter ?? ''] ?? null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    builder.then = (resolve: (_r: QueryResult) => void) => {
      if (table === 'stays') return resolve(opts.stays);
      if (table === 'care_log_entries') {
        return resolve({
          data: opts.careLogEntriesByStay?.[stayIdFilter ?? ''] ?? [],
          error: null,
        });
      }
      return resolve({ data: null, error: null });
    };

    return builder;
  }) as never);
}

const NOW = new Date('2026-09-08T21:30:00');
const TODAY = '2026-09-08';

describe('careLogDailyReport.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveEffectivePolicy).mockResolvedValue({
      care_log_daily_report_enabled: true,
    } as never);
    vi.mocked(isEmailNotificationEnabled).mockResolvedValue(true);
  });

  it('does nothing when there are no active hotel stays', async () => {
    mockSupabase({ stays: { data: [], error: null } });

    const count = await runCareLogDailyReportJob(NOW);

    expect(count).toBe(0);
    expect(sendCareLogDailyReportEmail).not.toHaveBeenCalled();
  });

  it('skips a stay whose branch has the nightly summary disabled', async () => {
    vi.mocked(resolveEffectivePolicy).mockResolvedValue({
      care_log_daily_report_enabled: false,
    } as never);
    mockSupabase({
      stays: {
        data: [{ id: 'stay-1', branch_id: 'branch-1', pet_id: 'pet-1' }],
        error: null,
      },
    });

    const count = await runCareLogDailyReportJob(NOW);

    expect(count).toBe(0);
    expect(sendCareLogDailyReportEmail).not.toHaveBeenCalled();
  });

  it("sends one summary per stay, bucketing that day's tasks by status", async () => {
    mockSupabase({
      stays: {
        data: [{ id: 'stay-1', branch_id: 'branch-1', pet_id: 'pet-1' }],
        error: null,
      },
      careLogEntriesByStay: {
        'stay-1': [
          { description: 'Morning walk', status: 'Completed' },
          { description: 'Lunch feeding', status: 'Completed' },
          { description: 'Evening meds', status: 'Pending' },
          { description: 'Afternoon walk', status: 'Missed' },
        ],
      },
      petsById: { 'pet-1': { name: 'Rex', customer_id: 'cust-1' } },
      branchesById: { 'branch-1': { name: 'Makati' } },
      customerEmailById: { 'cust-1': 'owner@example.com' },
    });

    const count = await runCareLogDailyReportJob(NOW);

    expect(count).toBe(1);
    expect(sendCareLogDailyReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        petName: 'Rex',
        branchName: 'Makati',
        reportDate: TODAY,
        completed: ['Morning walk', 'Lunch feeding'],
        missed: ['Afternoon walk'],
        stillOpen: ['Evening meds'],
      })
    );
  });

  it('does not send when the (stay, date) row was already claimed by an earlier run', async () => {
    mockSupabase({
      stays: {
        data: [{ id: 'stay-1', branch_id: 'branch-1', pet_id: 'pet-1' }],
        error: null,
      },
      claimResult: () => ({ data: null, error: null }),
    });

    const count = await runCareLogDailyReportJob(NOW);

    expect(count).toBe(0);
    expect(sendCareLogDailyReportEmail).not.toHaveBeenCalled();
  });

  it('respects the customer opting out of care-update email', async () => {
    vi.mocked(isEmailNotificationEnabled).mockResolvedValue(false);
    mockSupabase({
      stays: {
        data: [{ id: 'stay-1', branch_id: 'branch-1', pet_id: 'pet-1' }],
        error: null,
      },
      careLogEntriesByStay: { 'stay-1': [] },
      petsById: { 'pet-1': { name: 'Rex', customer_id: 'cust-1' } },
      branchesById: { 'branch-1': { name: 'Makati' } },
      customerEmailById: { 'cust-1': 'owner@example.com' },
    });

    const count = await runCareLogDailyReportJob(NOW);

    expect(count).toBe(0);
    expect(sendCareLogDailyReportEmail).not.toHaveBeenCalled();
  });

  it('only runs from 21:00 server time onward', () => {
    expect(shouldRunAt(new Date('2026-09-08T20:59:00'))).toBe(false);
    expect(shouldRunAt(new Date('2026-09-08T21:00:00'))).toBe(true);
    expect(shouldRunAt(new Date('2026-09-08T23:30:00'))).toBe(true);
    expect(shouldRunAt(new Date('2026-09-09T02:00:00'))).toBe(false);
  });
});
