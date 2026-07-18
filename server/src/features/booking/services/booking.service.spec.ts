import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBooking } from './booking.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPackageById } from '../../maintenance/services/packages.service.ts';

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

const CUSTOMER_ID = 'cust-1';
const PET = {
  id: 'pet-1',
  customer_id: CUSTOMER_ID,
  weight_class: 'S',
  coat_type: 'SC',
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
  service_pricing_tiers: [
    { weight_class: 'S', coat_type: 'SC', price: 350 },
  ],
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

const BASE_INPUT = {
  pet_id: PET.id,
  branch_id: 'branch-1',
  service_category: 'Grooming' as const,
  service_id: 'service-groom',
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
  status: 'Confirmed',
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

  it('AC-1/AC-4: creates a Confirmed Grooming booking (tiered price, auto-assigned staff)', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // bookings insert
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
      status: 'Confirmed',
      assigned_staff_id: 'groomer-1',
      total_price: 350, // S/SC tier price, not base_price
      downpayment_amount: null,
    });
  });

  it('AC-4: a pay-at-counter (payment_confirmed=false) Daycare booking persists as Pending, not Confirmed', async () => {
    vi.mocked(getServiceById).mockResolvedValue(DAYCARE_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [], error: null }, // daycare overlap count - empty
      {
        data: { ...INSERTED_BOOKING, id: 'booking-2', status: 'Pending' },
        error: null,
      }, // insert
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
        service_id: 'service-daycare',
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
      { data: null, error: null }, // preference insert
      { data: [{ id: 'booking-1' }], error: null }, // re-count winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    await createBooking({
      requesterId: CUSTOMER_ID,
      input: {
        ...BASE_INPUT,
        service_category: 'Veterinary',
        service_id: 'service-vet',
        branch_id: 'branch-makati',
        // no payment_confirmed at all
      },
    });

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({
      status: 'Confirmed',
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
          service_id: 'service-vet',
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

  it('AC-5: the race loser is deleted and receives the capacity-taken error', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE);
    queueFromResults(
      { data: PET, error: null }, // pet ownership
      { data: [DEFAULT_POLICY], error: null }, // staff picker toggle
      { data: INSERTED_BOOKING, error: null }, // insert
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
          status: 'Confirmed',
        },
        error: null,
      }, // insert
      { data: [{ id: 'booking-3' }], error: null }, // re-count winner
      { data: INSERTED_BOOKING, error: null } // final fetch
    );

    await createBooking({
      requesterId: CUSTOMER_ID,
      input: {
        pet_id: PET.id,
        branch_id: 'branch-1',
        service_category: 'Daycare',
        package_id: 'package-1',
        scheduled_start: BASE_INPUT.scheduled_start,
        scheduled_end: BASE_INPUT.scheduled_end,
        payment_confirmed: true,
      },
    });

    const insert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );

    expect(insert?.payload).toMatchObject({
      package_id: 'package-1',
      service_id: null,
      total_price: 999,
    });
  });
});
