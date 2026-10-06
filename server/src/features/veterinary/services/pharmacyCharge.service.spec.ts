import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPharmacyCharge,
  planPharmacyCharge,
} from './pharmacyCharge.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';
import type { Consultation } from '../veterinary.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  recomputeBookingPaymentStatus: vi.fn(() => Promise.resolve({})),
  recomputeBookingGroupPaymentStatus: vi.fn(() => Promise.resolve({})),
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

    for (const method of ['select', 'eq', 'in']) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update', 'delete']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const VET_ID = 'vet-1';
const AMOXICILLIN = 'med-amoxicillin';
const MELOXICAM = 'med-meloxicam';

const BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-makati',
  total_price: 500,
  booking_group_id: null,
};

function consultationWith(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: 'consultation-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: VET_ID,
    accepted_by: VET_ID,
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: null,
    medications: null,
    form_responses: null,
    reason_for_visit: 'Checkup',
    follow_up_date: null,
    follow_up_booking_id: null,
    sold_at_pharmacy: false,
    medication_transaction_id: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

const PRESCRIBED = [
  {
    name: 'Amoxicillin',
    dose: '50mg',
    quantity: 2,
    medication_catalog_id: AMOXICILLIN,
  },
  {
    name: 'Meloxicam',
    dose: '1 tab',
    quantity: 3,
    medication_catalog_id: MELOXICAM,
  },
];

const PRICES = [
  { id: AMOXICILLIN, default_price: 150 },
  { id: MELOXICAM, default_price: 40 },
];

const writesTo = (table: string) =>
  recordedWrites.filter((write) => write.table === table);

describe('pharmacyCharge.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('planPharmacyCharge', () => {
    it('prices each prescribed medicine from the medicine list: quantity x list price', async () => {
      queueFromResults({ data: PRICES, error: null });

      const plan = await planPharmacyCharge({
        consultation: consultationWith(),
        medications: PRESCRIBED,
        soldAtPharmacy: true,
      });

      expect(plan.locked).toBe(false);
      expect(plan.lines).toEqual([
        {
          description: 'Amoxicillin',
          quantity: 2,
          unit_price: 150,
          line_total: 300,
        },
        {
          description: 'Meloxicam',
          quantity: 3,
          unit_price: 40,
          line_total: 120,
        },
      ]);
    });

    it('bills nothing when the customer is buying from another pharmacy, even if the medicines have prices', async () => {
      queueFromResults({ data: PRICES, error: null });

      const plan = await planPharmacyCharge({
        consultation: consultationWith(),
        medications: PRESCRIBED,
        soldAtPharmacy: false,
      });

      expect(plan).toEqual({ locked: false, existing: null, lines: [] });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('counts a medicine with no quantity as one', async () => {
      queueFromResults({ data: PRICES, error: null });

      const plan = await planPharmacyCharge({
        consultation: consultationWith(),
        medications: [
          {
            name: 'Amoxicillin',
            dose: '50mg',
            medication_catalog_id: AMOXICILLIN,
          },
        ],
        soldAtPharmacy: true,
      });

      expect(plan.lines[0]).toMatchObject({ quantity: 1, line_total: 150 });
    });

    it('refuses to sell a medicine that has no price on the medicine list', async () => {
      queueFromResults({
        data: [
          { id: AMOXICILLIN, default_price: null },
          { id: MELOXICAM, default_price: 40 },
        ],
        error: null,
      });

      await expect(
        planPharmacyCharge({
          consultation: consultationWith(),
          medications: PRESCRIBED,
          soldAtPharmacy: true,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Amoxicillin'),
      });
    });

    it('refuses to sell a medicine that is not on the medicine list at all', async () => {
      await expect(
        planPharmacyCharge({
          consultation: consultationWith(),
          medications: [{ name: 'Mystery syrup', dose: '5ml' }],
          soldAtPharmacy: true,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Mystery syrup'),
      });
    });

    it('is locked once the medicine transaction has been paid - prices are not even looked up', async () => {
      queueFromResults({
        data: { id: 'txn-1', payment_status: 'Fully Paid', total_amount: 300 },
        error: null,
      });

      const plan = await planPharmacyCharge({
        consultation: consultationWith({ medication_transaction_id: 'txn-1' }),
        medications: [{ name: 'Mystery syrup', dose: '5ml' }],
        soldAtPharmacy: true,
      });

      expect(plan.locked).toBe(true);
      expect(plan.lines).toEqual([]);
    });
  });

  describe('applyPharmacyCharge', () => {
    const LINES = [
      {
        description: 'Amoxicillin',
        quantity: 2,
        unit_price: 150,
        line_total: 300,
      },
      {
        description: 'Meloxicam',
        quantity: 3,
        unit_price: 40,
        line_total: 120,
      },
    ];

    it('posts one Pending transaction for the cashier with a line per medicine, and raises the booking total by the same amount', async () => {
      queueFromResults(
        { data: BOOKING, error: null }, // bookings lookup
        { data: { id: 'txn-new' }, error: null }, // transactions insert
        { data: null, error: null }, // transaction_line_items insert
        { data: null, error: null }, // consultations link
        { data: null, error: null } // bookings total
      );

      await applyPharmacyCharge({
        consultation: consultationWith(),
        plan: { locked: false, existing: null, lines: LINES },
        requesterId: VET_ID,
      });

      expect(writesTo('transactions')[0]).toMatchObject({
        method: 'insert',
        payload: {
          booking_id: 'booking-1',
          booking_group_id: null,
          customer_id: 'customer-1',
          branch_id: 'branch-makati',
          transaction_type: 'booking_payment',
          payment_status: 'Pending',
          payment_choice: 'balance',
          subtotal_amount: 420,
          total_amount: 420,
          processed_by_staff_id: VET_ID,
        },
      });
      expect(writesTo('transaction_line_items')[0].payload).toEqual([
        {
          transaction_id: 'txn-new',
          line_item_type: 'service',
          reference_id: 'consultation-1',
          description: 'Amoxicillin',
          quantity: 2,
          unit_price: 150,
          line_total: 300,
        },
        {
          transaction_id: 'txn-new',
          line_item_type: 'service',
          reference_id: 'consultation-1',
          description: 'Meloxicam',
          quantity: 3,
          unit_price: 40,
          line_total: 120,
        },
      ]);
      expect(writesTo('consultations')[0].payload).toMatchObject({
        medication_transaction_id: 'txn-new',
      });
      expect(writesTo('bookings')[0].payload).toMatchObject({
        total_price: 920,
      });
      expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
    });

    it('writes nothing at all when the customer is buying from another pharmacy', async () => {
      await applyPharmacyCharge({
        consultation: consultationWith(),
        plan: { locked: false, existing: null, lines: [] },
        requesterId: VET_ID,
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(recordedWrites).toEqual([]);
    });

    it('rewrites an unpaid medicine transaction after an edit and moves the booking total by the difference', async () => {
      queueFromResults(
        { data: { ...BOOKING, total_price: 800 }, error: null }, // bookings lookup
        { data: null, error: null }, // transactions update
        { data: null, error: null }, // transaction_line_items delete
        { data: null, error: null }, // transaction_line_items insert
        { data: null, error: null } // bookings total
      );

      await applyPharmacyCharge({
        consultation: consultationWith({ medication_transaction_id: 'txn-1' }),
        plan: {
          locked: false,
          existing: { id: 'txn-1', total_amount: 300 },
          lines: LINES,
        },
        requesterId: VET_ID,
      });

      expect(writesTo('transactions')).toEqual([
        expect.objectContaining({
          method: 'update',
          payload: expect.objectContaining({
            subtotal_amount: 420,
            total_amount: 420,
          }),
        }),
      ]);
      expect(
        writesTo('transaction_line_items').map((write) => write.method)
      ).toEqual(['delete', 'insert']);
      expect(writesTo('bookings')[0].payload).toMatchObject({
        total_price: 920,
      });
    });

    it('removes an unpaid medicine transaction when the vet switches to another pharmacy', async () => {
      queueFromResults(
        { data: { ...BOOKING, total_price: 800 }, error: null }, // bookings lookup
        { data: null, error: null }, // consultations unlink
        { data: null, error: null }, // transaction_line_items delete
        { data: null, error: null }, // transactions delete
        { data: null, error: null } // bookings total
      );

      await applyPharmacyCharge({
        consultation: consultationWith({ medication_transaction_id: 'txn-1' }),
        plan: {
          locked: false,
          existing: { id: 'txn-1', total_amount: 300 },
          lines: [],
        },
        requesterId: VET_ID,
      });

      expect(writesTo('consultations')[0].payload).toMatchObject({
        medication_transaction_id: null,
      });
      expect(writesTo('transactions')).toEqual([
        expect.objectContaining({ method: 'delete' }),
      ]);
      expect(writesTo('bookings')[0].payload).toMatchObject({
        total_price: 500,
      });
    });

    it('leaves a paid medicine transaction completely alone', async () => {
      await applyPharmacyCharge({
        consultation: consultationWith({ medication_transaction_id: 'txn-1' }),
        plan: { locked: true, existing: null, lines: [] },
        requesterId: VET_ID,
      });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("bills a grouped booking's medicines to the group, like its other charges", async () => {
      queueFromResults(
        { data: { ...BOOKING, booking_group_id: 'group-1' }, error: null }, // bookings lookup
        { data: { id: 'txn-new' }, error: null }, // transactions insert
        { data: null, error: null }, // transaction_line_items insert
        { data: null, error: null }, // consultations link
        { data: null, error: null }, // bookings total
        { data: { net_total: 1500 }, error: null }, // booking_groups lookup
        { data: null, error: null } // booking_groups total
      );

      await applyPharmacyCharge({
        consultation: consultationWith(),
        plan: { locked: false, existing: null, lines: LINES },
        requesterId: VET_ID,
      });

      expect(writesTo('transactions')[0].payload).toMatchObject({
        booking_id: null,
        booking_group_id: 'group-1',
      });
      expect(writesTo('booking_groups')[0].payload).toMatchObject({
        net_total: 1920,
      });
      expect(recomputeBookingGroupPaymentStatus).toHaveBeenCalledWith(
        'group-1'
      );
    });
  });
});
