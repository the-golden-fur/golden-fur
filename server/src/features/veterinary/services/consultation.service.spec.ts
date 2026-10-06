import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getConsultation,
  listConsultationQueue,
  listPetConsultationHistory,
  listPetConsultationResultsForRequester,
  listPetPrescriptionsForRequester,
  listPrescriptions,
  listVeterinarianPatients,
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
      'is',
      'in',
      'gte',
      'lt',
      'or',
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
const OTHER_VET_ID = 'vet-2';
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
    // Already taken by VET_ID by default, so the pre-existing tests below
    // don't each need a claim step - the ownership tests override it.
    accepted_by: VET_ID,
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
    it('auto-vivifies a consultation for an actionable (In Progress) Veterinary booking without one yet', async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              pet_id: 'pet-1',
              branch_id: MAKATI.id,
              assigned_staff_id: VET_ID,
              special_instructions: 'Annual checkup',
              status: 'In Progress',
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

    it("includes a paid Pending booking and gives it a consultation row - the vet sees what's booked before the customer arrives", async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              pet_id: 'pet-1',
              branch_id: MAKATI.id,
              assigned_staff_id: VET_ID,
              special_instructions: null,
              status: 'Pending',
              payment_status: 'Fully Paid',
            },
          ],
          error: null,
        }, // bookings
        { data: [], error: null }, // existing consultations
        { data: MAKATI, error: null }, // branch eligibility
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
      expect(
        recordedWrites.some(
          (write) =>
            write.table === 'consultations' && write.method === 'insert'
        )
      ).toBe(true);
    });

    it('leaves out a Pending booking that has not been paid for - not a secured appointment yet', async () => {
      queueFromResults({
        data: [
          {
            id: 'booking-1',
            pet_id: 'pet-1',
            branch_id: MAKATI.id,
            assigned_staff_id: VET_ID,
            special_instructions: null,
            status: 'Pending',
            payment_status: 'Pending',
          },
        ],
        error: null,
      });

      const result = await listConsultationQueue();

      expect(result).toEqual([]);
      expect(recordedWrites).toHaveLength(0);
    });

    describe('date range', () => {
      function captureDateBounds() {
        const bounds: Record<string, unknown> = {};

        vi.mocked(supabase.from).mockImplementation((() => {
          const builder: Record<string, unknown> = {};

          for (const method of ['select', 'eq', 'in', 'or']) {
            builder[method] = vi.fn(() => builder);
          }
          builder.gte = vi.fn((_column: string, value: unknown) => {
            bounds.from = value;
            return builder;
          });
          builder.lt = vi.fn((_column: string, value: unknown) => {
            bounds.to = value;
            return builder;
          });
          builder.then = (resolve: (_result: QueryResult) => void) =>
            resolve({ data: [], error: null });

          return builder;
        }) as never);

        return bounds;
      }

      it('"All dates" covers every date, upcoming ones included - not just today', async () => {
        const bounds = captureDateBounds();

        await listConsultationQueue({ allDates: true });

        expect(bounds.from).toBe('1970-01-01T00:00:00.000Z');
        expect(bounds.to).toBe('9999-12-31T00:00:00.000Z');
      });

      it('still defaults to today when no range is asked for at all', async () => {
        const bounds = captureDateBounds();

        await listConsultationQueue();

        expect(
          new Date(bounds.to as string).getTime() -
            new Date(bounds.from as string).getTime()
        ).toBe(24 * 60 * 60 * 1000);
      });
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
              status: 'In Progress',
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

    it("includes a Completed booking's existing consultation without vivifying a new row for it", async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'booking-1',
              pet_id: 'pet-1',
              branch_id: MAKATI.id,
              assigned_staff_id: VET_ID,
              special_instructions: 'Annual checkup',
              status: 'Completed',
            },
          ],
          error: null,
        }, // bookings
        {
          data: [{ booking_id: 'booking-1' }],
          error: null,
        }, // existing consultations - already vivified back when it was In Progress
        {
          data: [
            {
              ...consultationRow({ bookingStatus: 'Completed' }),
            },
          ],
          error: null,
        } // consultations select
      );

      const result = await listConsultationQueue();

      expect(result).toHaveLength(1);
      expect(result[0].booking?.status).toBe('Completed');
      const insert = recordedWrites.find(
        (write) => write.table === 'consultations' && write.method === 'insert'
      );
      expect(insert).toBeUndefined();
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

  describe('listVeterinarianPatients (vet-bookings-queue-access)', () => {
    it('returns one row per pet with the owning customer_id and most recent finished-visit date', async () => {
      queueFromResults({
        data: [
          {
            pet_id: 'pet-1',
            booking: {
              customer_id: 'customer-1',
              status: 'Completed',
              completed_at: '2026-07-01T00:00:00.000Z',
              scheduled_start: '2026-06-30T00:00:00.000Z',
            },
          },
          {
            pet_id: 'pet-1',
            booking: {
              customer_id: 'customer-1',
              status: 'Completed',
              completed_at: '2026-08-01T00:00:00.000Z',
              scheduled_start: '2026-07-31T00:00:00.000Z',
            },
          },
        ],
        error: null,
      });

      const result = await listVeterinarianPatients(VET_ID);

      expect(result).toEqual([
        {
          pet_id: 'pet-1',
          customer_id: 'customer-1',
          last_visit_at: '2026-08-01T00:00:00.000Z',
        },
      ]);
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

    describe('ownership (whoever takes it owns it)', () => {
      const claimWrites = () =>
        recordedWrites.filter(
          (write) =>
            write.table === 'consultations' &&
            write.method === 'update' &&
            (write.payload as Record<string, unknown>).accepted_by !== undefined
        );

      it('Start claims an untaken consultation for the vet who pressed it', async () => {
        queueFromResults(
          {
            data: consultationRow({ accepted_by: null }),
            error: null,
          }, // getConsultation
          { data: { id: 'consultation-1' }, error: null }, // claim
          {
            data: bookingFor({ status: 'Pending', payment_status: 'Paid' }),
            error: null,
          }, // startBooking's getRawBookingById
          { data: bookingFor({ status: 'In Progress' }), error: null }, // startBooking's updateBookingRow
          {
            data: consultationRow({
              bookingStatus: 'In Progress',
              accepted_by: OTHER_VET_ID,
              veterinarian_id: OTHER_VET_ID,
            }),
            error: null,
          } // final consultations update
        );

        const result = await updateConsultation({
          requesterId: OTHER_VET_ID,
          consultationId: 'consultation-1',
          input: { status: 'Ongoing' },
        });

        expect(result.accepted_by).toBe(OTHER_VET_ID);
        expect(claimWrites()[0]?.payload).toEqual({
          accepted_by: OTHER_VET_ID,
          veterinarian_id: OTHER_VET_ID,
        });
      });

      it('the first vet to save an In Progress consultation nobody took (reception check-in / walk-in) claims it', async () => {
        queueFromResults(
          {
            data: consultationRow({
              bookingStatus: 'In Progress',
              accepted_by: null,
            }),
            error: null,
          }, // getConsultation
          { data: { id: 'consultation-1' }, error: null }, // claim
          {
            data: consultationRow({ bookingStatus: 'In Progress' }),
            error: null,
          } // final consultations update
        );

        await updateConsultation({
          requesterId: OTHER_VET_ID,
          consultationId: 'consultation-1',
          input: { diagnosis: 'Ear infection' },
        });

        expect(claimWrites()).toHaveLength(1);
      });

      it('another vet cannot edit a consultation someone else took', async () => {
        queueFromResults({
          data: consultationRow({ bookingStatus: 'In Progress' }),
          error: null,
        });

        await expect(
          updateConsultation({
            requesterId: OTHER_VET_ID,
            consultationId: 'consultation-1',
            input: { diagnosis: 'Not mine' },
          })
        ).rejects.toMatchObject({ statusCode: 403 });

        expect(recordedWrites).toHaveLength(0);
      });

      it('another vet cannot complete a consultation someone else took', async () => {
        queueFromResults({
          data: consultationRow({ bookingStatus: 'In Progress' }),
          error: null,
        });

        await expect(
          updateConsultation({
            requesterId: OTHER_VET_ID,
            consultationId: 'consultation-1',
            input: { status: 'Completed', professional_fee: 500 },
          })
        ).rejects.toMatchObject({ statusCode: 403 });

        expect(recordedWrites).toHaveLength(0);
      });

      it('two vets claiming at the same moment: the one whose claim matches no row is refused', async () => {
        queueFromResults(
          {
            data: consultationRow({
              bookingStatus: 'In Progress',
              accepted_by: null,
            }),
            error: null,
          }, // getConsultation - still looked untaken when read
          { data: null, error: null } // claim - the other vet's landed first
        );

        await expect(
          updateConsultation({
            requesterId: OTHER_VET_ID,
            consultationId: 'consultation-1',
            input: { diagnosis: 'Too late' },
          })
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it('releases the claim again when the Start it was made for is refused', async () => {
        queueFromResults(
          {
            data: consultationRow({ accepted_by: null }),
            error: null,
          }, // getConsultation
          { data: { id: 'consultation-1' }, error: null }, // claim
          {
            data: bookingFor({
              status: 'Pending',
              booking_source: 'Online',
              payment_status: 'Pending',
            }),
            error: null,
          }, // startBooking's getRawBookingById - unpaid, so it throws
          { data: null, error: null } // release
        );

        await expect(
          updateConsultation({
            requesterId: OTHER_VET_ID,
            consultationId: 'consultation-1',
            input: { status: 'Ongoing' },
          })
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(claimWrites().at(-1)?.payload).toEqual({
          accepted_by: null,
          veterinarian_id: VET_ID,
        });
      });

      it('any vet may still edit a Pending consultation nobody has taken, without claiming it', async () => {
        queueFromResults(
          {
            data: consultationRow({ accepted_by: null }),
            error: null,
          }, // getConsultation
          { data: consultationRow({ accepted_by: null }), error: null } // final consultations update
        );

        await updateConsultation({
          requesterId: OTHER_VET_ID,
          consultationId: 'consultation-1',
          input: { reason_for_visit: 'Limping' },
        });

        expect(claimWrites()).toHaveLength(0);
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

    it('AC-2: marking Completed delegates to completeBooking, writes a line item for the professional fee/each medication, and returns the post-transition booking status', async () => {
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
        },
      });

      expect(result.booking?.status).toBe('Completed');

      const lineItemsInsert = recordedWrites.find(
        (write) => write.table === 'consultation_line_items'
      );
      expect(lineItemsInsert?.payload).toMatchObject([
        { item_type: 'professional_fee', amount: 500 },
        { item_type: 'medication', description: 'Amoxicillin', amount: 150 },
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

describe('#117 prescription/consultation-results reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('listPrescriptions', () => {
    it('only returns finished consultations that prescribed at least one medication', async () => {
      queueFromResults({
        data: [
          consultationRow({
            id: 'consultation-with-meds',
            bookingStatus: 'Completed',
            medications: [{ name: 'Amoxicillin', dose: '50mg' }],
          }),
          consultationRow({
            id: 'consultation-without-meds',
            bookingStatus: 'Completed',
            medications: [],
          }),
        ],
        error: null,
      });

      const result = await listPrescriptions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('consultation-with-meds');
    });
  });

  // listConsultationResults removed - the standalone Consultation Results
  // list page was replaced by a "Results" row option on the Consultation
  // Queue, which reads a row's own form_responses directly (no new server
  // read needed).

  describe('listPetPrescriptionsForRequester', () => {
    it("returns the owning customer's own pet's prescriptions, trimmed", async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null }, // getPetOwnerId
        {
          data: [
            consultationRow({
              bookingStatus: 'Completed',
              medications: [{ name: 'Amoxicillin', dose: '50mg' }],
            }),
          ],
          error: null,
        } // listPetConsultationHistory
      );

      const result = await listPetPrescriptionsForRequester({
        requesterId: 'customer-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        consultation_id: 'consultation-1',
        medications: [{ name: 'Amoxicillin', dose: '50mg' }],
      });
    });

    it('rejects a non-owner with no staff role as a 403', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null }, // getPetOwnerId
        { data: { role: null }, error: null } // getStaffRoleOrNull
      );

      await expect(
        listPetPrescriptionsForRequester({
          requesterId: 'someone-else',
          petId: 'pet-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects when the pet does not exist as a 404', async () => {
      queueFromResults({ data: null, error: null }); // getPetOwnerId

      await expect(
        listPetPrescriptionsForRequester({
          requesterId: 'customer-1',
          petId: 'missing-pet',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listPetConsultationResultsForRequester', () => {
    it('lets any staff role read a pet it does not own', async () => {
      queueFromResults(
        { data: { customer_id: 'customer-1' }, error: null }, // getPetOwnerId
        { data: { role: 'Receptionist' }, error: null }, // getStaffRoleOrNull
        {
          data: [
            consultationRow({
              bookingStatus: 'Completed',
              form_responses: [
                {
                  template_id: 'tmpl-1',
                  template_name: 'Dental Check',
                  filled_at: '2026-07-19T02:00:00.000Z',
                  fields: [],
                },
              ],
            }),
          ],
          error: null,
        } // listPetConsultationHistory
      );

      const result = await listPetConsultationResultsForRequester({
        requesterId: 'receptionist-1',
        petId: 'pet-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0].form_responses[0].template_name).toBe('Dental Check');
    });
  });
});
