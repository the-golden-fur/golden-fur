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

// Issue #98: booking_cancelled dispatch is covered by its own unit tests
// (bookingNotifications.service.spec.ts) - mocked wholesale here so these
// pre-existing cancellation tests don't need to account for its extra
// Supabase lookup in their sequential mock queues below.
vi.mock('./bookingNotifications.service.ts', () => ({
  sendBookingCancelledNotification: vi.fn().mockResolvedValue(undefined),
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
  status: 'Pending',
  scheduled_start: daysFromNow(10),
  scheduled_end: daysFromNow(12),
  downpayment_amount: 500,
  reschedule_count: 0,
};

const DAYCARE_BOOKING = {
  ...HOTEL_BOOKING,
  service_category: 'Daycare',
  downpayment_amount: null,
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
    credit_expiry_enabled: true,
    credit_expiry_days: 30,
    ...overrides,
  };
}

const CANCELLED_ROW = {
  ...HOTEL_BOOKING,
  status: 'Cancelled',
  cancelled_at: '2026-07-18T08:00:00Z',
  cancellation_reason: 'change of plans',
};

const LOG_ROW = { id: 'log-1', credit_issued: false, credit_amount: null };

const ISSUED_TRANSACTION = {
  id: 'txn-1',
  credit_balance_id: 'balance-1',
  transaction_type: 'issuance',
  amount: 500,
  cancellation_log_id: 'log-1',
  transaction_id: null,
  expires_at: '2026-09-04T00:00:00.000Z',
  expired_at: null,
  created_at: '2026-08-05T00:00:00.000Z',
};

describe('cancellation.service (#54/#91)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
  });

  it('AC-5 (#54): a qualifying cancellation sets Cancelled with cancelled_at + cancellation_reason', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: ISSUED_TRANSACTION,
      error: null,
    } as never);
    queueFromResults(
      { data: HOTEL_BOOKING, error: null }, // booking fetch
      { data: [policyRow()], error: null }, // policy
      { data: CANCELLED_ROW, error: null }, // booking update
      { data: LOG_ROW, error: null }, // cancellation_logs insert
      { data: null, error: null } // markCreditIssuedOnLog update
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: { cancellation_reason: 'change of plans' },
    });

    expect(result.notice_period_met).toBe(true);
    expect(result.policy_violation).toBe(false);

    const update = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'update'
    );

    expect(update?.payload).toMatchObject({
      status: 'Cancelled',
      cancellation_reason: 'change of plans',
    });
    expect(
      (update?.payload as { cancelled_at?: string }).cancelled_at
    ).toBeTruthy();
  });

  it('AC-2 (#91): notice met + a real downpayment issues credit and writes a matching cancellation_logs row', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: ISSUED_TRANSACTION,
      error: null,
    } as never);
    queueFromResults(
      { data: HOTEL_BOOKING, error: null },
      { data: [policyRow()], error: null },
      { data: CANCELLED_ROW, error: null },
      { data: LOG_ROW, error: null },
      { data: null, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.credit_issued).toBe(true);

    const logInsert = recordedWrites.find(
      (write) =>
        write.table === 'cancellation_logs' && write.method === 'insert'
    );

    expect(logInsert?.payload).toMatchObject({
      event_type: 'cancellation',
      notice_period_met: true,
      credit_issued: false, // always inserted false; patched after issuance
      credit_amount: null,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'issue_credit',
      expect.objectContaining({
        p_customer_id: CUSTOMER_ID,
        p_branch_id: 'branch-1',
        p_amount: 500,
        p_cancellation_log_id: 'log-1',
      })
    );

    const logPatch = recordedWrites.find(
      (write) =>
        write.table === 'cancellation_logs' && write.method === 'update'
    );

    expect(logPatch?.payload).toEqual({
      credit_issued: true,
      credit_amount: 500,
    });
  });

  it('AC-3 (#91): Strict + notice unmet forfeits the downpayment - cancellation proceeds, no credit path', async () => {
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      { data: [policyRow()], error: null },
      { data: CANCELLED_ROW, error: null },
      { data: LOG_ROW, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.notice_period_met).toBe(false);
    // policy_violation is enforced && !met regardless of Strict/Soft (#54) -
    // what Strict/Soft actually differ on is the financial consequence.
    expect(result.policy_violation).toBe(true);
    expect(result.credit_issued).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();

    const logInsert = recordedWrites.find(
      (write) =>
        write.table === 'cancellation_logs' && write.method === 'insert'
    );

    expect(logInsert?.payload).toMatchObject({ credit_issued: false });
  });

  it('AC-4 (#91): Soft + notice unmet flags policy_violation and withholds credit', async () => {
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      { data: [policyRow({ notice_enforcement_mode: 'Soft' })], error: null },
      { data: CANCELLED_ROW, error: null },
      { data: LOG_ROW, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.policy_violation).toBe(true);
    expect(result.credit_issued).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();

    const logInsert = recordedWrites.find(
      (write) =>
        write.table === 'cancellation_logs' && write.method === 'insert'
    );

    expect(logInsert?.payload).toMatchObject({
      policy_violation: true,
      credit_issued: false,
    });
  });

  it('AC-5 (#91): every cancellation writes exactly one cancellation_logs row with the correct fields', async () => {
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      { data: [policyRow({ notice_enforcement_mode: 'Soft' })], error: null },
      { data: CANCELLED_ROW, error: null },
      { data: LOG_ROW, error: null }
    );

    await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    const logInserts = recordedWrites.filter(
      (write) =>
        write.table === 'cancellation_logs' && write.method === 'insert'
    );

    expect(logInserts).toHaveLength(1);
    expect(logInserts[0]?.payload).toMatchObject({
      event_type: 'cancellation',
      enforcement_mode_applied: 'Soft',
    });
  });

  it('a qualifying notice with no downpayment (e.g. Daycare) never issues credit', async () => {
    queueFromResults(
      { data: DAYCARE_BOOKING, error: null },
      { data: [policyRow()], error: null },
      { data: { ...DAYCARE_BOOKING, status: 'Cancelled' }, error: null },
      { data: LOG_ROW, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.notice_period_met).toBe(true);
    expect(result.credit_issued).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('AC-4 (#54): disabling enforcement system-wide clears the violation flag regardless of timing', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: ISSUED_TRANSACTION,
      error: null,
    } as never);
    queueFromResults(
      {
        data: { ...HOTEL_BOOKING, scheduled_start: daysFromNow(0.5) },
        error: null,
      },
      { data: [policyRow({ notice_enforcement_enabled: false })], error: null },
      { data: CANCELLED_ROW, error: null },
      { data: LOG_ROW, error: null },
      { data: null, error: null }
    );

    const result = await cancelBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: {},
    });

    expect(result.policy_violation).toBe(false);
  });

  it('AC-6 (#54): a non-owning customer gets 403', async () => {
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
