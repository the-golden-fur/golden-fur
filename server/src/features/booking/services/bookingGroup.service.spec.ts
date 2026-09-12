import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingGroup } from './bookingGroup.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';
import { getDiscountById } from '../../discounts/services/discounts.service.ts';
import { getFixedPrice } from '../../maintenance/services/petTypePriceOverrides.service.ts';
import {
  sendBookingConfirmedNotification,
  sendCombinedBookingGroupConfirmedEmail,
} from './bookingNotifications.service.ts';

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

// Pet Types admin CRUD + fixed-price override (20260912191/20260912192) -
// mirrors booking.service.spec.ts's own rationale: resolveBookingItems now
// calls this once per sub-booking regardless of path, defaulted to "no
// override" in the outer beforeEach so none of the sequential mock queues
// below need to change to account for it.
vi.mock('../../maintenance/services/petTypePriceOverrides.service.ts', () => ({
  getFixedPrice: vi.fn(),
}));

// Mirrors booking.service.spec.ts's own rationale - the free-package-award
// and confirmation notifications aren't the point of these tests (none of
// the scenarios below are Hotel bookings, and none hit
// isConfirmedAtCreation), so both notification modules are mocked wholesale
// to keep the sequential Supabase mock queue below to just the calls this
// spec actually cares about.
vi.mock('./bookingNotifications.service.ts', () => ({
  sendBookingConfirmedNotification: vi.fn().mockResolvedValue(undefined),
  sendCombinedBookingGroupConfirmedEmail: vi.fn().mockResolvedValue(undefined),
  sendStaffAssignedNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn().mockResolvedValue(null),
  notifyStaffRoleAtBranch: vi.fn().mockResolvedValue(undefined),
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

// Same out-of-band service_types interception as booking.service.spec.ts -
// Grooming/Veterinary have the Staff Picker enabled by default seed data,
// every other category (Hotel/Daycare/Assessment) does not.
function serviceTypeStaffConfigFor(category: string) {
  const enabled = category === 'Grooming' || category === 'Veterinary';
  return {
    data: {
      staff_picker_enabled: enabled,
      eligible_staff_roles: enabled
        ? [category === 'Grooming' ? 'Groomer' : 'Veterinarian']
        : [],
    },
    error: null,
  };
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const isServiceTypes = table === 'service_types';
    const result = isServiceTypes
      ? null
      : (queue.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    let requestedKey: string | undefined;

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
      builder[method] = vi.fn((column?: string, value?: string) => {
        if (isServiceTypes && column === 'key') requestedKey = value;
        return builder;
      });
    }

    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() =>
      Promise.resolve(
        isServiceTypes ? serviceTypeStaffConfigFor(requestedKey ?? '') : result
      )
    );
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) =>
      resolve(
        isServiceTypes ? serviceTypeStaffConfigFor(requestedKey ?? '') : result
      );

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
const PET_B = {
  id: 'pet-2',
  customer_id: CUSTOMER_ID,
  pet_type: 'Dog',
  weight_class: 'S',
  coat_type: 'SC',
};

const DEFAULT_POLICY = {
  id: 'policy-default',
  branch_id: null,
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: false,
  booking_notice_period_days: 0,
  downpayment_enabled: false,
  downpayment_hold_hours: 24,
  downpayment_type: null,
  downpayment_amount: null,
  booking_group_email_mode: 'combined',
  care_log_task_email_enabled: false,
  care_log_daily_report_enabled: true,
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

const DAYCARE_SERVICE = {
  id: 'service-daycare',
  category: 'Daycare',
  name: 'Daycare Session',
  base_price: 100,
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

const BASE_START_MS = Date.now() + 7 * 864e5;
const hours = (n: number) => n * 3_600_000;
const isoAt = (offsetMs: number) =>
  new Date(BASE_START_MS + offsetMs).toISOString();

function bookingRow(overrides: Record<string, unknown>) {
  return {
    id: 'booking-x',
    customer_id: CUSTOMER_ID,
    pet_id: PET.id,
    branch_id: 'branch-1',
    service_category: 'Grooming',
    booking_source: 'Online',
    assigned_staff_id: null,
    status: 'Pending',
    scheduled_start: isoAt(0),
    scheduled_end: isoAt(hours(1)),
    total_price: 0,
    payment_status: 'Pending',
    booking_group_id: 'group-1',
    reschedule_count: 0,
    ...overrides,
  };
}

function groupRow(overrides: Record<string, unknown>) {
  return {
    id: 'group-1',
    customer_id: CUSTOMER_ID,
    branch_id: 'branch-1',
    created_by_staff_id: null,
    selected_discount_id: null,
    selected_promo_id: null,
    discount_amount: 0,
    promo_amount: 0,
    net_total: 0,
    downpayment_amount: null,
    downpayment_required: false,
    downpayment_due_at: null,
    payment_status: 'Pending',
    paid_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('bookingGroup.service (multi-booking checkout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [GROOMER],
      error: null,
    } as never);
    vi.mocked(getFixedPrice).mockResolvedValue(null);
  });

  it('(a) a 2-booking group with different pets/categories computes combined discount/promo/downpayment against the combined total', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
    vi.mocked(getServiceById).mockImplementation(
      async (serviceId: string) =>
        (serviceId === 'service-daycare'
          ? DAYCARE_SERVICE
          : GROOMING_SERVICE) as never
    );
    vi.mocked(getDiscountById).mockResolvedValue({
      id: 'discount-1',
      name: 'Daycare Flat 50',
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
    } as never);
    vi.mocked(getPromoById).mockResolvedValue({
      id: 'promo-1',
      name: '10% off everything',
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
    } as never);

    const FLAT_DOWNPAYMENT_POLICY = {
      ...DEFAULT_POLICY,
      downpayment_enabled: true,
      downpayment_type: 'Flat',
      downpayment_amount: 100,
    };

    queueFromResults(
      { data: [FLAT_DOWNPAYMENT_POLICY], error: null }, // resolveEffectivePolicy (shared, once)
      { data: PET, error: null }, // sub1 pet ownership
      { data: [], error: null }, // sub1 Daycare pre-insert capacity check
      { data: PET_B, error: null }, // sub2 pet ownership
      { data: { cap_type: 'flat', cap_value: 1000 }, error: null }, // promo cap
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({
          id: 'booking-a1',
          service_category: 'Daycare',
          total_price: 100,
        }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      {
        data: bookingRow({
          id: 'booking-a2',
          service_category: 'Grooming',
          assigned_staff_id: 'groomer-1',
          total_price: 350,
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      { data: null, error: null }, // sub2 staff_picker_preferences insert (no_preference)
      { data: bookingRow({ id: 'booking-a1' }), error: null }, // final fetch sub1
      { data: bookingRow({ id: 'booking-a2' }), error: null } // final fetch sub2
    );

    const result = await createBookingGroup({
      requesterId: 'cashier-1',
      input: {
        customer_id: CUSTOMER_ID,
        branch_id: 'branch-1',
        discount_id: 'discount-1',
        promo_id: 'promo-1',
        bookings: [
          {
            pet_id: PET.id,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
          },
          {
            pet_id: PET_B.id,
            service_category: 'Grooming',
            items: [{ service_id: 'service-groom' }],
            scheduled_start: isoAt(hours(2)),
            scheduled_end: isoAt(hours(3)),
          },
        ],
      } as never,
    });

    expect(result.bookings).toHaveLength(2);

    const groupInsert = recordedWrites.find(
      (write) => write.table === 'booking_groups' && write.method === 'insert'
    );
    // 450 combined - 50 flat discount - 45 (10% of 450) promo = 355 net.
    expect(groupInsert?.payload).toMatchObject({
      selected_discount_id: 'discount-1',
      selected_promo_id: 'promo-1',
      discount_amount: 50,
      promo_amount: 45,
      net_total: 355,
      downpayment_required: true,
      downpayment_amount: 100, // flat 100, capped by (min against) the net total
    });

    const bookingInserts = recordedWrites.filter(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );
    expect(bookingInserts).toHaveLength(2);
    for (const write of bookingInserts) {
      expect(write.payload).toMatchObject({
        booking_group_id: 'group-1',
        selected_discount_id: null,
        selected_promo_id: null,
        discount_amount: 0,
        promo_amount: 0,
        downpayment_amount: null,
        downpayment_required: false,
        downpayment_due_at: null,
      });
    }
    expect(bookingInserts[0].payload).toMatchObject({ total_price: 100 });
    expect(bookingInserts[1].payload).toMatchObject({
      total_price: 350,
      assigned_staff_id: 'groomer-1',
    });
  });

  it('(b) the in-request capacity guard rejects two sub-bookings competing for the same staff + overlapping window', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);

    queueFromResults(
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      { data: PET_B, error: null } // sub2 pet ownership
    );

    await expect(
      createBookingGroup({
        requesterId: CUSTOMER_ID,
        input: {
          branch_id: 'branch-1',
          bookings: [
            {
              pet_id: PET.id,
              service_category: 'Grooming',
              items: [{ service_id: 'service-groom' }],
              scheduled_start: isoAt(0),
              scheduled_end: isoAt(hours(1)),
              staff_preference: { type: 'specific', staff_id: 'groomer-1' },
            },
            {
              pet_id: PET_B.id,
              service_category: 'Grooming',
              items: [{ service_id: 'service-groom' }],
              // Same window, same requested staff member - competes with sub1.
              scheduled_start: isoAt(0),
              scheduled_end: isoAt(hours(1)),
              staff_preference: { type: 'specific', staff_id: 'groomer-1' },
            },
          ],
        } as never,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('competing for the same staff slot'),
    });

    // Rejected before anything was ever inserted for this request.
    expect(
      recordedWrites.some(
        (write) => write.table === 'bookings' && write.method === 'insert'
      )
    ).toBe(false);
    expect(
      recordedWrites.some(
        (write) => write.table === 'booking_groups' && write.method === 'insert'
      )
    ).toBe(false);
  });

  it('(b2) the in-request guard rejects the SAME pet double-booked at an overlapping time across two different categories, Online only', async () => {
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);

    queueFromResults(
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      { data: [], error: null }, // sub1 Daycare pre-insert capacity check
      { data: PET, error: null } // sub2 pet ownership (same pet as sub1)
    );

    await expect(
      createBookingGroup({
        requesterId: CUSTOMER_ID,
        input: {
          branch_id: 'branch-1',
          bookings: [
            {
              pet_id: PET.id,
              service_category: 'Daycare',
              items: [{ service_id: 'service-daycare' }],
              scheduled_start: isoAt(0),
              scheduled_end: isoAt(hours(1)),
            },
            {
              // Same pet, overlapping window, different category - a real
              // pet can't be in Daycare and Grooming at once.
              pet_id: PET.id,
              service_category: 'Daycare',
              items: [{ service_id: 'service-daycare' }],
              scheduled_start: isoAt(hours(0.5)),
              scheduled_end: isoAt(hours(1.5)),
            },
          ],
        } as never,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('already has another booking'),
    });

    // Rejected before anything was ever inserted for this request.
    expect(
      recordedWrites.some(
        (write) => write.table === 'bookings' && write.method === 'insert'
      )
    ).toBe(false);
    expect(
      recordedWrites.some(
        (write) => write.table === 'booking_groups' && write.method === 'insert'
      )
    ).toBe(false);
  });

  it('(b3) the SAME pet double-booked at an overlapping time is allowed when one of the sub-bookings is Walk-in', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Receptionist');
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);

    queueFromResults(
      { data: PET, error: null }, // sub1 pet ownership (Walk-in - no policy fetch, no lead-time check)
      { data: [], error: null }, // sub1 Daycare pre-insert capacity check
      { data: PET, error: null }, // sub2 pet ownership (same pet)
      { data: [], error: null }, // sub2 Daycare pre-insert capacity check
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({
          id: 'booking-wa1',
          service_category: 'Daycare',
          booking_source: 'Walk-in',
          status: 'In Progress',
        }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      {
        data: bookingRow({
          id: 'booking-wa2',
          service_category: 'Daycare',
          booking_source: 'Walk-in',
          status: 'In Progress',
          scheduled_start: isoAt(hours(0.5)),
          scheduled_end: isoAt(hours(1.5)),
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      // holdsSlot is true for an all-Walk-in group (no downpayment policy was
      // ever fetched, so downpaymentRequired stays false) - both bookings go
      // through the post-insert race re-check (Daycare: listOverlappingActiveBookings).
      { data: [{ id: 'booking-wa1' }], error: null }, // confirmCapacityAfterInsert sub1 - wins
      { data: [{ id: 'booking-wa2' }], error: null }, // confirmCapacityAfterInsert sub2 - wins
      { data: [DEFAULT_POLICY], error: null }, // step 11 resolveEffectivePolicy (email mode - all-Walk-in group)
      { data: bookingRow({ id: 'booking-wa1' }), error: null }, // final fetch sub1
      { data: bookingRow({ id: 'booking-wa2' }), error: null } // final fetch sub2
    );

    const result = await createBookingGroup({
      requesterId: 'receptionist-1',
      input: {
        customer_id: CUSTOMER_ID,
        branch_id: 'branch-1',
        bookings: [
          {
            pet_id: PET.id,
            service_category: 'Daycare',
            booking_source: 'Walk-in',
            items: [{ service_id: 'service-daycare' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
          },
          {
            pet_id: PET.id,
            service_category: 'Daycare',
            booking_source: 'Walk-in',
            items: [{ service_id: 'service-daycare' }],
            scheduled_start: isoAt(hours(0.5)),
            scheduled_end: isoAt(hours(1.5)),
          },
        ],
      } as never,
    });

    expect(result.bookings).toHaveLength(2);
  });

  it('(b4) two sub-bookings can share one staff member + window when max_concurrent_bookings_per_staff is raised to 2', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);

    const CAPACITY_2_POLICY = {
      ...DEFAULT_POLICY,
      max_concurrent_bookings_per_staff: 2,
    };

    queueFromResults(
      { data: [CAPACITY_2_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      { data: PET_B, error: null }, // sub2 pet ownership
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({ id: 'booking-b1', assigned_staff_id: 'groomer-1' }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      { data: null, error: null }, // sub1 staff_picker_preferences insert
      {
        data: bookingRow({ id: 'booking-b2', assigned_staff_id: 'groomer-1' }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      { data: null, error: null }, // sub2 staff_picker_preferences insert
      { data: [{ id: 'booking-b1' }], error: null }, // confirmCapacityAfterInsert sub1
      {
        data: [{ id: 'booking-b1' }, { id: 'booking-b2' }],
        error: null,
      }, // confirmCapacityAfterInsert sub2 - still within capacity 2
      { data: bookingRow({ id: 'booking-b1' }), error: null }, // final fetch sub1
      { data: bookingRow({ id: 'booking-b2' }), error: null } // final fetch sub2
    );

    const result = await createBookingGroup({
      requesterId: CUSTOMER_ID,
      input: {
        branch_id: 'branch-1',
        bookings: [
          {
            pet_id: PET.id,
            service_category: 'Grooming',
            items: [{ service_id: 'service-groom' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
            staff_preference: { type: 'specific', staff_id: 'groomer-1' },
          },
          {
            pet_id: PET_B.id,
            service_category: 'Grooming',
            items: [{ service_id: 'service-groom' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
            staff_preference: { type: 'specific', staff_id: 'groomer-1' },
          },
        ],
      } as never,
    });

    expect(result.bookings).toHaveLength(2);
    const bookingInserts = recordedWrites.filter(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );
    expect(bookingInserts).toHaveLength(2);
    for (const write of bookingInserts) {
      expect(write.payload).toMatchObject({ assigned_staff_id: 'groomer-1' });
    }
  });

  it('(c) one sub-booking losing the post-insert capacity race rolls back the entire group', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);

    queueFromResults(
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      { data: PET_B, error: null }, // sub2 pet ownership
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({ id: 'booking-c1', assigned_staff_id: 'groomer-1' }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      { data: null, error: null }, // sub1 staff_picker_preferences insert
      {
        data: bookingRow({
          id: 'booking-c2',
          assigned_staff_id: 'groomer-2',
          scheduled_start: isoAt(hours(2)),
          scheduled_end: isoAt(hours(3)),
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      { data: null, error: null }, // sub2 staff_picker_preferences insert
      { data: [{ id: 'booking-c1' }], error: null }, // confirmCapacityAfterInsert sub1 - wins
      {
        data: [{ id: 'booking-other' }, { id: 'booking-c2' }],
        error: null,
      } // confirmCapacityAfterInsert sub2 - loses the race
    );

    await expect(
      createBookingGroup({
        requesterId: CUSTOMER_ID,
        input: {
          branch_id: 'branch-1',
          bookings: [
            {
              pet_id: PET.id,
              service_category: 'Grooming',
              items: [{ service_id: 'service-groom' }],
              scheduled_start: isoAt(0),
              scheduled_end: isoAt(hours(1)),
              staff_preference: { type: 'specific', staff_id: 'groomer-1' },
            },
            {
              pet_id: PET_B.id,
              service_category: 'Grooming',
              items: [{ service_id: 'service-groom' }],
              scheduled_start: isoAt(hours(2)),
              scheduled_end: isoAt(hours(3)),
              staff_preference: { type: 'specific', staff_id: 'groomer-2' },
            },
          ],
        } as never,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Capacity was taken'),
    });

    // Both member bookings, not just the loser, were rolled back.
    const bookingsDelete = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'delete'
    );
    expect(bookingsDelete).toBeDefined();
    expect(
      recordedWrites.some(
        (write) => write.table === 'booking_groups' && write.method === 'delete'
      )
    ).toBe(true);
  });

  it('(d) a group where every sub-booking is Veterinary never calls the group charge RPC', async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);

    queueFromResults(
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // sub1 #53 guard
      { data: PET_B, error: null }, // sub2 pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // sub2 #53 guard
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({
          id: 'booking-d1',
          service_category: 'Veterinary',
          branch_id: 'branch-makati',
          assigned_staff_id: 'groomer-1',
        }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      { data: null, error: null }, // sub1 staff_picker_preferences insert
      {
        data: bookingRow({
          id: 'booking-d2',
          service_category: 'Veterinary',
          branch_id: 'branch-makati',
          assigned_staff_id: 'groomer-1',
          scheduled_start: isoAt(hours(3)),
          scheduled_end: isoAt(hours(4)),
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      { data: null, error: null }, // sub2 staff_picker_preferences insert
      { data: [{ id: 'booking-d1' }], error: null }, // confirmCapacityAfterInsert sub1
      { data: [{ id: 'booking-d2' }], error: null }, // confirmCapacityAfterInsert sub2
      {
        data: bookingRow({ id: 'booking-d1', service_category: 'Veterinary' }),
        error: null,
      }, // final fetch sub1
      {
        data: bookingRow({ id: 'booking-d2', service_category: 'Veterinary' }),
        error: null,
      } // final fetch sub2
    );

    await createBookingGroup({
      requesterId: CUSTOMER_ID,
      input: {
        branch_id: 'branch-makati',
        bookings: [
          {
            pet_id: PET.id,
            service_category: 'Veterinary',
            items: [{ service_id: 'service-vet' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
          },
          {
            pet_id: PET_B.id,
            service_category: 'Veterinary',
            items: [{ service_id: 'service-vet' }],
            scheduled_start: isoAt(hours(3)),
            scheduled_end: isoAt(hours(4)),
          },
        ],
      } as never,
    });

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'create_initial_booking_group_charge',
      expect.anything()
    );
  });

  // --- booking_group_email_mode (Brevo quota) -----------------------------
  function queueVetGroupConfirmedAtCreation(policy: unknown) {
    queueFromResults(
      { data: [policy], error: null }, // resolveEffectivePolicy (shared, once)
      { data: PET, error: null }, // sub1 pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // sub1 #53 guard
      { data: PET_B, error: null }, // sub2 pet ownership
      {
        data: { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        error: null,
      }, // sub2 #53 guard
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({
          id: 'booking-g1',
          service_category: 'Veterinary',
          branch_id: 'branch-makati',
        }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      { data: null, error: null }, // sub1 staff_picker_preferences insert
      {
        data: bookingRow({
          id: 'booking-g2',
          service_category: 'Veterinary',
          branch_id: 'branch-makati',
          scheduled_start: isoAt(hours(3)),
          scheduled_end: isoAt(hours(4)),
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      { data: null, error: null }, // sub2 staff_picker_preferences insert
      { data: [{ id: 'booking-g1' }], error: null }, // confirmCapacityAfterInsert sub1
      { data: [{ id: 'booking-g2' }], error: null }, // confirmCapacityAfterInsert sub2
      {
        data: bookingRow({ id: 'booking-g1', service_category: 'Veterinary' }),
        error: null,
      }, // final fetch sub1
      {
        data: bookingRow({ id: 'booking-g2', service_category: 'Veterinary' }),
        error: null,
      } // final fetch sub2
    );
  }

  const vetGroupInput = {
    branch_id: 'branch-makati',
    bookings: [
      {
        pet_id: PET.id,
        service_category: 'Veterinary',
        items: [{ service_id: 'service-vet' }],
        scheduled_start: isoAt(0),
        scheduled_end: isoAt(hours(1)),
      },
      {
        pet_id: PET_B.id,
        service_category: 'Veterinary',
        items: [{ service_id: 'service-vet' }],
        scheduled_start: isoAt(hours(3)),
        scheduled_end: isoAt(hours(4)),
      },
    ],
  } as never;

  it("(f) 'combined' mode (default): one combined confirmation email, per-booking in-app rows", async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);
    queueVetGroupConfirmedAtCreation(DEFAULT_POLICY);

    await createBookingGroup({
      requesterId: CUSTOMER_ID,
      input: vetGroupInput,
    });

    expect(sendBookingConfirmedNotification).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(sendBookingConfirmedNotification).mock.calls) {
      expect(call[1]).toEqual({ skipEmail: true });
    }
    expect(sendCombinedBookingGroupConfirmedEmail).toHaveBeenCalledTimes(1);
    expect(sendCombinedBookingGroupConfirmedEmail).toHaveBeenCalledWith(
      CUSTOMER_ID,
      'branch-makati',
      expect.arrayContaining([
        expect.objectContaining({ id: 'booking-g1' }),
        expect.objectContaining({ id: 'booking-g2' }),
      ])
    );
  });

  it("(g) 'per_booking' mode: one email per booking, no combined email", async () => {
    vi.mocked(getServiceById).mockResolvedValue(VET_SERVICE);
    queueVetGroupConfirmedAtCreation({
      ...DEFAULT_POLICY,
      booking_group_email_mode: 'per_booking',
    });

    await createBookingGroup({
      requesterId: CUSTOMER_ID,
      input: vetGroupInput,
    });

    expect(sendBookingConfirmedNotification).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(sendBookingConfirmedNotification).mock.calls) {
      expect(call[1]).toEqual({ skipEmail: false });
    }
    expect(sendCombinedBookingGroupConfirmedEmail).not.toHaveBeenCalled();
  });

  it('(e) a fully-discounted group is born Fully Paid on every sub-booking and the group row', async () => {
    vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
    vi.mocked(getDiscountById).mockResolvedValue({
      id: 'discount-full',
      name: 'Full Daycare Waiver',
      discount_type: 'Percentage',
      value: 100,
      scope_type: 'category',
      scope_service_id: null,
      scope_package_id: null,
      scope_category: 'Daycare',
      is_active: true,
      discount_branch_availability: [
        {
          discount_id: 'discount-full',
          branch_id: 'branch-1',
          is_available: true,
        },
      ],
    } as never);

    queueFromResults(
      { data: [DEFAULT_POLICY], error: null }, // resolveEffectivePolicy
      { data: PET, error: null }, // sub1 pet ownership
      { data: [], error: null }, // sub1 Daycare pre-insert capacity check
      { data: PET_B, error: null }, // sub2 pet ownership
      { data: [], error: null }, // sub2 Daycare pre-insert capacity check
      { data: groupRow({}), error: null }, // booking_groups insert
      {
        data: bookingRow({
          id: 'booking-e1',
          service_category: 'Daycare',
          total_price: 100,
        }),
        error: null,
      }, // sub1 insert
      { data: null, error: null }, // sub1 items insert
      {
        data: bookingRow({
          id: 'booking-e2',
          pet_id: PET_B.id,
          service_category: 'Daycare',
          total_price: 100,
        }),
        error: null,
      }, // sub2 insert
      { data: null, error: null }, // sub2 items insert
      {
        data: [
          {
            id: 'booking-e1',
            pet_id: PET.id,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      }, // confirmCapacityAfterInsert sub1
      {
        data: [
          {
            id: 'booking-e1',
            pet_id: PET.id,
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'booking-e2',
            pet_id: PET_B.id,
            created_at: '2026-01-01T00:00:01Z',
          },
        ],
        error: null,
      }, // confirmCapacityAfterInsert sub2
      {
        data: bookingRow({
          id: 'booking-e1',
          service_category: 'Daycare',
          payment_status: 'Fully Paid',
        }),
        error: null,
      }, // final fetch sub1
      {
        data: bookingRow({
          id: 'booking-e2',
          service_category: 'Daycare',
          payment_status: 'Fully Paid',
        }),
        error: null,
      } // final fetch sub2
    );

    await createBookingGroup({
      requesterId: 'cashier-1',
      input: {
        customer_id: CUSTOMER_ID,
        branch_id: 'branch-1',
        discount_id: 'discount-full',
        bookings: [
          {
            pet_id: PET.id,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
          },
          {
            pet_id: PET_B.id,
            service_category: 'Daycare',
            items: [{ service_id: 'service-daycare' }],
            scheduled_start: isoAt(0),
            scheduled_end: isoAt(hours(1)),
          },
        ],
      } as never,
    });

    const groupInsert = recordedWrites.find(
      (write) => write.table === 'booking_groups' && write.method === 'insert'
    );
    expect(groupInsert?.payload).toMatchObject({
      net_total: 0,
      payment_status: 'Fully Paid',
    });
    expect((groupInsert?.payload as { paid_at?: string }).paid_at).toBeTruthy();

    const bookingInserts = recordedWrites.filter(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );
    expect(bookingInserts).toHaveLength(2);
    for (const write of bookingInserts) {
      expect(write.payload).toMatchObject({ payment_status: 'Fully Paid' });
      expect((write.payload as { paid_at?: string }).paid_at).toBeTruthy();
    }

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'create_initial_booking_group_charge',
      expect.anything()
    );
  });
});
