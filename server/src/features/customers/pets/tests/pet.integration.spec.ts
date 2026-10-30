import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../../app.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

// Book before assessment (20261013264): covered by its own spec - mocked so
// its queries stay out of these tests' sequential mock queues.
vi.mock('../../../booking/services/assessmentReprice.service.ts', () => ({
  repriceBookingsAwaitingAssessment: vi.fn(),
}));

import { repriceBookingsAwaitingAssessment } from '../../../booking/services/assessmentReprice.service.ts';

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  method: string;
  payload: unknown;
}

const recordedWrites: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn((payload: unknown) => {
      recordedWrites.push({ method: 'insert', payload });
      return builder;
    });
    builder.update = vi.fn((payload: unknown) => {
      recordedWrites.push({ method: 'update', payload });
      return builder;
    });
    builder.delete = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
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

const NOT_STAFF: QueryResult = { data: null, error: null };
// Customer-facing payload - weight_class/coat_type are staff-only (client
// interview finding: a customer could otherwise manipulate Grooming price /
// Hotel cage size by under-reporting either field). See pet.validator.ts.
const VALID_PET_PAYLOAD = {
  name: 'Buddy',
  pet_type: 'Dog',
  gender: 'Male',
};
// pet_weight_class_configuration singleton - cut-offs plus the recordable
// weight range (pet weight limits, 20261030288).
const WEIGHT_CONFIG = {
  id: 'wcc-1',
  m_min_kg: 9.5,
  l_min_kg: 22,
  xl_min_kg: 41,
  min_weight_kg: 0.1,
  max_weight_kg: 156,
};

const VALID_STAFF_PET_PAYLOAD = {
  ...VALID_PET_PAYLOAD,
  weight_class: 'M',
  coat_type: 'SC',
};

describe('pet CRUD (Issue #32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('POST /customers/:customerId/pets', () => {
    it('AC-1: creates a pet when all required fields are present', async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'pet-1', customer_id: 'customer-1', ...VALID_PET_PAYLOAD },
        error: null,
      });

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send(VALID_PET_PAYLOAD);

      expect(res.status).toBe(201);
      expect(res.body.pet).toMatchObject({ id: 'pet-1' });
      // No weight_class/coat_type submitted at all - never stamped.
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_by');
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_at');
    });

    it('AC-2: returns 400 with a missing required field', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send({ name: 'Buddy' });

      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    it('rejects a date of birth older than the configured age limit', async () => {
      mockCaller('customer-1');
      // pet_age_configuration singleton
      queueFromResults({
        data: { id: 'pac-1', max_age_years: 20 },
        error: null,
      });

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send({ ...VALID_PET_PAYLOAD, date_of_birth: '2000-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/older than 20 years/);
      expect(recordedWrites).toHaveLength(0);
    });

    it('creates a pet whose date of birth is within the configured age limit', async () => {
      mockCaller('customer-1');
      queueFromResults(
        { data: { id: 'pac-1', max_age_years: 20 }, error: null },
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null }
      );

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send({ ...VALID_PET_PAYLOAD, date_of_birth: '2020-01-01' });

      expect(res.status).toBe(201);
    });

    it('rejects weight_class/coat_type from a customer self-service create (staff-only, client interview finding)', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send({ ...VALID_PET_PAYLOAD, weight_class: 'M', coat_type: 'SC' });

      expect(res.status).toBe(400);
    });

    it('accepts weight_class/coat_type from an authorized staff member creating on behalf of a customer', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        {
          data: {
            id: 'pet-1',
            customer_id: 'customer-2',
            ...VALID_STAFF_PET_PAYLOAD,
          },
          error: null,
        }
      );

      const res = await request(app)
        .post('/customers/customer-2/pets')
        .set('Authorization', 'Bearer token')
        .send(VALID_STAFF_PET_PAYLOAD);

      expect(res.status).toBe(201);
      // A staff-authorized create with both fields set is stamped as
      // assessed immediately - see resolveAssessmentStamp in
      // pet.controller.ts (the DB trigger no longer stamps this - see
      // ...075_m02_pets_assessment_trigger_fix.sql).
      expect(recordedWrites[0]?.payload).toMatchObject({
        assessed_by: 'staff-1',
      });
      expect(
        (recordedWrites[0]?.payload as { assessed_at?: string }).assessed_at
      ).toBeTruthy();
    });

    it('AC-5: allows an authorized staff member to create a pet on behalf of a customer', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        {
          data: {
            id: 'pet-1',
            customer_id: 'customer-2',
            ...VALID_PET_PAYLOAD,
          },
          error: null,
        }
      );

      const res = await request(app)
        .post('/customers/customer-2/pets')
        .set('Authorization', 'Bearer token')
        .send(VALID_PET_PAYLOAD);

      expect(res.status).toBe(201);
    });
  });

  describe('GET /customers/:customerId/pets', () => {
    it("AC-3: returns only the owning customer's pets", async () => {
      mockCaller('customer-1');
      queueFromResults({ data: [{ id: 'pet-1' }], error: null });

      const res = await request(app)
        .get('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.pets).toHaveLength(1);
    });

    it('AC-3: returns 403 for a different customer', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/customers/customer-2/pets')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });
  });

  describe('archived pets (Pet Manager: archive + customer restore)', () => {
    const ARCHIVED = {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Buddy',
      is_active: false,
      archived_at: '2026-10-01T00:00:00.000Z',
    };

    it('lets a customer list their own archived pets', async () => {
      mockCaller('customer-1');
      queueFromResults({ data: [ARCHIVED], error: null });

      const res = await request(app)
        .get('/customers/customer-1/pets/archived')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.pets).toHaveLength(1);
    });

    it("refuses another customer's archived pets", async () => {
      mockCaller('customer-2');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/customers/customer-1/pets/archived')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('keeps the all-customers archive list staff-only', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/pets/archived')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('lets the owner restore their pet, reactivating it', async () => {
      mockCaller('customer-1');
      queueFromResults(
        { data: ARCHIVED, error: null }, // resolvePet
        { data: ARCHIVED, error: null }, // restorePet's lookup
        { data: null, error: null } // update
      );

      const res = await request(app)
        .post('/pets/pet-1/restore')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(204);
      expect(recordedWrites[0]?.payload).toMatchObject({
        is_active: true,
        archived_at: null,
        archive_reason: null,
      });
    });

    it("refuses to restore someone else's pet for a non-staff caller", async () => {
      mockCaller('customer-2');
      queueFromResults({ data: ARCHIVED, error: null }, NOT_STAFF);

      const res = await request(app)
        .post('/pets/pet-1/restore')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
      expect(recordedWrites).toHaveLength(0);
    });

    it('still lets archive staff restore any pet', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: ARCHIVED, error: null },
        { data: { role: 'Admin' }, error: null },
        { data: ARCHIVED, error: null },
        { data: null, error: null }
      );

      const res = await request(app)
        .post('/pets/pet-1/restore')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(204);
    });

    it('404s restoring a pet that does not exist', async () => {
      mockCaller('customer-1');
      queueFromResults({ data: null, error: null });

      const res = await request(app)
        .post('/pets/missing/restore')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });
  });

  describe('GET/PATCH/DELETE /pets/:id', () => {
    it('AC-4: GET succeeds for the owning customer', async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'pet-1', customer_id: 'customer-1' },
        error: null,
      });

      const res = await request(app)
        .get('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
    });

    it('AC-4: GET returns 403 for a different customer', async () => {
      mockCaller('customer-2');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        NOT_STAFF
      );

      const res = await request(app)
        .get('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it("allows a Groomer to GET a different customer's pet (needed to resolve pet names in the Grooming Queue)", async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Groomer' }, error: null }
      );

      const res = await request(app)
        .get('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
    });

    it("allows a Veterinarian to GET a different customer's pet (needed to resolve pet names in the Veterinary Console)", async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Veterinarian' }, error: null }
      );

      const res = await request(app)
        .get('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
    });

    it("allows a Cashier to GET a different customer's pet (needed to resolve pet names when viewing bookings / taking payment)", async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Cashier' }, error: null }
      );

      const res = await request(app)
        .get('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
    });

    it('AC-4: PATCH succeeds for authorized staff', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'pet-1', name: 'New Name' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      // Unrelated field change - never re-stamps.
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_by');
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_at');
    });

    it('accepts weight_class/coat_type when PATCHed by authorized staff, and stamps assessed_by/assessed_at', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Admin' }, error: null },
        {
          data: { id: 'pet-1', weight_class: 'M', coat_type: 'SC' },
          error: null,
        }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_class: 'M', coat_type: 'SC' });

      expect(res.status).toBe(200);
      expect(recordedWrites[0]?.payload).toMatchObject({
        weight_class: 'M',
        coat_type: 'SC',
        assessed_by: 'staff-1',
      });
      expect(
        (recordedWrites[0]?.payload as { assessed_at?: string }).assessed_at
      ).toBeTruthy();
    });

    // Custom change (book before assessment, 20261013264).
    describe('bookings made before the pet was assessed', () => {
      beforeEach(() => {
        vi.mocked(repriceBookingsAwaitingAssessment).mockReset();
        vi.mocked(repriceBookingsAwaitingAssessment).mockResolvedValue({
          repriced: [{ bookingId: 'booking-1', totalPrice: 425 }],
          failed: [],
        });
      });

      function queueStaffPatch() {
        mockCaller('staff-1');
        queueFromResults(
          { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
          { data: { role: 'Front Desk' }, error: null },
          {
            data: { id: 'pet-1', weight_class: 'M', coat_type: 'SC' },
            error: null,
          }
        );
      }

      it("Front Desk recording the weight and coat reprices the pet's waiting bookings and reports the result", async () => {
        queueStaffPatch();

        const res = await request(app)
          .patch('/pets/pet-1')
          .set('Authorization', 'Bearer token')
          .send({ weight_class: 'M', coat_type: 'SC' });

        expect(res.status).toBe(200);
        expect(repriceBookingsAwaitingAssessment).toHaveBeenCalledWith('pet-1');
        expect(res.body.assessment_reprice).toEqual({
          repriced: [{ bookingId: 'booking-1', totalPrice: 425 }],
          failed: [],
        });
      });

      it('an edit that leaves the weight and coat alone reprices nothing', async () => {
        queueStaffPatch();

        const res = await request(app)
          .patch('/pets/pet-1')
          .set('Authorization', 'Bearer token')
          .send({ name: 'New Name' });

        expect(res.status).toBe(200);
        expect(repriceBookingsAwaitingAssessment).not.toHaveBeenCalled();
        expect(res.body).not.toHaveProperty('assessment_reprice');
      });

      it('still saves the assessment when the reprice itself blows up', async () => {
        vi.mocked(repriceBookingsAwaitingAssessment).mockRejectedValue(
          new Error('boom')
        );
        vi.spyOn(console, 'error').mockImplementation(() => {});
        queueStaffPatch();

        const res = await request(app)
          .patch('/pets/pet-1')
          .set('Authorization', 'Bearer token')
          .send({ weight_class: 'M', coat_type: 'SC' });

        expect(res.status).toBe(200);
        expect(res.body.pet).toMatchObject({ weight_class: 'M' });
        expect(res.body.assessment_reprice).toEqual({
          repriced: [],
          failed: [],
        });
      });
    });

    it('does not re-check the age limit when the date of birth is unchanged', async () => {
      mockCaller('customer-1');
      queueFromResults(
        {
          data: {
            id: 'pet-1',
            customer_id: 'customer-1',
            date_of_birth: '2000-01-01',
          },
          error: null,
        },
        // No pet_age_configuration read - this is the update's own result.
        { data: { id: 'pet-1', name: 'Rex' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ name: 'Rex', date_of_birth: '2000-01-01' });

      expect(res.status).toBe(200);
      expect(recordedWrites[0]?.payload).toMatchObject({ name: 'Rex' });
    });

    it('rejects a changed date of birth older than the configured age limit', async () => {
      mockCaller('customer-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { id: 'pac-1', max_age_years: 10 }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ date_of_birth: '2005-06-01' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/older than 10 years/);
      expect(recordedWrites).toHaveLength(0);
    });

    it('rejects a new weight outside the configured weight limits', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Receptionist' }, error: null },
        { data: WEIGHT_CONFIG, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 200, coat_type: 'SC' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'Invalid weight - enter between 0.1 kg and 156 kg.'
      );
      expect(recordedWrites).toHaveLength(0);
    });

    it('falls back to the default limits when the config row has none (migration not applied yet)', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Receptionist' }, error: null },
        // Pre-20261030288 row: cut-offs only, no min/max_weight_kg.
        {
          data: { id: 'wcc-1', m_min_kg: 9.5, l_min_kg: 22, xl_min_kg: 41 },
          error: null,
        },
        { data: { id: 'pet-1', weight_kg: 15 }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 15 });

      expect(res.status).toBe(200);
    });

    it('names the weight instead of "Invalid payload" when the validator rejects it', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Receptionist' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 9998678 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'Invalid weight - please check the weight entered.'
      );
    });

    it('does not re-check an unchanged stored weight against the limits', async () => {
      mockCaller('staff-1');
      queueFromResults(
        {
          data: { id: 'pet-1', customer_id: 'customer-1', weight_kg: 200 },
          error: null,
        },
        { data: { role: 'Receptionist' }, error: null },
        // No config read - this is the update's own result.
        { data: { id: 'pet-1', name: 'Tank' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ name: 'Tank', weight_kg: 200 });

      expect(res.status).toBe(200);
    });

    it('derives weight_class from a submitted weight_kg and stamps the assessment', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Receptionist' }, error: null },
        // pet_weight_class_configuration singleton
        { data: WEIGHT_CONFIG, error: null },
        {
          data: { id: 'pet-1', weight_kg: 14, weight_class: 'M' },
          error: null,
        }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 14, coat_type: 'SC' });

      expect(res.status).toBe(200);
      expect(recordedWrites[0]?.payload).toMatchObject({
        weight_kg: 14,
        weight_class: 'M',
        coat_type: 'SC',
        assessed_by: 'staff-1',
      });
    });

    it('keeps an explicit weight_class override even when weight_kg is also sent', async () => {
      mockCaller('staff-1');
      queueFromResults(
        {
          data: {
            id: 'pet-1',
            customer_id: 'customer-1',
            weight_class: 'M',
            coat_type: 'SC',
          },
          error: null,
        },
        { data: { role: 'Admin' }, error: null },
        // Still read - a new weight is range-checked even when the class is
        // overridden (pet weight limits).
        { data: WEIGHT_CONFIG, error: null },
        { data: { id: 'pet-1', weight_class: 'S' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 40, weight_class: 'S' });

      expect(res.status).toBe(200);
      // Explicit override wins - class is 'S', not the derived 'XL'.
      expect(recordedWrites[0]?.payload).toMatchObject({
        weight_kg: 40,
        weight_class: 'S',
      });
    });

    it('rejects weight_kg when the pet owner PATCHes it (staff-only)', async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'pet-1', customer_id: 'customer-1' },
        error: null,
      });

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_kg: 5 });

      expect(res.status).toBe(400);
    });

    it('does not re-stamp when staff resends the same weight_class/coat_type the pet already has (no real change)', async () => {
      mockCaller('staff-1');
      queueFromResults(
        {
          data: {
            id: 'pet-1',
            customer_id: 'customer-1',
            weight_class: 'M',
            coat_type: 'SC',
          },
          error: null,
        },
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'pet-1', name: 'New Name' }, error: null }
      );

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ name: 'New Name', weight_class: 'M', coat_type: 'SC' });

      expect(res.status).toBe(200);
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_by');
      expect(recordedWrites[0]?.payload).not.toHaveProperty('assessed_at');
    });

    it("rejects weight_class/coat_type when the pet's own owner PATCHes it (staff-only, client interview finding)", async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'pet-1', customer_id: 'customer-1' },
        error: null,
      });

      const res = await request(app)
        .patch('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ weight_class: 'M' });

      expect(res.status).toBe(400);
    });

    it('AC-4: DELETE returns 403 for an unauthorized staff role', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { id: 'pet-1', customer_id: 'customer-1' }, error: null },
        { data: { role: 'Groomer' }, error: null }
      );

      const res = await request(app)
        .delete('/pets/pet-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('DELETE saves the delete reason the owner picked', async () => {
      mockCaller('customer-1');
      const inactivePet = {
        id: 'pet-1',
        customer_id: 'customer-1',
        is_active: false,
      };
      queueFromResults(
        { data: inactivePet, error: null },
        { data: inactivePet, error: null },
        { data: null, error: null }
      );

      const res = await request(app)
        .delete('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ reason: 'other', reasonOther: '  Moving abroad  ' });

      expect(res.status).toBe(204);
      expect(recordedWrites[0]?.payload).toMatchObject({
        archive_reason: 'other',
        archive_reason_other: 'Moving abroad',
      });
    });

    it('DELETE drops reasonOther when the reason is not "other"', async () => {
      mockCaller('customer-1');
      const inactivePet = {
        id: 'pet-1',
        customer_id: 'customer-1',
        is_active: false,
      };
      queueFromResults(
        { data: inactivePet, error: null },
        { data: inactivePet, error: null },
        { data: null, error: null }
      );

      const res = await request(app)
        .delete('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ reason: 'rehomed', reasonOther: 'ignored' });

      expect(res.status).toBe(204);
      expect(recordedWrites[0]?.payload).toMatchObject({
        archive_reason: 'rehomed',
        archive_reason_other: null,
      });
    });

    it('DELETE returns 400 for an unknown delete reason', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .delete('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ reason: 'bored' });

      expect(res.status).toBe(400);
      expect(recordedWrites).toHaveLength(0);
    });

    it('vaccination review rejects an unknown decision with 400', async () => {
      mockCaller('staff-1');

      const res = await request(app)
        .post('/pets/pet-1/vaccination-records/record-1/review')
        .set('Authorization', 'Bearer token')
        .send({ decision: 'approve' });

      expect(res.status).toBe(400);
    });

    it('the pending vaccination queue is staff-only', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/vaccination-records/pending')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('an owner adding a vaccination without the card photo gets 400', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF, {
        data: { id: 'pet-1', customer_id: 'customer-1' },
        error: null,
      });

      const res = await request(app)
        .post('/pets/pet-1/vaccination-records')
        .set('Authorization', 'Bearer token')
        .field('vaccine_name', 'Rabies')
        .field('date_administered', '2026-07-01');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/card/i);
    });

    it('DELETE returns 400 for "other" with blank text', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .delete('/pets/pet-1')
        .set('Authorization', 'Bearer token')
        .send({ reason: 'other', reasonOther: '   ' });

      expect(res.status).toBe(400);
      expect(recordedWrites).toHaveLength(0);
    });
  });
});
