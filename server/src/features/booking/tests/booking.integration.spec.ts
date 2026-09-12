import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Issue #98: booking_confirmed dispatch is covered by its own unit tests
// (bookingNotifications.service.spec.ts) - mocked wholesale here so this
// integration test's HTTP surface doesn't need to account for its extra
// Supabase lookups in the sequential mock queue below.
vi.mock('../services/bookingNotifications.service.ts', () => ({
  sendBookingConfirmedNotification: vi.fn().mockResolvedValue(undefined),
  sendBookingRescheduledNotification: vi.fn().mockResolvedValue(undefined),
  sendBookingCancelledNotification: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Same queued-builder mock as maintenance.integration.spec.ts: one resolved
 * result per supabase.from(...) call, in call order, chainable on every
 * method the booking services use and thenable for bare awaits.
 */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
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
      'insert',
      'update',
      'upsert',
      'delete',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    builder.single = vi.fn(() => Promise.resolve(result));
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

function mockCaller(sub: string) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: sub } },
    error: null,
  } as never);
  vi.spyOn(jwt, 'decode').mockReturnValue({ sub } as never);
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const CUSTOMER_ID = 'cust-1';

const DEFAULT_POLICY = {
  id: 'policy-default',
  branch_id: null,
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  booking_notice_period_days: 0,
  downpayment_enabled: false,
  max_concurrent_bookings_per_staff: 1,
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:00Z',
};

const DAYCARE_SERVICE = {
  id: '33333333-3333-4333-a333-333333333333',
  category: 'Daycare',
  name: 'Daycare Session',
  base_price: 100,
  is_active: true,
  service_pricing_tiers: [],
  service_branch_availability: [],
};

const CREATE_PAYLOAD = {
  pet_id: '11111111-1111-4111-a111-111111111111',
  branch_id: '22222222-2222-4222-a222-222222222222',
  service_category: 'Daycare',
  items: [{ service_id: DAYCARE_SERVICE.id }],
  // Comfortably outside the seeded 3-day minimum-notice window so createBooking
  // accepts it; the notice floor itself is covered in booking.service.spec.
  scheduled_start: daysFromNow(30),
  scheduled_end: daysFromNow(30.05),
};

const PENDING_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  pet_id: CREATE_PAYLOAD.pet_id,
  branch_id: CREATE_PAYLOAD.branch_id,
  service_category: 'Daycare',
  status: 'Pending',
  scheduled_start: CREATE_PAYLOAD.scheduled_start,
  scheduled_end: CREATE_PAYLOAD.scheduled_end,
  total_price: 100,
  payment_confirmed: false,
  reschedule_count: 0,
};

describe('booking HTTP surface (Issues #51-#54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: get_staff_availability / create_initial_booking_charge etc.
    // resolve to an empty ok result. Individual tests override as needed.
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);
  });

  it('requires authentication on every booking route', async () => {
    for (const [method, path] of [
      ['post', '/bookings'],
      ['get', '/bookings/staff-picker'],
      ['get', '/bookings/policy'],
      ['patch', '/bookings/policy'],
      ['get', '/bookings/some-id'],
      ['post', '/bookings/some-id/reschedule'],
      ['post', '/bookings/some-id/cancel'],
    ] as const) {
      const res = await request(app)[method](path);

      expect(res.status).toBe(401);
    }
  });

  it('#51: a customer creates a pay-at-counter Daycare booking - persisted as Pending (AC-4)', async () => {
    mockCaller(CUSTOMER_ID);
    queueFromResults(
      { data: null, error: null }, // getStaffRoleOrNull - not staff
      {
        data: {
          id: CREATE_PAYLOAD.pet_id,
          customer_id: CUSTOMER_ID,
          weight_class: 'S',
          coat_type: 'SC',
        },
        error: null,
      }, // pet ownership
      { data: [], error: null }, // getFixedPrice (pet_type_price_overrides) - no override
      { data: DAYCARE_SERVICE, error: null }, // getServiceById
      {
        data: {
          id: 'pricing-config-1',
          size_s_multiplier: 1,
          size_m_multiplier: 1.1,
          size_l_multiplier: 1.25,
          size_xl_multiplier: 1.5,
          long_coat_addon: 0,
        },
        error: null,
      }, // pricing configuration (getServiceById always reads it, Epic B #80)
      { data: [DEFAULT_POLICY], error: null }, // resolveDownpaymentPolicy
      {
        data: { staff_picker_enabled: false, eligible_staff_roles: [] },
        error: null,
      }, // resolveStaffAssignment -> isStaffPickerEnabled('Daycare') - disabled
      { data: [], error: null }, // pre-insert daycare capacity overlap - empty
      { data: PENDING_BOOKING, error: null }, // insert
      { data: null, error: null }, // booking_items insert
      {
        data: [
          {
            id: 'booking-1',
            pet_id: CREATE_PAYLOAD.pet_id,
            created_at: '2026-07-18T00:00:00Z',
          },
        ],
        error: null,
      }, // post-insert re-count (always runs now, regardless of status) - winner
      // initial charge is emitted via the create_initial_booking_charge RPC
      // (supabase.rpc), not a supabase.from() insert - nothing to queue here
      { data: PENDING_BOOKING, error: null } // final fetch
    );

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', 'Bearer token')
      .send(CREATE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('Pending');
  });

  it('#51 AC-6: booking another customer pet is rejected with 403', async () => {
    mockCaller(CUSTOMER_ID);
    queueFromResults(
      { data: null, error: null }, // not staff
      {
        data: {
          id: CREATE_PAYLOAD.pet_id,
          customer_id: 'someone-else',
          weight_class: 'S',
          coat_type: 'SC',
        },
        error: null,
      }
    );

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', 'Bearer token')
      .send(CREATE_PAYLOAD);

    expect(res.status).toBe(403);
  });

  it('#51: rejects a payload with both service_id and package_id on the same item', async () => {
    mockCaller(CUSTOMER_ID);

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', 'Bearer token')
      .send({
        ...CREATE_PAYLOAD,
        items: [
          {
            service_id: DAYCARE_SERVICE.id,
            package_id: '44444444-4444-4444-a444-444444444444',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it('#51: rejects a payload with no items at all', async () => {
    mockCaller(CUSTOMER_ID);

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', 'Bearer token')
      .send({ ...CREATE_PAYLOAD, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it('#52 AC-3: staff-picker endpoint returns no staff list when the toggle is disabled', async () => {
    mockCaller(CUSTOMER_ID);
    queueFromResults({
      data: { staff_picker_enabled: false, eligible_staff_roles: [] },
      error: null,
    });

    const res = await request(app)
      .get('/bookings/staff-picker')
      .query({
        branch_id: CREATE_PAYLOAD.branch_id,
        service_category: 'Grooming',
        scheduled_start: CREATE_PAYLOAD.scheduled_start,
        scheduled_end: CREATE_PAYLOAD.scheduled_end,
      })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      staff_picker_enabled: false,
      options: [],
      max_concurrent_per_staff: 1,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('#52 AC-4: staff-picker endpoint lists "No preference" first when enabled', async () => {
    mockCaller(CUSTOMER_ID);
    // isStaffPickerEnabled and listAvailableStaff each independently resolve
    // the service_types row (two queued fetches), then resolveEffectivePolicy
    // reads policy_configurations for max_concurrent_per_staff (third).
    queueFromResults(
      {
        data: { staff_picker_enabled: true, eligible_staff_roles: ['Groomer'] },
        error: null,
      },
      {
        data: { staff_picker_enabled: true, eligible_staff_roles: ['Groomer'] },
        error: null,
      },
      { data: [DEFAULT_POLICY], error: null }
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { staff_id: 'groomer-1', display_name: 'Ana', profile_photo_url: null },
      ],
      error: null,
    } as never);

    const res = await request(app)
      .get('/bookings/staff-picker')
      .query({
        branch_id: CREATE_PAYLOAD.branch_id,
        service_category: 'Grooming',
        scheduled_start: CREATE_PAYLOAD.scheduled_start,
        scheduled_end: CREATE_PAYLOAD.scheduled_end,
      })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.options[0]).toEqual({ type: 'no_preference' });
    expect(res.body.options).toHaveLength(2);
  });

  it('#52 AC-5: a non-Admin staff role gets 403 on the policy write endpoint', async () => {
    mockCaller('recept-1');
    queueFromResults({ data: { role: 'Receptionist' }, error: null });

    const res = await request(app)
      .patch('/bookings/policy')
      .set('Authorization', 'Bearer token')
      .send({ lunch_break_enabled: false });

    expect(res.status).toBe(403);
  });

  it('#52 AC-2: an Admin PATCH updates the policy row', async () => {
    mockCaller('admin-1');
    queueFromResults(
      { data: { role: 'Admin' }, error: null }, // requireRole
      { data: DEFAULT_POLICY, error: null }, // existing row lookup
      {
        data: { ...DEFAULT_POLICY, lunch_break_enabled: false },
        error: null,
      } // update
    );

    const res = await request(app)
      .patch('/bookings/policy')
      .set('Authorization', 'Bearer token')
      .send({ lunch_break_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.policy.lunch_break_enabled).toBe(false);
  });

  it('#54 AC-2: a Strict-mode reschedule missing notice is rejected with a clear 422', async () => {
    mockCaller(CUSTOMER_ID);
    queueFromResults(
      {
        data: {
          ...PENDING_BOOKING,
          status: 'Pending',
          scheduled_start: daysFromNow(1),
          scheduled_end: daysFromNow(1.1),
        },
        error: null,
      }, // booking fetch
      { data: null, error: null }, // getStaffRoleOrNull - not staff
      { data: [DEFAULT_POLICY], error: null } // policy
    );

    const res = await request(app)
      .post('/bookings/booking-1/reschedule')
      .set('Authorization', 'Bearer token')
      .send({
        scheduled_start: daysFromNow(12),
        scheduled_end: daysFromNow(12.1),
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('notice');
  });

  it('#54 AC-5: cancellation sets Cancelled and reports the notice outcome', async () => {
    mockCaller(CUSTOMER_ID);
    const activeBooking = {
      ...PENDING_BOOKING,
      status: 'Pending',
      scheduled_start: daysFromNow(10),
      scheduled_end: daysFromNow(10.1),
    };

    queueFromResults(
      { data: activeBooking, error: null }, // booking fetch
      { data: null, error: null }, // getStaffRoleOrNull - not staff
      { data: [DEFAULT_POLICY], error: null }, // policy
      {
        data: {
          ...activeBooking,
          status: 'Cancelled',
          cancelled_at: '2026-07-18T08:00:00Z',
          cancellation_reason: 'sick pet',
        },
        error: null,
      } // update
    );

    const res = await request(app)
      .post('/bookings/booking-1/cancel')
      .set('Authorization', 'Bearer token')
      .send({ cancellation_reason: 'sick pet' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('Cancelled');
    expect(res.body.notice_period_met).toBe(true);
    expect(res.body.policy_violation).toBe(false);
  });
});

describe('GET /bookings/:id/details (View details surface)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);
  });

  const DETAIL_BOOKING = {
    ...PENDING_BOOKING,
    id: 'booking-9',
    service_category: 'Grooming',
    status: 'Completed',
    assigned_staff_id: 'staff-9',
    preferred_cage_id: null,
    booking_group_id: null,
    selected_discount_id: null,
    selected_promo_id: null,
    discount_amount: 0,
    promo_amount: 0,
    downpayment_amount: null,
    downpayment_required: false,
    payment_status: 'Fully Paid',
    total_price: 100,
    booking_items: [
      {
        id: 'item-1',
        booking_id: 'booking-9',
        service_id: 'svc-1',
        package_id: null,
        price_at_booking: 100,
        duration_minutes_at_booking: 60,
      },
    ],
  };

  function queueHydration() {
    queueFromResults(
      { data: DETAIL_BOOKING, error: null }, // getBookingById -> bookings
      {
        data: {
          id: DETAIL_BOOKING.branch_id,
          name: 'Makati',
          address: '1 Main St',
          contact_number: '123',
        },
        error: null,
      }, // branches
      {
        data: {
          id: DETAIL_BOOKING.pet_id,
          name: 'Luna',
          weight_class: 'S',
          coat_type: 'SC',
        },
        error: null,
      }, // pets
      { data: { id: CUSTOMER_ID, full_name: 'Alex Cruz' }, error: null }, // customer_profiles
      { data: [{ id: 'svc-1', name: 'Full Groom' }], error: null }, // services (item names)
      { data: { id: 'staff-9', display_name: 'Jamie' }, error: null }, // staff_profiles
      {
        data: [
          {
            id: 'txn-1',
            total_amount: 100,
            payment_choice: 'full',
            payment_status: 'Fully Paid',
            payment_method: 'GCash',
            bank_name: null,
            credit_applied_amount: 0,
            payment_reference: null,
            created_at: '2026-07-18T00:00:00Z',
            webhook_confirmed_at: '2026-07-18T00:05:00Z',
          },
        ],
        error: null,
      } // transactions
    );
  }

  it('requires authentication', async () => {
    const res = await request(app).get('/bookings/booking-9/details');
    expect(res.status).toBe(401);
  });

  it('hydrates branch, pet, assigned staff, item names and payments for the owning customer', async () => {
    mockCaller(CUSTOMER_ID);
    queueHydration();

    const res = await request(app)
      .get('/bookings/booking-9/details')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.details.branch.name).toBe('Makati');
    expect(res.body.details.pet.name).toBe('Luna');
    expect(res.body.details.assigned_staff.display_name).toBe('Jamie');
    expect(res.body.details.items[0].name).toBe('Full Groom');
    expect(res.body.details.transactions).toHaveLength(1);
    expect(res.body.details.payments_visible).toBe(true);
    expect(res.body.details.pricing.amount_paid).toBe(100);
    expect(res.body.details.pricing.balance_due).toBe(0);
  });

  it('returns 403 for a different customer who is not staff', async () => {
    mockCaller('someone-else');
    queueFromResults(
      { data: DETAIL_BOOKING, error: null }, // bookings - owned by CUSTOMER_ID
      { data: null, error: null } // getStaffRoleOrNull - not staff
    );

    const res = await request(app)
      .get('/bookings/booking-9/details')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('allows a Cashier to view any booking with its payments (Payments Queue drill-down)', async () => {
    mockCaller('cashier-1');
    queueFromResults(
      { data: DETAIL_BOOKING, error: null }, // bookings
      { data: { role: 'Cashier' }, error: null }, // getStaffRoleOrNull (getBookingById)
      { data: { role: 'Cashier' }, error: null }, // getStaffRoleOrNull (payments gate)
      { data: { id: DETAIL_BOOKING.branch_id, name: 'Makati' }, error: null },
      { data: { id: DETAIL_BOOKING.pet_id, name: 'Luna' }, error: null },
      { data: { id: CUSTOMER_ID, full_name: 'Alex Cruz' }, error: null },
      { data: [{ id: 'svc-1', name: 'Full Groom' }], error: null },
      { data: { id: 'staff-9', display_name: 'Jamie' }, error: null },
      {
        data: [
          {
            id: 'txn-1',
            total_amount: 100,
            payment_choice: 'full',
            payment_status: 'Fully Paid',
            payment_method: 'GCash',
            bank_name: null,
            credit_applied_amount: 0,
            payment_reference: 'ref-1',
            created_at: '2026-07-18T00:00:00Z',
            webhook_confirmed_at: null,
          },
        ],
        error: null,
      } // transactions
    );

    const res = await request(app)
      .get('/bookings/booking-9/details')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.details.payments_visible).toBe(true);
    expect(res.body.details.transactions).toHaveLength(1);
  });

  it('withholds the payment list from a non-billing staff role (Groomer)', async () => {
    mockCaller('groomer-1');
    queueFromResults(
      { data: DETAIL_BOOKING, error: null }, // bookings
      { data: { role: 'Groomer' }, error: null }, // getStaffRoleOrNull (getBookingById)
      { data: { role: 'Groomer' }, error: null }, // getStaffRoleOrNull (payments gate)
      { data: { id: DETAIL_BOOKING.branch_id, name: 'Makati' }, error: null },
      { data: { id: DETAIL_BOOKING.pet_id, name: 'Luna' }, error: null },
      { data: { id: CUSTOMER_ID, full_name: 'Alex Cruz' }, error: null },
      { data: [{ id: 'svc-1', name: 'Full Groom' }], error: null },
      { data: { id: 'staff-9', display_name: 'Jamie' }, error: null }
      // no transactions query - withheld for a non-billing role
    );

    const res = await request(app)
      .get('/bookings/booking-9/details')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.details.assigned_staff.display_name).toBe('Jamie');
    expect(res.body.details.payments_visible).toBe(false);
    expect(res.body.details.transactions).toEqual([]);
  });
});
