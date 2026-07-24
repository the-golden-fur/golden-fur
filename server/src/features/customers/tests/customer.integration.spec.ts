import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Mirrors staff.integration.spec.ts's queueFromResults: one queued result
 * per call to supabase.from(...), chainable on every method the customer/
 * pet controllers use, and thenable so a bare `await query` (list endpoints,
 * no terminal .maybeSingle()) also resolves.
 */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
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

describe('customer profile CRUD (Issue #31)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /customers/:id', () => {
    it("AC-1: returns the caller's own profile for an authenticated customer", async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'customer-1', full_name: 'Jane Dela Cruz' },
        error: null,
      });

      const res = await request(app)
        .get('/customers/customer-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ id: 'customer-1' });
    });

    it('AC-2: returns 403 for a different customer when the caller is not staff', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/customers/customer-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('AC-2: allows a Receptionist to view a different customer', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { id: 'customer-2', full_name: 'Walk-in' }, error: null }
      );

      const res = await request(app)
        .get('/customers/customer-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ id: 'customer-2' });
    });

    it('allows a Groomer to view a different customer (needed to resolve owner names in the Grooming Queue)', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Groomer' }, error: null },
        { data: { id: 'customer-2', full_name: 'Walk-in' }, error: null }
      );

      const res = await request(app)
        .get('/customers/customer-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ id: 'customer-2' });
    });

    it('allows a Veterinarian to view a different customer (needed to resolve owner names in the Veterinary Console)', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Veterinarian' }, error: null },
        { data: { id: 'customer-2', full_name: 'Walk-in' }, error: null }
      );

      const res = await request(app)
        .get('/customers/customer-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ id: 'customer-2' });
    });
  });

  describe('GET /customers', () => {
    it('AC-3: is available to a Receptionist', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: [{ id: 'customer-1' }, { id: 'customer-2' }], error: null }
      );

      const res = await request(app)
        .get('/customers')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.customers).toHaveLength(2);
    });

    it('AC-3: returns 403 for a Groomer', async () => {
      mockCaller('staff-1');
      queueFromResults({ data: { role: 'Groomer' }, error: null });

      const res = await request(app)
        .get('/customers')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('AC-3: returns 403 for a customer', async () => {
      mockCaller('customer-1');
      queueFromResults(NOT_STAFF);

      const res = await request(app)
        .get('/customers')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /customers/:id', () => {
    it('AC-4: updates own profile with a valid payload', async () => {
      mockCaller('customer-1');
      queueFromResults({
        data: { id: 'customer-1', full_name: 'Updated Name' },
        error: null,
      });

      const res = await request(app)
        .patch('/customers/customer-1')
        .set('Authorization', 'Bearer token')
        .send({ full_name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.customer.full_name).toBe('Updated Name');
    });

    it('AC-5: rejects an account_email field with 400', async () => {
      mockCaller('customer-1');

      const res = await request(app)
        .patch('/customers/customer-1')
        .set('Authorization', 'Bearer token')
        .send({ account_email: 'new@example.com' });

      expect(res.status).toBe(400);
    });

    it('AC-6: allows an authorized staff member to update on behalf of a customer', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        {
          data: { id: 'customer-2', full_name: 'Updated By Staff' },
          error: null,
        }
      );

      const res = await request(app)
        .patch('/customers/customer-2')
        .set('Authorization', 'Bearer token')
        .send({ full_name: 'Updated By Staff' });

      expect(res.status).toBe(200);
    });

    it('AC-6: returns 403 for an unauthorized staff role acting on behalf of a customer', async () => {
      mockCaller('staff-1');
      queueFromResults({ data: { role: 'Cashier' }, error: null });

      const res = await request(app)
        .patch('/customers/customer-2')
        .set('Authorization', 'Bearer token')
        .send({ full_name: 'Nope' });

      expect(res.status).toBe(403);
    });
  });
});
