import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeBooking,
  createBooking,
  listBookings,
  overrideBookingStatus,
  startBooking,
} from './booking.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPackageById } from '../../maintenance/services/packages.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';
import { getDiscountById } from '../../discounts/services/discounts.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRoleOrNull: vi.fn(),
}));

vi.mock('../../maintenance/services/services.service.ts', () => ({
  getServiceById: vi.fn(),
}));

vi.mock('../../maintenance/services/packages.service.ts', () => ({
  getPackageById: vi.fn(),
}));

vi.mock('../../maintenance/services/promos.service.ts', () => ({
  getPromoById: vi.fn(),
}));

vi.mock('../../discounts/services/discounts.service.ts', () => ({
  getDiscountById: vi.fn(),
}));

// Issue #98: booking_confirmed dispatch is covered by its own unit tests
// (bookingNotifications.service.spec.ts) - mocked wholesale here so these
// pre-existing booking-creation tests don't need to account for its extra
// Supabase lookups (customer_profiles/branches/staff_profiles/notifications)
// in their sequential mock queues below.
vi.mock('./bookingNotifications.service.ts', () => ({
  sendBookingConfirmedNotification: vi.fn().mockResolvedValue(undefined),
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
      'gte',
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

const CUSTOMER_ID = 'cust-1';
const PET = {
  id: 'pet-1',
  customer_id: CUSTOMER_ID,
  weight_class: 'S',
  coat_type: 'SC',
};
// Client interview finding: a pet never staff-assessed onsite has no
// weight_class/coat_type (...073_m02_pets_assessment_lock.sql).
const UNASSESSED_PET = {
  id: 'pet-2',
  customer_id: CUSTOMER_ID,
  weight_class: null,
  coat_type: null,
};

const DEFAULT_POLICY = {
  id: 'policy-default',
  branch_id: null,
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
};

const GROOMING_SERVICE = {
  id: 'service-groom',
  category: 'Grooming',
  name: 'Full Groom',
  base_price: 300,
  is_active: true,
  requires_assessed_pet: true,
  service_pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 350 }],
} as never;

const ASSESSMENT_SERVICE = {
  id: 'service-assessment',
  category: 'Grooming',
  name: 'Initial Assessment',
  base_price: 0,
  is_active: true,
  requires_assessed_pet: false,
  service_pricing_tiers: [],
} as never;

const DAYCARE_SERVICE = {
  id: 'service-daycare',
  category: 'Daycare',
  name: 'Daycare Session',
  base_price: 100,
  is_active: true,
  service_pricing_tiers: [],
} as never;

const HOTEL_SERVICE = {
  id: 'service-hotel',
  category: 'Hotel',
  name: 'Hotel Stay - Small Cage',
  base_price: 800,
  duration_minutes: 1440,
  is_active: true,
  service_pricing_tiers: [],
} as never;

const VET_SERVICE = {
  id: 'service-vet',
  category: 'Veterinary',
  name: 'Consultation',
  base_price: 500,
  is_active: true,
  service_pricing_tiers: [],
} as never;

const GROOMER = {
  staff_id: 'groomer-1',
  display_name: 'Ana',
  profile_photo_url: null,
};

const BASE_INPUT = {
  pet_id: PET.id,
  branch_id: 'branch-1',
  service_category: 'Grooming' as const,
  items: [{ service_id: 'service-groom' }],
  scheduled_start: '2026-08-03T01:00:00+00:00',
  scheduled_end: '2026-08-03T02:00:00+00:00',
};

const INSERTED_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  pet_id: PET.id,
  branch_id: 'branch-1',
  service_category: 'Grooming',
  assigned_staff_id: 'groomer-1',
  status: 'Pending',
  scheduled_start: BASE_INPUT.scheduled_start,
  scheduled_end: BASE_INPUT.scheduled_end,
  total_price: 350,
  reschedule_count: 0,
};

describe('booking.service (#51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [GROOMER],
      error: null,
    } as never);
  });

  it('AC-1/AC-4: creates a Pending Grooming booking (tiered price, auto-assigned staff, capacity re-verified post-insert)', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // bookings insert
      { data: null, error: null }, // booking_items insert
      { data: null, error: null }, // staff_picker_preferences insert
      { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    const booking = await createBooking({
      requesterId: CUSTOMER_ID,
      input: { ...BASE_INPUT, payment_confirmed: true },
    });

    expect(booking.id).toBe('booking-1');

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({
      status: 'Pending',
      assigned_staff_id: 'groomer-1',
      total_price: 350, // S/SC tier price, not base_price
      downpayment_amount: null,
    });
  });

  it('AC-4: a pay-at-counter (payment_confirmed=false) Daycare booking still starts Pending and still holds its capacity slot immediately', async () => {
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [], error: null }, // pre-insert daycare overlap count - empty
      {
        data: { ...INSERTED_BOOKING, id: 'booking-2', status: 'Pending' },
        error: null,
      }, // insert
      { data: null, error: null }, // booking_items insert
      {
        data: [
          {
            id: 'booking-2',
            pet_id: PET.id,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      }, // post-insert re-count (always runs now, regardless of status) - winner
      {
        data: { ...INSERTED_BOOKING, id: 'booking-2', status: 'Pending' },
        error: null,
      } // final fetch
    );

    await createBooking({
      requesterId: CUSTOMER_ID,
      input: {
        ...BASE_INPUT,
        service_category: 'Daycare',
        items: [{ service_id: 'service-daycare' }],
        payment_confirmed: false,
        payment_method: 'Cash',
      },
    });

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({ status: 'Pending' });
  });

  it('AC-4: Veterinary confirms without any payment gate', async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // #53 guard
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      {
        data: { ...INSERTED_BOOKING, service_category: 'Veterinary' },
        error: null,
      }, // insert
      { data: null, error: null }, // booking_items insert
      { data: null, error: null }, // preference insert
      { data: [{ id: 'booking-1' }], error: null }, // re-count winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    await createBooking({
      requesterId: CUSTOMER_ID,
      input: {
        ...BASE_INPUT,
        service_category: 'Veterinary',
        items: [{ service_id: 'service-vet' }],
        branch_id: 'branch-makati',
        // no payment_confirmed at all
      },
    });

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({
      status: 'Pending',
      payment_confirmed: false,
    });
  });

  it('AC-3 (#53 cross-check): a Veterinary booking at a non-vet branch is rejected before any capacity path', async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      {
        data: { id: 'branch-south', name: 'Southwoods', is_vet_branch: false },
        error: null,
      } // #53 guard
    );

    await expect(
      createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          service_category: 'Veterinary',
          items: [{ service_id: 'service-vet' }],
          branch_id: 'branch-south',
        },
      })
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('AC-6: a customer cannot book against another customer pet', async () => {
    queueFromResults({
      data: { ...PET, customer_id: 'someone-else' },
      error: null,
    });

    await expect(
      createBooking({ requesterId: CUSTOMER_ID, input: BASE_INPUT })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  describe('assessment gate (client interview finding: weight_class/coat_type are staff-only, and drive Grooming price/Hotel cage size)', () => {
    it('rejects booking a normal service against an unassessed pet', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults({ data: UNASSESSED_PET, error: null }); // pet ownership

      await expect(
        createBooking({
          requesterId: CUSTOMER_ID,
          input: { ...BASE_INPUT, pet_id: UNASSESSED_PET.id },
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects booking a package against an unassessed pet', async () => {
      queueFromResults({ data: UNASSESSED_PET, error: null }); // pet ownership

      await expect(
        createBooking({
          requesterId: CUSTOMER_ID,
          input: {
            pet_id: UNASSESSED_PET.id,
            branch_id: 'branch-1',
            service_category: 'Daycare',
            items: [{ package_id: 'package-1' }],
            scheduled_start: BASE_INPUT.scheduled_start,
            scheduled_end: BASE_INPUT.scheduled_end,
          },
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(getPackageById).not.toHaveBeenCalled();
    });

    it('allows booking the Initial Assessment service (requires_assessed_pet=false) against an unassessed pet', async () => {
      vi.mocked(getServiceById).mockResolvedValue(ASSESSMENT_SERVICE);
      queueFromResults(
        { data: UNASSESSED_PET, error: null }, // pet ownership
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        {
          data: { ...INSERTED_BOOKING, id: 'booking-4', total_price: 0 },
          error: null,
        }, // insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // preference insert
        { data: [{ id: 'booking-4' }], error: null }, // re-count winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      const booking = await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          pet_id: UNASSESSED_PET.id,
          items: [{ service_id: ASSESSMENT_SERVICE.id }],
        },
      });

      expect(booking.id).toBe('booking-1');

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({ total_price: 0 });
    });
  });

  it('AC-5: the race loser is deleted and receives the capacity-taken error', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // insert
      { data: null, error: null }, // booking_items insert
      { data: null, error: null }, // preference insert
      {
        data: [{ id: 'booking-racer' }, { id: 'booking-1' }],
        error: null,
      }, // re-count: another row was created first
      { data: null, error: null } // delete own row
    );

    await expect(
      createBooking({
        requesterId: CUSTOMER_ID,
        input: { ...BASE_INPUT, payment_confirmed: true },
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Capacity was taken'),
    });

    expect(recordedWrites).toContainEqual(
      expect.objectContaining({ table: 'bookings', method: 'delete' })
    );
  });

  it('rejects a specific staff preference who no longer passes the RPC', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null } // staff picker toggle
    );

    await expect(
      createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          payment_confirmed: true,
          staff_preference: { type: 'specific', staff_id: 'groomer-9' },
        },
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('requires customer_id when a staff member books on behalf of a customer', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');

    await expect(
      createBooking({ requesterId: 'recept-1', input: BASE_INPUT })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('books via a package with the bundled price and branch match', async () => {
    vi.mocked(getPackageById).mockResolvedValue({
      id: 'package-1',
      branch_id: 'branch-1',
      name: 'Puppy Bundle',
      bundled_price: 999,
      is_active: true,
    } as never);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [], error: null }, // daycare overlap - empty
      {
        data: {
          ...INSERTED_BOOKING,
          id: 'booking-3',
          service_category: 'Daycare',
          assigned_staff_id: null,
          status: 'Pending',
        },
        error: null,
      }, // insert
      { data: null, error: null }, // booking_items insert
      { data: [{ id: 'booking-3' }], error: null }, // re-count winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    await createBooking({
      requesterId: CUSTOMER_ID,
      input: {
        pet_id: PET.id,
        branch_id: 'branch-1',
        service_category: 'Daycare',
        items: [{ package_id: 'package-1' }],
        scheduled_start: BASE_INPUT.scheduled_start,
        scheduled_end: BASE_INPUT.scheduled_end,
        payment_confirmed: true,
      },
    });

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({ total_price: 999 });

    const itemsInsert = recordedWrites.find(
      (write) => write.table === 'booking_items' && write.method === 'insert'
    );

    expect(itemsInsert?.payload).toMatchObject([
      { package_id: 'package-1', service_id: null, price_at_booking: 999 },
    ]);
  });

  describe('listBookings (#59/#60 supporting infra)', () => {
    it('scopes a customer caller to their own rows regardless of branch/status filters', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults({
        data: [
          {
            id: 'booking-1',
            status: 'Pending',
            scheduled_start: '2099-01-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await listBookings({
        requesterId: CUSTOMER_ID,
        filters: { branchId: 'branch-1', status: 'Pending' },
      });

      expect(result).toHaveLength(1);

      const builder = vi.mocked(supabase.from).mock.results[0].value as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(builder.eq).toHaveBeenCalledWith('customer_id', CUSTOMER_ID);
      // branch_id is never applied for a customer caller - ownership scoping
      // alone decides the row set.
      expect(builder.eq).not.toHaveBeenCalledWith('branch_id', 'branch-1');
    });

    it('applies branch/service/status filters for a staff caller', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults({ data: [], error: null });

      await listBookings({
        requesterId: 'staff-1',
        filters: {
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          status: 'Pending',
        },
      });

      const builder = vi.mocked(supabase.from).mock.results[0].value as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(builder.eq).toHaveBeenCalledWith('branch_id', 'branch-1');
      expect(builder.eq).toHaveBeenCalledWith('service_category', 'Grooming');
      expect(builder.eq).toHaveBeenCalledWith('status', 'Pending');
    });

    it('re-filters out a row the lazy No-show transition flipped away from the requested status filter', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults(
        {
          data: [
            {
              id: 'booking-stale',
              status: 'Pending',
              scheduled_start: '2020-01-01T00:00:00.000Z', // long past
            },
          ],
          error: null,
        }, // list query
        {
          data: [
            {
              id: 'booking-stale',
              status: 'No-show',
              scheduled_start: '2020-01-01T00:00:00.000Z',
            },
          ],
          error: null,
        } // the No-show bulk-update's own .select()
      );

      const result = await listBookings({
        requesterId: 'staff-1',
        filters: { status: 'Pending' },
      });

      // The row flipped to No-show mid-request, so it no longer belongs in
      // a "status = Pending" result even though the initial DB query (which
      // ran before the flip) matched it.
      expect(result).toHaveLength(0);
    });

    it('applies a date_from/date_to range as an inclusive [start, end+1day) window', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults({ data: [], error: null });

      await listBookings({
        requesterId: 'staff-1',
        filters: { dateFrom: '2026-07-20', dateTo: '2026-07-26' },
      });

      const builder = vi.mocked(supabase.from).mock.results[0].value as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(builder.gte).toHaveBeenCalledWith(
        'scheduled_start',
        '2026-07-20T00:00:00.000Z'
      );
      expect(builder.lt).toHaveBeenCalledWith(
        'scheduled_start',
        '2026-07-27T00:00:00.000Z'
      );
    });

    it('ignores date_from/date_to when an exact date is also given', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults({ data: [], error: null });

      await listBookings({
        requesterId: 'staff-1',
        filters: {
          date: '2026-07-22',
          dateFrom: '2026-07-01',
          dateTo: '2026-07-31',
        },
      });

      const builder = vi.mocked(supabase.from).mock.results[0].value as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(builder.gte).toHaveBeenCalledWith(
        'scheduled_start',
        '2026-07-22T00:00:00.000Z'
      );
      expect(builder.gte).not.toHaveBeenCalledWith(
        'scheduled_start',
        '2026-07-01T00:00:00.000Z'
      );
    });
  });

  describe('startBooking/completeBooking (booking-status revision manual actions)', () => {
    it('startBooking: Pending -> In Progress, sets started_at', async () => {
      queueFromResults(
        { data: { ...INSERTED_BOOKING, status: 'Pending' }, error: null }, // load
        { data: { ...INSERTED_BOOKING, status: 'In Progress' }, error: null } // update
      );

      const booking = await startBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('In Progress');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'In Progress' });
      expect(
        (update?.payload as { started_at?: string }).started_at
      ).toBeTruthy();
    });

    it('startBooking: rejects a booking that is not Pending', async () => {
      queueFromResults({
        data: { ...INSERTED_BOOKING, status: 'In Progress' },
        error: null,
      });

      await expect(
        startBooking({ bookingId: 'booking-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('completeBooking: In Progress -> Completed for a pay-at-counter booking (payment_stage untouched)', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'In Progress',
            payment_method: 'Cash',
            payment_confirmed: false,
          },
          error: null,
        }, // load
        { data: { ...INSERTED_BOOKING, status: 'Completed' }, error: null } // update
      );

      const booking = await completeBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'Completed' });
      expect(update?.payload).not.toHaveProperty('payment_stage');
      expect(update?.payload).not.toHaveProperty('paid_at');
    });

    it('completeBooking: auto-advances payment_stage to Paid when payment_method is an already-confirmed online method', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'In Progress',
            payment_method: 'GCash',
            payment_confirmed: true,
          },
          error: null,
        }, // load
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Completed',
            payment_stage: 'Paid',
          },
          error: null,
        } // update
      );

      const booking = await completeBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({
        status: 'Completed',
        payment_stage: 'Paid',
      });
      expect((update?.payload as { paid_at?: string }).paid_at).toBeTruthy();
    });

    it('completeBooking: an online method that was never actually confirmed leaves payment_stage untouched', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'In Progress',
            payment_method: 'GCash',
            payment_confirmed: false,
          },
          error: null,
        },
        { data: { ...INSERTED_BOOKING, status: 'Completed' }, error: null }
      );

      const booking = await completeBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).not.toHaveProperty('payment_stage');
    });

    it('completeBooking: rejects a booking that is not In Progress', async () => {
      queueFromResults({
        data: { ...INSERTED_BOOKING, status: 'Pending' },
        error: null,
      });

      await expect(
        completeBooking({ bookingId: 'booking-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('overrideBookingStatus (Admin/Superadmin revert-capable dropdown)', () => {
    it('reverts Completed -> In Progress and clears completed_at', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Completed',
            started_at: '2026-08-01T00:00:00Z',
            completed_at: '2026-08-01T01:00:00Z',
          },
          error: null,
        }, // load
        { data: { ...INSERTED_BOOKING, status: 'In Progress' }, error: null } // update
      );

      const booking = await overrideBookingStatus({
        bookingId: 'booking-1',
        status: 'In Progress',
      });

      expect(booking.status).toBe('In Progress');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({
        status: 'In Progress',
        completed_at: null,
      });
      expect(update?.payload).not.toHaveProperty('paid_at');
    });

    it('advances Pending directly to Completed, filling started_at and completed_at at once', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Pending',
            started_at: null,
            completed_at: null,
          },
          error: null,
        }, // load
        { data: { ...INSERTED_BOOKING, status: 'Completed' }, error: null } // update
      );

      await overrideBookingStatus({
        bookingId: 'booking-1',
        status: 'Completed',
      });

      const update = recordedWrites.find((write) => write.method === 'update');
      const payload = update?.payload as {
        status: string;
        started_at: string | null;
        completed_at: string | null;
      };
      expect(payload.status).toBe('Completed');
      expect(payload.started_at).toBeTruthy();
      expect(payload.completed_at).toBeTruthy();
    });

    it('reverts all the way back to Pending, clearing every downstream timestamp', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Completed',
            started_at: '2026-08-01T00:00:00Z',
            completed_at: '2026-08-01T01:00:00Z',
          },
          error: null,
        }, // load
        { data: { ...INSERTED_BOOKING, status: 'Pending' }, error: null } // update
      );

      await overrideBookingStatus({
        bookingId: 'booking-1',
        status: 'Pending',
      });

      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({
        status: 'Pending',
        started_at: null,
        completed_at: null,
      });
    });
  });

  describe('discount/promo application at booking creation', () => {
    const DAYCARE_DISCOUNT = {
      id: 'discount-1',
      branch_id: 'branch-1',
      name: 'Custom Daycare Discount',
      is_mandated: false,
      discount_type: 'Flat',
      value: 50,
      scope_type: 'service',
      scope_service_id: 'service-daycare',
      scope_package_id: null,
      scope_category: null,
      is_active: true,
    } as never;

    const ALL_SERVICES_PROMO = {
      id: 'promo-1',
      name: 'Everything 10% off',
      start_date: null,
      end_date: null,
      discount_type: 'Percentage',
      value: 10,
      scope_type: 'all_services',
      branch_scope: 'both',
      is_active: true,
      promo_scope: [],
    } as never;

    it('applies a Cash discount for a money-handling staff role', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getDiscountById).mockResolvedValue(DAYCARE_DISCOUNT);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [], error: null }, // daycare overlap - empty
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: [{ id: 'booking-1' }], error: null }, // re-count winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: 'cashier-1',
        input: {
          ...BASE_INPUT,
          customer_id: CUSTOMER_ID,
          service_category: 'Daycare',
          items: [{ service_id: 'service-daycare' }],
          payment_method: 'Cash',
          discount_id: 'discount-1',
        },
      });

      expect(getDiscountById).toHaveBeenCalledWith('discount-1');
      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        selected_discount_id: 'discount-1',
        discount_amount: 50,
      });
    });

    it('rejects a discount when the payment method is not Cash', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
      queueFromResults({ data: PET, error: null }); // pet ownership

      await expect(
        createBooking({
          requesterId: 'cashier-1',
          input: {
            ...BASE_INPUT,
            customer_id: CUSTOMER_ID,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            payment_method: 'GCash',
            discount_id: 'discount-1',
          },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Cash'),
      });

      expect(getDiscountById).not.toHaveBeenCalled();
    });

    it('rejects a discount when the requester is not a money-handling staff role', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Groomer');
      queueFromResults({ data: PET, error: null }); // pet ownership

      await expect(
        createBooking({
          requesterId: 'groomer-1',
          input: {
            ...BASE_INPUT,
            customer_id: CUSTOMER_ID,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            payment_method: 'Cash',
            discount_id: 'discount-1',
          },
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(getDiscountById).not.toHaveBeenCalled();
    });

    it('applies a promo regardless of role or payment method, capped by promo_cap_configuration', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getPromoById).mockResolvedValue(ALL_SERVICES_PROMO);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null); // a customer, not staff
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: { cap_type: 'flat', cap_value: 1000 }, error: null }, // promo_cap_configuration (branch row)
        { data: [], error: null }, // daycare overlap - empty
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: [{ id: 'booking-1' }], error: null }, // re-count winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          service_category: 'Daycare',
          items: [{ service_id: 'service-daycare' }],
          promo_id: 'promo-1',
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        selected_promo_id: 'promo-1',
        promo_amount: 10, // 10% of the 100 daycare service price
      });
    });

    it('rejects a promo whose scope does not match the selected items', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getPromoById).mockResolvedValue({
        ...ALL_SERVICES_PROMO,
        scope_type: 'specific',
        promo_scope: [
          {
            id: 'scope-1',
            promo_id: 'promo-1',
            service_id: 'other-service',
            package_id: null,
          },
        ],
      } as never);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults({ data: PET, error: null }); // pet ownership

      await expect(
        createBooking({
          requesterId: CUSTOMER_ID,
          input: {
            ...BASE_INPUT,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            promo_id: 'promo-1',
          },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('Hotel nights pricing', () => {
    const ORIGINAL_ENV = process.env.HOTEL_CAGE_CAPACITY;

    beforeEach(() => {
      // Bypasses the real cages-table count query (Sprint 4/M05 scope) -
      // capacity.service.ts's own documented override.
      process.env.HOTEL_CAGE_CAPACITY = '{"S":10,"M":8,"L":6,"XL":4}';
    });

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) delete process.env.HOTEL_CAGE_CAPACITY;
      else process.env.HOTEL_CAGE_CAPACITY = ORIGINAL_ENV;
    });

    it('prices a 3-night stay at base_price x 3, not a flat one-time fee', async () => {
      vi.mocked(getServiceById).mockResolvedValue(HOTEL_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [], error: null }, // Hotel overlap - empty (filterSameSizeRows then short-circuits, no query)
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: [{ id: 'booking-1' }], error: null }, // re-count winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          service_category: 'Hotel',
          items: [{ service_id: 'service-hotel' }],
          scheduled_start: '2026-08-03T01:00:00+00:00',
          // 3 nights (3 x 1440 minutes) after scheduled_start.
          scheduled_end: '2026-08-06T01:00:00+00:00',
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({ total_price: 2400 });

      const itemsInsert = recordedWrites.find(
        (write) => write.table === 'booking_items' && write.method === 'insert'
      );
      expect(itemsInsert?.payload).toMatchObject([
        { service_id: 'service-hotel', price_at_booking: 2400 },
      ]);
    });

    it('prices a 1-night stay at the flat base_price (quantity of 1)', async () => {
      vi.mocked(getServiceById).mockResolvedValue(HOTEL_SERVICE);
      queueFromResults(
        { data: PET, error: null },
        { data: [], error: null },
        { data: INSERTED_BOOKING, error: null },
        { data: null, error: null },
        { data: [{ id: 'booking-1' }], error: null },
        { data: INSERTED_BOOKING, error: null }
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          service_category: 'Hotel',
          items: [{ service_id: 'service-hotel' }],
          scheduled_start: '2026-08-03T01:00:00+00:00',
          scheduled_end: '2026-08-04T01:00:00+00:00',
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({ total_price: 800 });
    });
  });
});
