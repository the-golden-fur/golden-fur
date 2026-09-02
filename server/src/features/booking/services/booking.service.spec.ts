import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeBooking,
  createBooking,
  listBookings,
  listPetBookingConflicts,
  overrideBookingStatus,
  recomputeBookingPaymentStatus,
  resolvePackagePrice,
  resolveServicePrice,
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
  sendStaffAssignedNotification: vi.fn().mockResolvedValue(undefined),
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
  pet_type: 'Dog',
  weight_class: 'S',
  coat_type: 'SC',
};
// Client interview finding: a pet never staff-assessed onsite has no
// weight_class/coat_type (...073_m02_pets_assessment_lock.sql).
const UNASSESSED_PET = {
  id: 'pet-2',
  customer_id: CUSTOMER_ID,
  pet_type: 'Dog',
  weight_class: null,
  coat_type: null,
};
const CAT_PET = {
  id: 'pet-3',
  customer_id: CUSTOMER_ID,
  pet_type: 'Cat',
  weight_class: 'S',
  coat_type: 'SC',
};

const DEFAULT_POLICY = {
  id: 'policy-default',
  branch_id: null,
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  // Off for the bulk of these tests, which use a fixed BASE_INPUT date and
  // aren't exercising the minimum-notice lead time - see the dedicated
  // "minimum-notice lead time" describe block for the enabled case.
  notice_enforcement_enabled: false,
  // New-booking notice floor: 0 = same-day allowed. See the dedicated
  // "minimum-notice lead time" describe block for the enabled case.
  booking_notice_period_days: 0,
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
  downpayment_enabled: false,
  downpayment_hold_hours: 24,
};

const GROOMING_SERVICE = {
  id: 'service-groom',
  category: 'Grooming',
  name: 'Full Groom',
  base_price: 300,
  is_active: true,
  requires_assessed_pet: true,
  use_pricing_matrix: true,
  service_pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 350 }],
} as never;

// Custom change (pricing matrix fix): individual add-on services default to
// flat pricing now - use_pricing_matrix: false means the tier is never
// consulted even though one exists on this fixture, matching the board's
// "individual services don't vary by size/coat" pricing.
const FLAT_GROOMING_SERVICE = {
  id: 'service-flat-groom',
  category: 'Grooming',
  name: 'Nail Trim',
  base_price: 100,
  is_active: true,
  requires_assessed_pet: true,
  use_pricing_matrix: false,
  service_pricing_tiers: [{ weight_class: 'S', coat_type: 'SC', price: 999 }],
} as never;

const ASSESSMENT_SERVICE = {
  id: 'service-assessment',
  category: 'Grooming',
  name: 'Initial Assessment',
  base_price: 0,
  is_active: true,
  requires_assessed_pet: false,
  use_pricing_matrix: false,
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
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // bookings insert
      { data: null, error: null }, // booking_items insert
      { data: null, error: null }, // staff_picker_preferences insert
      { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    const booking = await createBooking({
      requesterId: CUSTOMER_ID,
      input: BASE_INPUT,
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

  // Payment model rework: every non-Veterinary booking emits its initial
  // Pending booking_payment charge(s) via the create_initial_booking_charge
  // RPC; Veterinary is priced during the visit, so it gets none. A 'full'
  // scheme (here - DEFAULT_POLICY has downpayment off) is one charge for the
  // whole net total.
  it('emits an initial full-payment charge via create_initial_booking_charge for a normal Grooming booking', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // bookings insert
      { data: null, error: null }, // booking_items insert
      { data: null, error: null }, // staff_picker_preferences insert
      { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    await createBooking({ requesterId: CUSTOMER_ID, input: BASE_INPUT });

    expect(supabase.rpc).toHaveBeenCalledWith('create_initial_booking_charge', {
      p_booking_id: 'booking-1',
      p_scheme: 'full',
      p_net_total: 350,
      p_downpayment_amount: null,
    });
  });

  it('does not emit an initial charge for a Veterinary booking (priced during the visit)', async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // #53 guard
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
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
      },
    });

    expect(
      recordedWrites.find((write) => write.table === 'transactions')
    ).toBeUndefined();
  });

  it('AC-4: a Daycare booking starts Pending and holds its capacity slot immediately', async () => {
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
        input: BASE_INPUT,
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
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
      { data: [DEFAULT_POLICY], error: null } // staff picker toggle
    );

    await expect(
      createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
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
      name: 'Puppy Bundle',
      bundled_price: 999,
      is_active: true,
      package_branch_availability: [
        { package_id: 'package-1', branch_id: 'branch-1', is_available: true },
      ],
    } as never);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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

  it("rejects a package that isn't available at the booking's branch (custom change: packages are no longer scoped to exactly one branch_id)", async () => {
    vi.mocked(getPackageById).mockResolvedValue({
      id: 'package-1',
      name: 'Puppy Bundle',
      bundled_price: 999,
      is_active: true,
      package_branch_availability: [
        {
          package_id: 'package-1',
          branch_id: 'branch-southwoods',
          is_available: true,
        },
      ],
    } as never);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [], error: null } // daycare overlap - empty
    );

    await expect(
      createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          pet_id: PET.id,
          branch_id: 'branch-1',
          service_category: 'Daycare',
          items: [{ package_id: 'package-1' }],
          scheduled_start: BASE_INPUT.scheduled_start,
          scheduled_end: BASE_INPUT.scheduled_end,
        },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Walk-in booking flow (custom change): a receptionist registering a
  // customer/pet physically at the branch right now skips the down payment
  // policy entirely and starts already 'In Progress' - see the top-of-file
  // dev note on createBooking and BookingSource in booking.types.ts.
  describe('walk-in booking flow (custom change)', () => {
    it('a staff-created Walk-in booking skips resolveDownpaymentPolicy entirely and starts In Progress', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        // NOTE: no resolveDownpaymentPolicy query here at all (skipped) -
        // the very next query is the staff picker toggle.
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'In Progress',
            booking_source: 'Walk-in',
            downpayment_required: false,
            downpayment_amount: null,
          },
          error: null,
        }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: 'recept-1',
        input: {
          ...BASE_INPUT,
          customer_id: CUSTOMER_ID,
          booking_source: 'Walk-in',
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );

      expect(insert?.payload).toMatchObject({
        booking_source: 'Walk-in',
        status: 'In Progress',
        downpayment_required: false,
        downpayment_amount: null,
      });
      expect(
        (insert?.payload as { started_at?: string }).started_at
      ).toBeTruthy();

      // resolveDownpaymentPolicy and the staff picker toggle both query
      // 'policy_configurations' - exactly one such call means only the
      // staff picker toggle ran, not resolveDownpaymentPolicy.
      const policyQueries = vi
        .mocked(supabase.from)
        .mock.calls.filter(([table]) => table === 'policy_configurations');
      expect(policyQueries).toHaveLength(1);
    });

    it('an Online booking (default, unaffected) still calls resolveDownpaymentPolicy and persists booking_source Online', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: BASE_INPUT,
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );

      expect(insert?.payload).toMatchObject({
        booking_source: 'Online',
        status: 'Pending',
      });

      const policyQueries = vi
        .mocked(supabase.from)
        .mock.calls.filter(([table]) => table === 'policy_configurations');
      expect(policyQueries).toHaveLength(2);
    });

    it('rejects booking_source Walk-in from a non-staff (customer) requester', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);

      await expect(
        createBooking({
          requesterId: CUSTOMER_ID,
          input: { ...BASE_INPUT, booking_source: 'Walk-in' },
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      // Rejected before any lookup runs at all - not just before the insert.
      expect(supabase.from).not.toHaveBeenCalled();
    });
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

    it('custom change (bookings/payments queue paid/unpaid filter): applies a payment_status filter independently of status', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults({ data: [], error: null });

      await listBookings({
        requesterId: 'staff-1',
        filters: { paymentStatus: 'Pending' },
      });

      const builder = vi.mocked(supabase.from).mock.results[0].value as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(builder.eq).toHaveBeenCalledWith('payment_status', 'Pending');
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

    it('down-payment slot gate: auto-cancels an unpaid down-payment booking past its downpayment_due_at (lazy, read-time)', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults(
        {
          data: [
            {
              id: 'booking-expired',
              status: 'Pending',
              downpayment_required: true,
              payment_status: 'Pending',
              downpayment_due_at: '2020-01-01T00:00:00.000Z', // long past
              scheduled_start: '2099-01-01T00:00:00.000Z', // still future - not a no-show
            },
          ],
          error: null,
        }, // list query
        {
          data: [
            {
              id: 'booking-expired',
              status: 'Cancelled',
              downpayment_required: true,
              payment_status: 'Pending',
              downpayment_due_at: '2020-01-01T00:00:00.000Z',
              scheduled_start: '2099-01-01T00:00:00.000Z',
              cancellation_reason:
                'Down payment not received before the reservation deadline',
            },
          ],
          error: null,
        } // the expiry bulk-update's own .select()
      );

      const result = await listBookings({
        requesterId: 'staff-1',
        filters: {},
      });

      expect(result[0]).toMatchObject({
        id: 'booking-expired',
        status: 'Cancelled',
      });

      const update = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'update'
      );
      expect(update?.payload).toMatchObject({ status: 'Cancelled' });
    });

    it('down-payment slot gate: leaves an unpaid down-payment booking alone before its deadline', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      queueFromResults({
        data: [
          {
            id: 'booking-pending',
            status: 'Pending',
            downpayment_required: true,
            payment_status: 'Pending',
            downpayment_due_at: '2099-01-01T00:00:00.000Z', // still ahead
            scheduled_start: '2099-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await listBookings({
        requesterId: 'staff-1',
        filters: {},
      });

      expect(result[0].status).toBe('Pending');
      expect(recordedWrites.some((write) => write.table === 'bookings')).toBe(
        false
      );
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

    it('startBooking: rejects an unpaid Online booking (Unconfirmed - checking it in would strand it)', async () => {
      queueFromResults({
        data: {
          ...INSERTED_BOOKING,
          status: 'Pending',
          booking_source: 'Online',
          service_category: 'Grooming',
          payment_status: 'Pending',
        },
        error: null,
      });

      await expect(
        startBooking({ bookingId: 'booking-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(recordedWrites.find((write) => write.method === 'update')).toBe(
        undefined
      );
    });

    it('startBooking: allows a Veterinary Online booking with no payment yet (priced during the visit)', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Pending',
            booking_source: 'Online',
            service_category: 'Veterinary',
            payment_status: 'Pending',
          },
          error: null,
        }, // load
        {
          data: { ...INSERTED_BOOKING, status: 'In Progress' },
          error: null,
        } // update
      );

      expect((await startBooking({ bookingId: 'booking-1' })).status).toBe(
        'In Progress'
      );
    });

    it('startBooking: allows an Online booking once a payment is recorded (payment_status past Pending)', async () => {
      queueFromResults(
        {
          data: {
            ...INSERTED_BOOKING,
            status: 'Pending',
            booking_source: 'Online',
            payment_status: 'Partially Paid',
          },
          error: null,
        }, // load
        {
          data: { ...INSERTED_BOOKING, status: 'In Progress' },
          error: null,
        } // update
      );

      const booking = await startBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('In Progress');
    });

    it('completeBooking: In Progress -> Completed, never writes payment_status or paid_at', async () => {
      queueFromResults(
        {
          data: { ...INSERTED_BOOKING, status: 'In Progress' },
          error: null,
        }, // load
        { data: { ...INSERTED_BOOKING, status: 'Completed' }, error: null } // update
      );

      const booking = await completeBooking({ bookingId: 'booking-1' });

      expect(booking.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'Completed' });
      expect(update?.payload).not.toHaveProperty('payment_status');
      expect(update?.payload).not.toHaveProperty('paid_at');
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

  // Payment model rework: payment state is the rollup of the booking's
  // settled booking_payment transactions - recomputeBookingPaymentStatus
  // sums them and moves bookings.payment_status accordingly.
  describe('recomputeBookingPaymentStatus', () => {
    const NET_BOOKING = {
      ...INSERTED_BOOKING,
      status: 'Pending',
      booking_source: 'Online',
      payment_status: 'Pending',
      total_price: 500,
      discount_amount: 0,
      promo_amount: 0,
      downpayment_required: false,
      staff_picker_preferences: [],
    };

    it('sets Fully Paid + paid_at once settled transactions cover the net total', async () => {
      queueFromResults(
        { data: NET_BOOKING, error: null }, // getRawBookingById
        {
          data: [{ total_amount: 250 }, { total_amount: 300 }],
          error: null,
        }, // settled booking_payment transactions
        { data: { ...NET_BOOKING, payment_status: 'Fully Paid' }, error: null }, // update
        { data: { ...NET_BOOKING, payment_status: 'Fully Paid' }, error: null } // applyFirstBookingPaymentSideEffects: getRawBookingById
      );

      await recomputeBookingPaymentStatus('booking-1');

      const update = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'update'
      );
      expect(update?.payload).toMatchObject({ payment_status: 'Fully Paid' });
      expect((update?.payload as { paid_at?: string }).paid_at).toBeTruthy();
    });

    it('sets Partially Paid (no paid_at) when one settled transaction is short of the net total', async () => {
      queueFromResults(
        { data: NET_BOOKING, error: null }, // getRawBookingById
        { data: [{ total_amount: 150 }], error: null }, // settled transactions
        {
          data: { ...NET_BOOKING, payment_status: 'Partially Paid' },
          error: null,
        }, // update
        {
          data: { ...NET_BOOKING, payment_status: 'Partially Paid' },
          error: null,
        } // applyFirstBookingPaymentSideEffects: getRawBookingById
      );

      await recomputeBookingPaymentStatus('booking-1');

      const update = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'update'
      );
      expect(update?.payload).toMatchObject({
        payment_status: 'Partially Paid',
      });
      expect(update?.payload).not.toHaveProperty('paid_at');
    });

    it('stays Pending and writes nothing when there are no settled transactions (early return when unchanged)', async () => {
      queueFromResults(
        { data: NET_BOOKING, error: null }, // getRawBookingById
        { data: [], error: null } // no settled transactions
      );

      await recomputeBookingPaymentStatus('booking-1');

      expect(
        recordedWrites.find(
          (write) => write.table === 'bookings' && write.method === 'update'
        )
      ).toBeUndefined();
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
      name: 'Custom Daycare Discount',
      is_mandated: false,
      discount_type: 'Flat',
      value: 50,
      scope_type: 'service',
      scope_service_id: 'service-daycare',
      scope_package_id: null,
      scope_category: null,
      is_active: true,
      discount_branch_availability: [
        {
          discount_id: 'discount-1',
          branch_id: 'branch-1',
          is_available: true,
        },
      ],
    } as never;

    const ALL_SERVICES_PROMO = {
      id: 'promo-1',
      name: 'Everything 10% off',
      start_date: null,
      end_date: null,
      discount_type: 'Percentage',
      value: 10,
      scope_type: 'all_services',
      is_active: true,
      promo_scope: [],
      promo_branch_availability: [
        { promo_id: 'promo-1', branch_id: 'branch-1', is_available: true },
      ],
    } as never;

    it('applies a discount for a money-handling staff role', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getDiscountById).mockResolvedValue(DAYCARE_DISCOUNT);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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

    it('a booking that owes nothing (100% discount) is born Fully Paid with no initial charge', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getDiscountById).mockResolvedValue({
        ...DAYCARE_DISCOUNT,
        discount_type: 'Percentage',
        value: 100,
      } as never);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
        { data: [], error: null }, // daycare overlap - empty
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: [{ id: 'booking-1' }], error: null }, // re-count winner
        { data: INSERTED_BOOKING, error: null } // final fetch (NO initial charge)
      );

      await createBooking({
        requesterId: 'cashier-1',
        input: {
          ...BASE_INPUT,
          customer_id: CUSTOMER_ID,
          service_category: 'Daycare',
          items: [{ service_id: 'service-daycare' }],
          discount_id: 'discount-1',
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({ payment_status: 'Fully Paid' });
      expect((insert?.payload as { paid_at?: string }).paid_at).toBeTruthy();
      expect(
        recordedWrites.some((write) => write.table === 'transactions')
      ).toBe(false);
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
            discount_id: 'discount-1',
          },
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(getDiscountById).not.toHaveBeenCalled();
    });

    it('applies a promo regardless of role, capped by promo_cap_configuration', async () => {
      vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
      vi.mocked(getPromoById).mockResolvedValue(ALL_SERVICES_PROMO);
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null); // a customer, not staff
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        // Discounts/promos are now resolved BEFORE the down payment
        // (advisor: "discounts and promos apply before downpayment is
        // calculated"), so the promo cap lookup comes first.
        { data: { cap_type: 'flat', cap_value: 1000 }, error: null }, // promo_cap_configuration (branch row)
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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
        { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
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

  // Custom change (P-1 roadmap item): "Add a 'requires downpayment'
  // checkbox (with a specified amount) when creating a service or package -
  // broader than the existing branch-level Hotel downpayment percentage."
  // Follow-up redesign: downpayment is no longer a per-catalog-item flag
  // (services.requires_downpayment/downpayment_amount/downpayment_type,
  // summed per selected item and forcing a flagged item to be booked alone)
  // but a single per-transaction policy_configurations config
  // (downpayment_enabled/downpayment_type/downpayment_amount), resolved via
  // resolveDownpaymentPolicy and applied once against the whole booking's
  // totalPrice - see staffPicker.service.ts.
  describe('generic downpayment (custom change)', () => {
    const FLAT_DOWNPAYMENT_POLICY = {
      ...DEFAULT_POLICY,
      downpayment_enabled: true,
      downpayment_type: 'Flat',
      downpayment_amount: 150,
    };

    it('snapshots downpayment_required/downpayment_amount from the resolved per-transaction policy, regardless of which service was picked (this is Grooming, not Hotel - downpayment is no longer category- or catalog-item-restricted at all)', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [FLAT_DOWNPAYMENT_POLICY], error: null }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        // NOTE: no post-insert re-count here - down-payment slot gate: an
        // unpaid customer down-payment booking is a pencil booking, so it
        // skips confirmCapacityAfterInsert (it holds no slot to race for).
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: BASE_INPUT,
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        total_price: 350, // still the S/SC tier price - unaffected
        downpayment_required: true,
        downpayment_amount: 150, // the flat per-transaction amount, not derived from any item
      });
    });

    it('scheme "downpayment" asks create_initial_booking_charge for two charges (down payment + remaining balance)', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [FLAT_DOWNPAYMENT_POLICY], error: null }, // resolveEffectivePolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        // pencil booking - skips the post-insert re-count
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: { ...BASE_INPUT, payment_scheme: 'downpayment' },
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_initial_booking_charge',
        {
          p_booking_id: 'booking-1',
          p_scheme: 'downpayment',
          p_net_total: 350,
          p_downpayment_amount: 150,
        }
      );
    });

    it('a Percentage-type policy computes downpayment_amount as a percentage of the whole booking total_price (2-item booking), not any single item', async () => {
      vi.mocked(getServiceById).mockImplementation(async (serviceId: string) =>
        serviceId === 'service-flat-groom'
          ? FLAT_GROOMING_SERVICE
          : GROOMING_SERVICE
      );
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        {
          data: [
            {
              ...DEFAULT_POLICY,
              downpayment_enabled: true,
              downpayment_type: 'Percentage',
              downpayment_amount: 20,
            },
          ],
          error: null,
        }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        // pencil booking (unpaid customer down payment) - skips the re-count
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          items: [
            { service_id: 'service-groom' },
            { service_id: 'service-flat-groom' },
          ],
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        total_price: 450, // 350 (tiered) + 100 (flat) - the whole transaction
        downpayment_required: true,
        downpayment_amount: 90, // 20% of 450, not 20% of either item alone (70 or 20)
      });
    });

    it('downpayment_enabled: false leaves downpayment_required false and downpayment_amount null', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null },
        {
          data: [{ ...DEFAULT_POLICY, downpayment_enabled: false }],
          error: null,
        }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [{ id: 'booking-1' }], error: null },
        { data: INSERTED_BOOKING, error: null }
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: BASE_INPUT,
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        downpayment_required: false,
        downpayment_amount: null,
      });
    });

    it('falls back to DOCUMENTED_DEFAULTS (downpayment on at 50%) when no policy_configurations row exists at all', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null },
        { data: [], error: null }, // resolveDownpaymentPolicy - no rows, falls back to DOCUMENTED_DEFAULTS
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null },
        { data: null, error: null },
        { data: null, error: null },
        // pencil booking (downpayment required, unpaid) - skips the re-count
        { data: INSERTED_BOOKING, error: null }
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        // DOCUMENTED_DEFAULTS enforces a 3-day notice, so this one path
        // needs a genuinely-future slot (the rest use a fixed past date
        // with enforcement off via DEFAULT_POLICY).
        input: {
          ...BASE_INPUT,
          scheduled_start: new Date(Date.now() + 30 * 864e5).toISOString(),
          scheduled_end: new Date(Date.now() + 30 * 864e5 + 36e5).toISOString(),
        },
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        downpayment_required: true,
        downpayment_amount: 175, // 50% of the 350 net total
      });
    });

    it('a multi-item booking succeeds normally while downpayment is enabled - it is never rejected for combining items (the old "must be booked on its own" per-item rule no longer exists)', async () => {
      vi.mocked(getServiceById).mockImplementation(async (serviceId: string) =>
        serviceId === 'service-flat-groom'
          ? FLAT_GROOMING_SERVICE
          : GROOMING_SERVICE
      );
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [FLAT_DOWNPAYMENT_POLICY], error: null }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        // pencil booking (unpaid customer down payment) - skips the re-count
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      const booking = await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          items: [
            { service_id: 'service-groom' },
            { service_id: 'service-flat-groom' },
          ],
        },
      });

      expect(booking.id).toBe('booking-1');
      expect(supabase.rpc).toHaveBeenCalled();

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        total_price: 450,
        downpayment_required: true,
      });
    });

    it('a downpayment-required customer booking is created Pending with a downpayment_due_at, and holds no slot until it pays (pencil booking)', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null },
        { data: [FLAT_DOWNPAYMENT_POLICY], error: null }, // resolveDownpaymentPolicy
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null },
        { data: null, error: null },
        { data: null, error: null },
        // NOTE: no post-insert re-count - pencil booking skips it
        { data: INSERTED_BOOKING, error: null }
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: BASE_INPUT,
      });

      const insert = recordedWrites.find(
        (write) => write.table === 'bookings' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject({
        downpayment_required: true,
        payment_confirmed: false,
        payment_status: 'Pending', // same as the column default - gates the queue
      });
      // The auto-cancel deadline is stamped for the unpaid pencil booking.
      const payload = insert?.payload as Record<string, unknown>;
      expect(payload.downpayment_due_at).toEqual(expect.any(String));
    });
  });

  describe('minimum-notice lead time', () => {
    // The NEW-booking floor is its own knob now (booking_notice_period_days);
    // notice_period_days stays the reschedule/cancel notice. See
    // reschedule.service.spec.ts for that side.
    const ENFORCED_POLICY = {
      ...DEFAULT_POLICY,
      booking_notice_period_days: 3,
    };
    const BRANCH_TZ = { data: { timezone: 'Asia/Manila' }, error: null };
    const soonIso = (days: number) =>
      new Date(Date.now() + days * 864e5).toISOString();

    it('rejects an Online booking whose slot is inside the notice window with a 422', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [ENFORCED_POLICY], error: null }, // effective policy (notice + downpayment)
        BRANCH_TZ // assertMeetsBookingLeadTime branch timezone lookup
      );

      await expect(
        createBooking({
          requesterId: CUSTOMER_ID,
          input: {
            ...BASE_INPUT,
            scheduled_start: soonIso(1),
            scheduled_end: soonIso(1.05),
          },
        })
      ).rejects.toMatchObject({ statusCode: 422 });

      expect(
        recordedWrites.find((write) => write.table === 'bookings')
      ).toBeUndefined();
    });

    it('accepts an Online booking whose slot clears the notice window', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [ENFORCED_POLICY], error: null }, // effective policy
        BRANCH_TZ, // assertMeetsBookingLeadTime branch timezone lookup
        { data: [ENFORCED_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          scheduled_start: soonIso(10),
          scheduled_end: soonIso(10.05),
        },
      });

      expect(
        recordedWrites.find(
          (write) => write.table === 'bookings' && write.method === 'insert'
        )
      ).toBeDefined();
    });

    it('accepts an Online booking for tomorrow at the default floor (0)', async () => {
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        { data: [DEFAULT_POLICY], error: null }, // booking_notice_period_days: 0 - no branch tz lookup
        { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: CUSTOMER_ID,
        input: {
          ...BASE_INPUT,
          scheduled_start: soonIso(1),
          scheduled_end: soonIso(1.05),
        },
      });

      expect(
        recordedWrites.find(
          (write) => write.table === 'bookings' && write.method === 'insert'
        )
      ).toBeDefined();
    });

    it('a Walk-in booking is exempt from the notice window', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
      vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
      queueFromResults(
        { data: PET, error: null }, // pet ownership
        // no notice/downpayment policy query - walk-in skips the whole block
        { data: [ENFORCED_POLICY], error: null }, // staff picker toggle
        { data: INSERTED_BOOKING, error: null }, // bookings insert
        { data: null, error: null }, // booking_items insert
        { data: null, error: null }, // staff_picker_preferences insert
        { data: [{ id: 'booking-1' }], error: null }, // post-insert re-count: winner
        { data: INSERTED_BOOKING, error: null } // final fetch
      );

      await createBooking({
        requesterId: 'recept-1',
        input: {
          ...BASE_INPUT,
          customer_id: CUSTOMER_ID,
          booking_source: 'Walk-in',
          scheduled_start: soonIso(0),
          scheduled_end: soonIso(0.05),
        },
      });

      expect(
        recordedWrites.find(
          (write) => write.table === 'bookings' && write.method === 'insert'
        )
      ).toBeDefined();
    });
  });

  // Custom change (Fix pricing matrix, P-1): "Coat and weight doesn't seem
  // to influence individual service" (fixed by making the matrix opt-in per
  // service/package via use_pricing_matrix) and "Cat has no weight class or
  // coat type, fixed price" (fixed by always using the flat base_price for
  // a Cat pet, regardless of the matrix flag).
  describe('pricing matrix (custom change)', () => {
    const PRICING_CONFIG = {
      id: 'pricing-config-1',
      size_s_rule_type: 'multiplier',
      size_s_rule_value: 1.0,
      size_m_rule_type: 'multiplier',
      size_m_rule_value: 1.1,
      size_l_rule_type: 'multiplier',
      size_l_rule_value: 1.25,
      size_xl_rule_type: 'multiplier',
      size_xl_rule_value: 1.5,
      coat_long_rule_type: 'flat',
      coat_long_rule_value: 0,
      updated_by_staff_id: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('resolveServicePrice: a matrix-enabled Grooming service returns the matching tier for a Dog', () => {
      const price = resolveServicePrice(
        {
          category: 'Grooming',
          base_price: 300,
          use_pricing_matrix: true,
          service_pricing_tiers: [
            { weight_class: 'S', coat_type: 'SC', price: 350 },
          ],
        },
        PET as never
      );

      expect(price).toBe(350);
    });

    it('resolveServicePrice: a non-matrix Grooming service ignores a matching tier (individual add-on services)', () => {
      const price = resolveServicePrice(
        {
          category: 'Grooming',
          base_price: 100,
          use_pricing_matrix: false,
          service_pricing_tiers: [
            { weight_class: 'S', coat_type: 'SC', price: 999 },
          ],
        },
        PET as never
      );

      expect(price).toBe(100);
    });

    it('resolveServicePrice: a Cat pet always gets the flat base_price, even for a matrix-enabled service', () => {
      const price = resolveServicePrice(
        {
          category: 'Grooming',
          base_price: 300,
          use_pricing_matrix: true,
          service_pricing_tiers: [
            { weight_class: 'S', coat_type: 'SC', price: 350 },
          ],
        },
        CAT_PET as never
      );

      expect(price).toBe(300);
    });

    it('resolvePackagePrice: a non-matrix package uses the flat bundled_price', async () => {
      const price = await resolvePackagePrice(
        { bundled_price: 999, use_pricing_matrix: false },
        PET as never
      );

      expect(price).toBe(999);
    });

    it("resolvePackagePrice: a matrix-enabled package derives from its own bundled_price via the matrix, independent of any member's own flag (custom change: package pricing redesign)", async () => {
      queueFromResults({ data: PRICING_CONFIG, error: null }); // getPricingConfiguration

      const price = await resolvePackagePrice(
        { bundled_price: 300, use_pricing_matrix: true },
        { ...PET, weight_class: 'L', coat_type: 'SC' } as never // L multiplier 1.25
      );

      // 300 * 1.25 = 375
      expect(price).toBe(375);
    });

    it('resolvePackagePrice: a Cat pet always gets the flat bundled_price even when matrix-enabled', async () => {
      const price = await resolvePackagePrice(
        { bundled_price: 300, use_pricing_matrix: true },
        CAT_PET as never
      );

      expect(price).toBe(300);
    });
  });
});

describe('listPetBookingConflicts (duplicate-booking prevention, custom change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  it("returns one conflict per pet - the earliest-scheduled unresolved booking, any category - from the customer's own Pending/In Progress bookings", async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    queueFromResults({
      // Already ordered by scheduled_start ascending, matching the real
      // query's .order() - the service keeps only the first (earliest) row
      // per pet_id.
      data: [
        {
          id: 'booking-1',
          pet_id: 'pet-1',
          service_category: 'Grooming',
          scheduled_start: '2026-08-10T00:00:00.000Z',
          status: 'Pending',
          payment_status: 'Pending',
        },
        {
          id: 'booking-2',
          pet_id: 'pet-1',
          service_category: 'Hotel',
          scheduled_start: '2026-08-20T00:00:00.000Z',
          status: 'In Progress',
          payment_status: 'Fully Paid',
        },
        {
          id: 'booking-3',
          pet_id: 'pet-2',
          service_category: 'Veterinary',
          scheduled_start: '2026-08-11T00:00:00.000Z',
          status: 'Pending',
          payment_status: 'Pending',
        },
      ],
      error: null,
    });

    const conflicts = await listPetBookingConflicts({
      requesterId: CUSTOMER_ID,
      customerId: CUSTOMER_ID,
    });

    expect(conflicts).toEqual([
      {
        pet_id: 'pet-1',
        booking_id: 'booking-1',
        service_category: 'Grooming',
        scheduled_start: '2026-08-10T00:00:00.000Z',
      },
      {
        pet_id: 'pet-2',
        booking_id: 'booking-3',
        service_category: 'Veterinary',
        scheduled_start: '2026-08-11T00:00:00.000Z',
      },
    ]);
  });

  it('flags a Completed booking that is still Unpaid as a conflict (the pet stays blocked until it is paid, even though the service already happened)', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    queueFromResults({
      data: [
        {
          id: 'booking-4',
          pet_id: 'pet-4',
          service_category: 'Hotel',
          scheduled_start: '2026-08-05T00:00:00.000Z',
          status: 'Completed',
          payment_status: 'Pending',
        },
      ],
      error: null,
    });

    const conflicts = await listPetBookingConflicts({
      requesterId: CUSTOMER_ID,
      customerId: CUSTOMER_ID,
    });

    expect(conflicts).toEqual([
      {
        pet_id: 'pet-4',
        booking_id: 'booking-4',
        service_category: 'Hotel',
        scheduled_start: '2026-08-05T00:00:00.000Z',
      },
    ]);
  });

  it('does not flag a Completed booking once it has been paid (in full or in advance)', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    queueFromResults({
      data: [
        {
          id: 'booking-5',
          pet_id: 'pet-5',
          service_category: 'Grooming',
          scheduled_start: '2026-08-05T00:00:00.000Z',
          status: 'Completed',
          payment_status: 'Fully Paid',
        },
        {
          id: 'booking-6',
          pet_id: 'pet-6',
          service_category: 'Daycare',
          scheduled_start: '2026-08-06T00:00:00.000Z',
          status: 'Completed',
          payment_status: 'Partially Paid',
        },
      ],
      error: null,
    });

    const conflicts = await listPetBookingConflicts({
      requesterId: CUSTOMER_ID,
      customerId: CUSTOMER_ID,
    });

    expect(conflicts).toEqual([]);
  });

  it('returns an empty list when nothing is unresolved', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    queueFromResults({ data: [], error: null });

    const conflicts = await listPetBookingConflicts({
      requesterId: CUSTOMER_ID,
      customerId: CUSTOMER_ID,
    });

    expect(conflicts).toEqual([]);
  });

  it('allows a staff requester to query any customer', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
    queueFromResults({
      data: [
        {
          id: 'booking-9',
          pet_id: 'pet-9',
          service_category: 'Daycare',
          scheduled_start: '2026-08-12T00:00:00.000Z',
          status: 'Pending',
          payment_status: 'Pending',
        },
      ],
      error: null,
    });

    const conflicts = await listPetBookingConflicts({
      requesterId: 'staff-1',
      customerId: CUSTOMER_ID,
    });

    expect(conflicts).toEqual([
      {
        pet_id: 'pet-9',
        booking_id: 'booking-9',
        service_category: 'Daycare',
        scheduled_start: '2026-08-12T00:00:00.000Z',
      },
    ]);
  });

  it('rejects a non-staff requester querying a different customer', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);

    await expect(
      listPetBookingConflicts({
        requesterId: 'someone-else',
        customerId: CUSTOMER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
