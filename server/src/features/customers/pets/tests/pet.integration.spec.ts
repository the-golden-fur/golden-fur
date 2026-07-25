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

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
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
const VALID_PET_PAYLOAD = {
  name: 'Buddy',
  pet_type: 'Dog',
  weight_class: 'M',
  coat_type: 'SC',
};

describe('pet CRUD (Issue #32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });

    it('AC-2: returns 400 with a missing required field', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .post('/customers/customer-1/pets')
        .set('Authorization', 'Bearer token')
        .send({ name: 'Buddy', pet_type: 'Dog' });

      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
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
  });
});
