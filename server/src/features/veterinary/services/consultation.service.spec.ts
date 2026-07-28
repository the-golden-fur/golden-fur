import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConsultation,
  listConsultationQueue,
  listPetConsultationHistory,
  updateConsultation,
} from './consultation.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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
      'in',
      'gte',
      'lt',
      'order',
      'limit',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update']) {
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
const MAKATI = { id: 'branch-makati', name: 'Makati', is_vet_branch: true };

function bookingFor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    scheduled_start: '2026-07-19T02:00:00.000Z',
    status: 'Pending',
    ...overrides,
  };
}

function consultationRow(overrides: Record<string, unknown> = {}) {
  const { bookingStatus, ...rest } = overrides as {
    bookingStatus?: string;
  } & Record<string, unknown>;

  return {
    id: 'consultation-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: VET_ID,
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: null,
    medications: null,
    reason_for_visit: 'Checkup',
    follow_up_date: null,
    follow_up_booking_id: null,
    booking: bookingFor({ status: bookingStatus ?? 'Pending' }),
    ...rest,
  };
}

describe('consultation.service (#66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('listConsultationQueue', () => {
    it('auto-vivifies a consultation for an actionable (Pending/In Progress) Veterinary booking without one yet', async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              pet_id: 'pet-1',
              branch_id: MAKATI.id,
              assigned_staff_id: VET_ID,
              special_instructions: 'Annual checkup',
            },
          ],
          error: null,
        }, // bookings
        { data: [], error: null }, // existing consultations
        { data: MAKATI, error: null }, // assertVeterinaryBranchEligibility branch lookup
        { data: null, error: null }, // insert
        {
          data: [
            {
              ...consultationRow(),
              booking: { scheduled_start: '2026-07-19T02:00:00.000Z' },
            },
          ],
          error: null,
        } // consultations select
      );

      const result = await listConsultationQueue();

      expect(result).toHaveLength(1);
      const insert = recordedWrites.find(
        (write) => write.table === 'consultations' && write.method === 'insert'
      );
      expect(insert?.payload).toMatchObject([
        {
          booking_id: 'booking-1',
          pet_id: 'pet-1',
          veterinarian_id: VET_ID,
          reason_for_visit: 'Annual checkup',
        },
      ]);
      // consultations.status was dropped (M07) - the auto-vivify insert must
      // never write it.
      expect(
        (insert?.payload as Array<Record<string, unknown>>)[0]
      ).not.toHaveProperty('status');
    });

    it('AC-5: rejects auto-vivifying a consultation against a non-Makati booking', async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              pet_id: 'pet-1',
              branch_id: 'branch-south',
              assigned_staff_id: VET_ID,
              special_instructions: null,
            },
          ],
          error: null,
        },
        { data: [], error: null },
        {
          data: {
            id: 'branch-south',
            name: 'Southwoods',
            is_vet_branch: false,
          },
          error: null,
        }
      );

      await expect(listConsultationQueue()).rejects.toMatchObject({
        statusCode: 422,
      });
    });
  });

  describe('getConsultation', () => {
    it('returns 404 when the consultation does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getConsultation('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('listPetConsultationHistory', () => {
    it('AC-3: returns all prior consultations for a pet', async () => {
      queueFromResults({
        data: [consultationRow(), consultationRow({ id: 'consultation-2' })],
        error: null,
      });

      const result = await listPetConsultationHistory('pet-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('updateConsultation', () => {
    it('AC-1: records vitals/diagnosis/medications while the booking is In Progress', async () => {
      queueFromResults(
        {
          data: consultationRow({ bookingStatus: 'In Progress' }),
          error: null,
        }, // getConsultation
        {
          data: consultationRow({
            bookingStatus: 'In Progress',
            diagnosis: 'Ear infection',
          }),
          error: null,
        } // final consultations update
      );

      const result = await updateConsultation({
        requesterId: VET_ID,
        consultationId: 'consultation-1',
        input: {
          temperature: 38.5,
          diagnosis: 'Ear infection',
          medications: [{ name: 'Amoxicillin', dose: '50mg', notes: 'BID' }],
        },
      });

      expect(result.diagnosis).toBe('Ear infection');
      const update = recordedWrites.find(
        (write) => write.table === 'consultations' && write.method === 'update'
      );
      expect(update?.payload).toMatchObject({
        temperature: 38.5,
        diagnosis: 'Ear infection',
        medications: [{ name: 'Amoxicillin', dose: '50mg', notes: 'BID' }],
      });
    });

    it('rejects skipping Pending -> Completed (delegates to completeBooking, which requires In Progress)', async () => {
      queueFromResults(
        { data: consultationRow({ bookingStatus: 'Pending' }), error: null }, // getConsultation
        { data: bookingFor({ status: 'Pending' }), error: null } // completeBooking's getRawBookingById
      );

      await expect(
        updateConsultation({
          requesterId: VET_ID,
          consultationId: 'consultation-1',
          input: { status: 'Completed', professional_fee: 500 },
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects updating an already-finalized (Completed/Paid) consultation', async () => {
      queueFromResults({
        data: consultationRow({ bookingStatus: 'Completed' }),
        error: null,
      });

      await expect(
        updateConsultation({
          requesterId: VET_ID,
          consultationId: 'consultation-1',
          input: { diagnosis: 'Late edit' },
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already finalized'),
      });
    });

    it('AC-2: marking Completed delegates to completeBooking, writes a line item for the professional fee/each medication/each procedure, and returns the post-transition booking status', async () => {
      queueFromResults(
        {
          data: consultationRow({ bookingStatus: 'In Progress' }),
          error: null,
        }, // getConsultation
        { data: bookingFor({ status: 'In Progress' }), error: null }, // completeBooking's getRawBookingById
        {
          data: bookingFor({ status: 'Completed' }),
          error: null,
        }, // completeBooking's updateBookingRow
        { data: null, error: null }, // consultation_line_items insert
        {
          data: consultationRow({
            bookingStatus: 'Completed',
            pet_id: 'pet-1',
            medications: [{ name: 'Amoxicillin', dose: '50mg', notes: null }],
          }),
          error: null,
        } // final consultations update
      );

      const result = await updateConsultation({
        requesterId: VET_ID,
        consultationId: 'consultation-1',
        input: {
          status: 'Completed',
          professional_fee: 500,
          medications: [{ name: 'Amoxicillin', dose: '50mg', amount: 150 }],
          procedures: [
            { procedure_type: 'Dental', description: 'Cleaning', amount: 800 },
          ],
        },
      });

      expect(result.booking?.status).toBe('Completed');

      const lineItemsInsert = recordedWrites.find(
        (write) => write.table === 'consultation_line_items'
      );
      expect(lineItemsInsert?.payload).toMatchObject([
        { item_type: 'professional_fee', amount: 500 },
        { item_type: 'medication', description: 'Amoxicillin', amount: 150 },
        { item_type: 'procedure', procedure_type: 'Dental', amount: 800 },
      ]);
    });

    it('AC-3: a vaccination entered at completion writes through to pet_vaccination_records immediately', async () => {
      queueFromResults(
        {
          data: consultationRow({ bookingStatus: 'In Progress' }),
          error: null,
        }, // getConsultation
        { data: bookingFor({ status: 'In Progress' }), error: null }, // completeBooking's getRawBookingById
        { data: bookingFor({ status: 'Completed' }), error: null }, // completeBooking's updateBookingRow
        { data: null, error: null }, // consultation_line_items insert
        { data: { role: 'Veterinarian' }, error: null }, // createVaccinationRecord's role check
        { data: { id: 'pet-1' }, error: null }, // createVaccinationRecord's pet lookup
        { data: { id: 'vax-1', vaccine_name: 'Rabies' }, error: null }, // vaccination insert
        {
          data: consultationRow({
            bookingStatus: 'Completed',
            pet_id: 'pet-1',
          }),
          error: null,
        } // final consultations update
      );

      await updateConsultation({
        requesterId: VET_ID,
        consultationId: 'consultation-1',
        input: {
          status: 'Completed',
          professional_fee: 500,
          vaccination: {
            vaccine_name: 'Rabies',
            date_administered: '2026-07-19',
          },
        },
      });

      const vaccinationInsert = recordedWrites.find(
        (write) => write.table === 'pet_vaccination_records'
      );
      expect(vaccinationInsert?.payload).toMatchObject({
        pet_id: 'pet-1',
        vaccine_name: 'Rabies',
      });
    });
  });
});
