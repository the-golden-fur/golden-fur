import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repriceBookingsAwaitingAssessment } from './assessmentReprice.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { checkCapacity } from './capacity.service.ts';
import {
  createNotification,
  notifyStaffRoleAtBranch,
} from '../../notifications/services/notification.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./capacity.service.ts', () => ({
  checkCapacity: vi.fn(),
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
  notifyStaffRoleAtBranch: vi.fn(),
}));

// The pricing itself (resolveBookingItems) and the payment rollup are covered
// by booking.service.spec.ts - stubbed here so this file only has to queue
// this service's own queries. isPetAssessed and round2 stay real.
vi.mock('./booking.service.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./booking.service.ts')>();
  return {
    ...actual,
    resolveBookingItems: vi.fn(),
    recomputeBookingPaymentStatus: vi.fn(),
  };
});

import {
  recomputeBookingPaymentStatus,
  resolveBookingItems,
} from './booking.service.ts';

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  table: string;
  payload: unknown;
}

const recordedUpdates: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'in']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.update = vi.fn((payload: unknown) => {
      recordedUpdates.push({ table, payload });
      return builder;
    });
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const ASSESSED_PET = {
  id: 'pet-1',
  customer_id: 'cust-1',
  pet_type: 'Dog',
  weight_class: 'L',
  coat_type: 'LC',
};

const GROOMING_BOOKING = {
  id: 'booking-1',
  customer_id: 'cust-1',
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  service_category: 'Grooming',
  status: 'Pending',
  awaiting_assessment: true,
  scheduled_start: '2026-08-03T01:00:00.000Z',
  scheduled_end: '2026-08-03T02:00:00.000Z',
  total_price: 300,
};

const SERVICE_ITEM = {
  id: 'item-1',
  service_id: 'service-bath',
  package_id: null,
  price_at_booking: 300,
  duration_minutes_at_booking: 60,
};

function bookingUpdate() {
  return recordedUpdates.find((write) => write.table === 'bookings')?.payload;
}

function itemUpdates() {
  return recordedUpdates
    .filter((write) => write.table === 'booking_items')
    .map((write) => write.payload);
}

describe('repriceBookingsAwaitingAssessment (book before assessment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedUpdates.length = 0;
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    vi.mocked(checkCapacity).mockResolvedValue({ available: true });
  });

  it("moves a waiting booking from its estimate to the pet's real price, clears the flag, and posts the bill once", async () => {
    vi.mocked(resolveBookingItems).mockResolvedValue([
      {
        service_id: 'service-bath',
        package_id: null,
        price_at_booking: 425,
        duration_minutes_at_booking: 60,
      },
    ]);
    queueFromResults(
      { data: ASSESSED_PET, error: null }, // pet
      { data: [GROOMING_BOOKING], error: null }, // waiting bookings
      { data: [SERVICE_ITEM], error: null }, // booking_items
      { data: null, error: null }, // booking_items update
      { data: { id: 'booking-1' }, error: null } // bookings update (claimed)
    );

    const result = await repriceBookingsAwaitingAssessment('pet-1');

    expect(result).toEqual({
      repriced: [{ bookingId: 'booking-1', totalPrice: 425 }],
      failed: [],
    });
    // Priced exactly as createBooking prices an assessed pet.
    expect(resolveBookingItems).toHaveBeenCalledWith(
      [{ service_id: 'service-bath' }],
      ASSESSED_PET,
      true,
      'Grooming',
      'branch-1',
      GROOMING_BOOKING.scheduled_start,
      GROOMING_BOOKING.scheduled_end,
      true,
      true
    );
    expect(itemUpdates()).toEqual([{ price_at_booking: 425 }]);
    expect(bookingUpdate()).toMatchObject({
      total_price: 425,
      awaiting_assessment: false,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('create_initial_booking_charge', {
      p_booking_id: 'booking-1',
      p_scheme: 'full',
      p_net_total: 425,
      p_downpayment_amount: null,
    });
    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });

  it('tells the customer the final price', async () => {
    vi.mocked(resolveBookingItems).mockResolvedValue([
      {
        service_id: 'service-bath',
        package_id: null,
        price_at_booking: 425,
        duration_minutes_at_booking: 60,
      },
    ]);
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      { data: [GROOMING_BOOKING], error: null },
      { data: [SERVICE_ITEM], error: null },
      { data: null, error: null },
      { data: { id: 'booking-1' }, error: null }
    );

    await repriceBookingsAwaitingAssessment('pet-1');

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'cust-1',
        relatedBookingId: 'booking-1',
        message: expect.stringContaining('PHP 425.00'),
      })
    );
  });

  it('keeps a free long-stay package free, and sums it into the total as zero', async () => {
    vi.mocked(resolveBookingItems).mockResolvedValue([
      {
        service_id: 'service-hotel',
        package_id: null,
        price_at_booking: 4500,
        duration_minutes_at_booking: 1440,
      },
    ]);
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      {
        data: [{ ...GROOMING_BOOKING, service_category: 'Hotel' }],
        error: null,
      },
      {
        data: [
          {
            ...SERVICE_ITEM,
            service_id: 'service-hotel',
            price_at_booking: 4500,
            duration_minutes_at_booking: 1440,
          },
          {
            id: 'item-free',
            service_id: null,
            package_id: 'package-golden',
            price_at_booking: 0,
            duration_minutes_at_booking: 0,
          },
        ],
        error: null,
      },
      { data: { id: 'booking-1' }, error: null } // bookings update (no item changed)
    );

    await repriceBookingsAwaitingAssessment('pet-1');

    // Only the stay itself is repriced; the award row is never sent.
    expect(resolveBookingItems).toHaveBeenCalledWith(
      [{ service_id: 'service-hotel' }],
      expect.anything(),
      true,
      'Hotel',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
      true
    );
    expect(itemUpdates()).toEqual([]);
    expect(bookingUpdate()).toMatchObject({ total_price: 4500 });
  });

  it('Hotel: alerts Receptionist and Front Desk when the now-known cage size is full, without failing', async () => {
    vi.mocked(checkCapacity).mockResolvedValue({
      available: false,
      reason: 'No L-size cages available for the requested dates',
    });
    vi.mocked(resolveBookingItems).mockResolvedValue([
      {
        service_id: 'service-hotel',
        package_id: null,
        price_at_booking: 850,
        duration_minutes_at_booking: 1440,
      },
    ]);
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      {
        data: [{ ...GROOMING_BOOKING, service_category: 'Hotel' }],
        error: null,
      },
      { data: [{ ...SERVICE_ITEM, service_id: 'service-hotel' }], error: null },
      { data: null, error: null },
      { data: { id: 'booking-1' }, error: null }
    );

    const result = await repriceBookingsAwaitingAssessment('pet-1');

    expect(result.failed).toEqual([]);
    expect(checkCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCategory: 'Hotel',
        petWeightClass: 'L',
        excludeBookingId: 'booking-1',
      })
    );
    expect(
      vi
        .mocked(notifyStaffRoleAtBranch)
        .mock.calls.map(([params]) => params.role)
    ).toEqual(['Receptionist', 'Front Desk']);
  });

  it('does not bill twice when a concurrent save already repriced the booking', async () => {
    vi.mocked(resolveBookingItems).mockResolvedValue([
      {
        service_id: 'service-bath',
        package_id: null,
        price_at_booking: 425,
        duration_minutes_at_booking: 60,
      },
    ]);
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      { data: [GROOMING_BOOKING], error: null },
      { data: [SERVICE_ITEM], error: null },
      { data: null, error: null },
      { data: null, error: null } // the guarded update matched no row
    );

    await repriceBookingsAwaitingAssessment('pet-1');

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('does nothing for a pet that is still not fully assessed (a weight but no coat)', async () => {
    queueFromResults({
      data: { ...ASSESSED_PET, coat_type: null },
      error: null,
    });

    expect(await repriceBookingsAwaitingAssessment('pet-1')).toEqual({
      repriced: [],
      failed: [],
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the pet has no bookings waiting', async () => {
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      { data: [], error: null }
    );

    expect(await repriceBookingsAwaitingAssessment('pet-1')).toEqual({
      repriced: [],
      failed: [],
    });
    expect(resolveBookingItems).not.toHaveBeenCalled();
  });

  it('reports a booking it could not reprice instead of throwing - the assessment itself must stand', async () => {
    vi.mocked(resolveBookingItems).mockRejectedValue(
      new Error('Service "Bath" is inactive')
    );
    queueFromResults(
      { data: ASSESSED_PET, error: null },
      { data: [GROOMING_BOOKING], error: null },
      { data: [SERVICE_ITEM], error: null }
    );

    const result = await repriceBookingsAwaitingAssessment('pet-1');

    expect(result).toEqual({
      repriced: [],
      failed: [
        { bookingId: 'booking-1', reason: 'Service "Bath" is inactive' },
      ],
    });
    expect(bookingUpdate()).toBeUndefined();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
