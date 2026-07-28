import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rescheduleBooking } from './reschedule.service.ts';
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

const DAYCARE_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  service_category: 'Daycare',
  status: 'Pending',
  scheduled_start: daysFromNow(10),
  scheduled_end: daysFromNow(10.1),
  assigned_staff_id: null,
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

const NEW_WINDOW = {
  scheduled_start: daysFromNow(12),
  scheduled_end: daysFromNow(12.1),
};

describe('reschedule.service (#54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-1: a reschedule meeting the notice period updates the booking in place and increments reschedule_count', async () => {
    queueFromResults(
      { data: DAYCARE_BOOKING, error: null }, // booking fetch
      { data: [policyRow()], error: null }, // policy
      { data: { weight_class: 'S' }, error: null }, // pet
      { data: [], error: null }, // capacity overlap - empty
      {
        data: { ...DAYCARE_BOOKING, ...NEW_WINDOW, reschedule_count: 1 },
        error: null,
      } // update
    );

    const result = await rescheduleBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: NEW_WINDOW,
    });

    expect(result.policy_violation).toBe(false);
    expect(result.notice_period_met).toBe(true);

    const update = recordedWrites.find((write) => write.method === 'update');

    expect(update?.payload).toMatchObject({
      scheduled_start: NEW_WINDOW.scheduled_start,
      reschedule_count: 1,
    });
  });

  it('AC-2: Strict mode blocks a reschedule that misses the notice period, naming the requirement', async () => {
    queueFromResults(
      {
        data: { ...DAYCARE_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      { data: [policyRow()], error: null }
    );

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('3 day(s) notice'),
    });

    expect(recordedWrites).toHaveLength(0);
  });

  it('AC-3: Soft mode allows the same reschedule but flags policy_violation: true', async () => {
    queueFromResults(
      {
        data: { ...DAYCARE_BOOKING, scheduled_start: daysFromNow(1) },
        error: null,
      },
      {
        data: [policyRow({ notice_enforcement_mode: 'Soft' })],
        error: null,
      },
      { data: { weight_class: 'S' }, error: null },
      { data: [], error: null },
      {
        data: { ...DAYCARE_BOOKING, ...NEW_WINDOW, reschedule_count: 1 },
        error: null,
      }
    );

    const result = await rescheduleBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: NEW_WINDOW,
    });

    expect(result.policy_violation).toBe(true);
    expect(result.notice_period_met).toBe(false);
  });

  it('AC-4: disabling enforcement system-wide allows any reschedule regardless of timing', async () => {
    queueFromResults(
      {
        data: { ...DAYCARE_BOOKING, scheduled_start: daysFromNow(0.5) },
        error: null,
      },
      {
        data: [policyRow({ notice_enforcement_enabled: false })],
        error: null,
      },
      { data: { weight_class: 'S' }, error: null },
      { data: [], error: null },
      {
        data: { ...DAYCARE_BOOKING, ...NEW_WINDOW, reschedule_count: 1 },
        error: null,
      }
    );

    const result = await rescheduleBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      input: NEW_WINDOW,
    });

    expect(result.policy_violation).toBe(false);
  });

  it('re-runs the capacity check for the new slot and rejects when it fails', async () => {
    vi.stubEnv('DAYCARE_SESSION_CAPACITY', '1');
    queueFromResults(
      { data: DAYCARE_BOOKING, error: null },
      { data: [policyRow()], error: null },
      { data: { weight_class: 'S' }, error: null },
      {
        data: [{ id: 'booking-other', pet_id: 'pet-9', created_at: '' }],
        error: null,
      } // capacity overlap - full
    );

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('#53 AC-4: rescheduling a Veterinary booking to a non-vet branch is rejected by the same guard', async () => {
    queueFromResults(
      {
        data: { ...DAYCARE_BOOKING, service_category: 'Veterinary' },
        error: null,
      },
      {
        data: { id: 'branch-south', name: 'Southwoods', is_vet_branch: false },
        error: null,
      }
    );

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: { ...NEW_WINDOW, branch_id: 'branch-south' },
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('Grooming: a specific staff preference is re-verified via the RPC (excluding the booking itself)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);
    queueFromResults(
      {
        data: {
          ...DAYCARE_BOOKING,
          service_category: 'Grooming',
          assigned_staff_id: 'groomer-1',
        },
        error: null,
      },
      { data: [policyRow()], error: null }
    );

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: {
          ...NEW_WINDOW,
          staff_preference: { type: 'specific', staff_id: 'groomer-2' },
        },
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'get_staff_availability',
      expect.objectContaining({
        p_staff_id: 'groomer-2',
        p_exclude_booking_id: 'booking-1',
      })
    );
  });

  it('AC-6: a non-owning customer gets 403', async () => {
    queueFromResults({ data: DAYCARE_BOOKING, error: null });

    await expect(
      rescheduleBooking({
        requesterId: 'someone-else',
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses to reschedule a Cancelled booking', async () => {
    queueFromResults({
      data: { ...DAYCARE_BOOKING, status: 'Cancelled' },
      error: null,
    });

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses to reschedule an In Progress booking - only Pending is reschedulable', async () => {
    queueFromResults({
      data: { ...DAYCARE_BOOKING, status: 'In Progress' },
      error: null,
    });

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses to reschedule a Pending booking whose own scheduled_start has already passed (shouldn't be reschedulable once it's overdue)", async () => {
    queueFromResults({
      data: { ...DAYCARE_BOOKING, scheduled_start: daysFromNow(-1) },
      error: null,
    });

    await expect(
      rescheduleBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        input: NEW_WINDOW,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('already passed'),
    });
  });
});
