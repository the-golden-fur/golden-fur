import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelBooking } from './cancellation.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRoleOrNull: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  table: string;
  method: string;
  payload?: unknown;
}

const recordedWrites: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'or',
      'is',
      'lt',
      'gt',
      'order',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const CUSTOMER_ID = 'cust-1';

const HOTEL_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  service_category: 'Hotel',
  status: 'Confirmed',
  scheduled_start: daysFromNow(10),
  scheduled_end: daysFromNow(12),
  downpayment_amount: 500,
  reschedule_count: 0,
};

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-default',
    branch_id: null,
    notice_period_days: 3,
    notice_enforcement_mode: 'Strict',
    notice_enforcement_enabled: true,
    staff_picker_enabled_grooming: true,
    staff_picker_enabled_veterinary: true,
    ...overrides,
  };
}

const CANCELLED_ROW = {
  ...HOTEL_BOOKING,
  status: 'Cancelled',
  cancelled_at: '2026-07-18T08:00:00Z',
  cancellation_reason: 'change of plans',
};

describe('cancellation.service (#54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
  });

  it('AC-5: a qualifying cancellation sets Cancelled with cancelled_at + cancellation_reason', async () => {
    queueFromResults(
      { data: HOTEL_BOOKING, error: null }, // booking fetch
      { data: [policyRow()], error: null }, // policy
      { data: CANCELLED_ROW, error: null } // update
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: { cancellation_reason: 'change of plans' },
    });

    expect(result.notice_period_met).toBe(true);
    expect(result.policy_violation).toBe(false);

    const update = recordedWrites.find((write) => write.method === 'update');

    expect(update?.payload).toMatchObject({
      status: 'Cancelled',
      cancellation_reason: 'change of plans',
    });
    expect(
      (update?.payload as { cancelled_at?: string }).cancelled_at
    ).toBeTruthy();
  });

  it('a non-qualifying cancellation (notice unmet) still cancels - notice decides the future credit outcome, never blocks (M03 Process 5)', async () => {
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      { data: [policyRow()], error: null },
      { data: CANCELLED_ROW, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.notice_period_met).toBe(false);
    expect(result.policy_violation).toBe(true);
    expect(recordedWrites.some((write) => write.method === 'update')).toBe(
      true
    );
  });

  it('AC-4: disabling enforcement system-wide clears the violation flag regardless of timing', async () => {
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(0.5) },
        error: null,
      },
      {
        data: [policyRow({ notice_enforcement_enabled: false })],
        error: null,
      },
      { data: CANCELLED_ROW, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.policy_violation).toBe(false);
  });

  it('AC-5: no credit-balance write is attempted anywhere in the code path', async () => {
    queueFromResults(
      { data: HOTEL_BOOKING, error: null },
      { data: [policyRow()], error: null },
      { data: CANCELLED_ROW, error: null }
    );

    await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    const touchedTables = vi
      .mocked(supabase.from)
      .mock.calls.map(([table]) => table);

    expect(touchedTables).not.toContain('credit_balances');
    expect(touchedTables).not.toContain('credit_transactions');
    // The only write is the bookings status update.
    expect(recordedWrites.every((write) => write.table === 'bookings')).toBe(
      true
    );
  });

  it('AC-6: a non-owning customer gets 403', async () => {
    queueFromResults({ data: HOTEL_BOOKING, error: null });

    await expect(
      cancelBooking({
        requesterId: 'someone-else',
        bookingId: 'booking-1',
        input: {},
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses to cancel an already-Cancelled or Completed booking', async () => {
    for (const status of ['Cancelled', 'Completed']) {
      queueFromResults({
        data: { ...HOTEL_BOOKING, status },
        error: null,
      });

      await expect(
        cancelBooking({
          requesterId: CUSTOMER_ID,
          bookingId: 'booking-1',
          input: {},
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});
