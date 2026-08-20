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

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Same queued-builder mock as staff.integration.spec.ts: one resolved result
 * per supabase.from(...) call, in call order (requireRole's staff_profiles
 * lookup first, then the controller/service's own queries), chainable on
 * every method the maintenance services use and thenable for bare awaits.
 */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.or = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
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

const BRANCH_ID = '11111111-1111-4111-a111-111111111111';

const SERVICE = {
  id: 'service-1',
  category: 'Veterinary',
  name: 'Wellness Exam',
  base_price: 500,
  is_active: true,
  service_branch_availability: [],
};

const PRICING_CONFIGURATION = {
  id: 'pricing-config-1',
  size_s_multiplier: 1,
  size_m_multiplier: 1.1,
  size_l_multiplier: 1.25,
  size_xl_multiplier: 1.5,
  long_coat_addon: 0,
};

const PACKAGE_PRICING_CONFIGURATION = {
  id: 'package-pricing-1',
  bundle_discount_percentage: 0.1,
};

const PROMO = {
  id: 'promo-1',
  name: 'Summer Grooming Deal',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  condition_note: null,
  discount_type: 'Percentage',
  value: 15,
  scope_type: 'all_services',
  is_active: true,
  promo_scope: [],
  promo_branch_availability: [
    { promo_id: 'promo-1', branch_id: BRANCH_ID, is_available: true },
  ],
};

describe('maintenance HTTP surface (Issues #40-#42)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication on every maintenance route', async () => {
    const res = await request(app).get('/maintenance/services');

    expect(res.status).toBe(401);
  });

  describe('services (#40)', () => {
    it('AC-5: GET (active services) succeeds for any authenticated staff role', async () => {
      mockCaller('groomer-1');
      queueFromResults(
        { data: { role: 'Groomer' }, error: null },
        { data: [SERVICE], error: null },
        { data: PRICING_CONFIGURATION, error: null }
      );

      const res = await request(app)
        .get('/maintenance/services')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.services).toHaveLength(1);
    });

    it('AC-5: a non-Admin/Superadmin role receives 403 on a write endpoint', async () => {
      mockCaller('groomer-1');
      queueFromResults({ data: { role: 'Groomer' }, error: null });

      const res = await request(app)
        .post('/maintenance/services')
        .set('Authorization', 'Bearer token')
        .send({ name: 'Bath', category: 'Grooming', base_price: 300 });

      expect(res.status).toBe(403);
    });

    it('AC-1: an Admin creates a service in one call', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'service-1' }, error: null }, // insert
        { data: [{ id: BRANCH_ID }], error: null }, // branches
        { data: null, error: null }, // availability insert
        { data: SERVICE, error: null }, // final fetch
        { data: PRICING_CONFIGURATION, error: null } // pricing configuration
      );

      const res = await request(app)
        .post('/maintenance/services')
        .set('Authorization', 'Bearer token')
        .send({
          name: 'Wellness Exam',
          category: 'Veterinary',
          base_price: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body.service.id).toBe('service-1');
    });

    it('rejects an invalid create payload with 400 before touching the service layer', async () => {
      mockCaller('admin-1');
      queueFromResults({ data: { role: 'Admin' }, error: null });

      const res = await request(app)
        .post('/maintenance/services')
        .set('Authorization', 'Bearer token')
        .send({ name: '', category: 'Nonsense', base_price: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid payload');
    });

    it('AC-4: an Admin toggles per-branch availability via the dedicated endpoint', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'service-1' }, error: null }, // service lookup
        {
          data: {
            service_id: 'service-1',
            branch_id: BRANCH_ID,
            is_available: false,
          },
          error: null,
        } // upsert
      );

      const res = await request(app)
        .patch('/maintenance/services/service-1/branch-availability')
        .set('Authorization', 'Bearer token')
        .send({ branch_id: BRANCH_ID, is_available: false });

      expect(res.status).toBe(200);
      expect(res.body.availability.is_available).toBe(false);
    });
  });

  describe('packages (#41)', () => {
    it('AC-1: an Admin creates a package available at one or more branches', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        {
          data: [
            { id: '22222222-2222-4222-a222-222222222222' },
            { id: '33333333-3333-4333-a333-333333333333' },
          ],
          error: null,
        }, // active-services check
        { data: { id: 'package-1' }, error: null }, // insert
        { data: null, error: null }, // links
        { data: null, error: null }, // branch availability
        {
          data: {
            id: 'package-1',
            name: 'Golden Package',
            is_active: true,
            package_services: [
              {
                service_id: '22222222-2222-4222-a222-222222222222',
                services: { base_price: 300 },
              },
              {
                service_id: '33333333-3333-4333-a333-333333333333',
                services: { base_price: 400 },
              },
            ],
            package_branch_availability: [
              {
                package_id: 'package-1',
                branch_id: BRANCH_ID,
                is_available: true,
              },
            ],
          },
          error: null,
        }, // final fetch
        { data: PACKAGE_PRICING_CONFIGURATION, error: null } // pricing configuration
      );

      const res = await request(app)
        .post('/maintenance/packages')
        .set('Authorization', 'Bearer token')
        .send({
          branch_ids: [BRANCH_ID],
          name: 'Golden Package',
          service_ids: [
            '22222222-2222-4222-a222-222222222222',
            '33333333-3333-4333-a333-333333333333',
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.package.name).toBe('Golden Package');
    });

    it('AC-5: a Receptionist can list packages but not create one', async () => {
      mockCaller('reception-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: [], error: null },
        { data: PACKAGE_PRICING_CONFIGURATION, error: null }
      );

      const listRes = await request(app)
        .get('/maintenance/packages')
        .set('Authorization', 'Bearer token');

      expect(listRes.status).toBe(200);

      queueFromResults({ data: { role: 'Receptionist' }, error: null });

      const createRes = await request(app)
        .post('/maintenance/packages')
        .set('Authorization', 'Bearer token')
        .send({
          branch_ids: [BRANCH_ID],
          name: 'X',
          service_ids: [
            '22222222-2222-4222-a222-222222222222',
            '33333333-3333-4333-a333-333333333333',
          ],
        });

      expect(createRes.status).toBe(403);
    });

    it("custom change: an Admin toggles a package's branch availability", async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'package-1' }, error: null }, // existence check
        {
          data: {
            package_id: 'package-1',
            branch_id: BRANCH_ID,
            is_available: false,
          },
          error: null,
        }
      );

      const res = await request(app)
        .patch('/maintenance/packages/package-1/branch-availability')
        .set('Authorization', 'Bearer token')
        .send({ branch_id: BRANCH_ID, is_available: false });

      expect(res.status).toBe(200);
      expect(res.body.availability.is_available).toBe(false);
    });
  });

  describe('promos (#42)', () => {
    it('AC-1: an Admin creates a date-bounded promo', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { id: 'promo-1' }, error: null }, // insert
        { data: null, error: null }, // insert branch availability
        { data: PROMO, error: null } // final fetch
      );

      const res = await request(app)
        .post('/maintenance/promos')
        .set('Authorization', 'Bearer token')
        .send({
          name: 'Summer Grooming Deal',
          start_date: '2026-08-01',
          end_date: '2026-08-31',
          discount_type: 'Percentage',
          value: 15,
          scope_type: 'all_services',
          branch_ids: [BRANCH_ID],
        });

      expect(res.status).toBe(201);
      expect(res.body.promo.id).toBe('promo-1');
    });

    it('AC-4: an Admin manually deactivates a promo via PATCH', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: PROMO, error: null }, // existing
        { data: null, error: null }, // update
        { data: { ...PROMO, is_active: false }, error: null }
      );

      const res = await request(app)
        .patch('/maintenance/promos/promo-1')
        .set('Authorization', 'Bearer token')
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.promo.is_active).toBe(false);
    });

    it('AC-6: a non-admin write on promos is rejected with 403', async () => {
      mockCaller('cashier-1');
      queueFromResults({ data: { role: 'Cashier' }, error: null });

      const res = await request(app)
        .patch('/maintenance/promos/promo-1')
        .set('Authorization', 'Bearer token')
        .send({ is_active: false });

      expect(res.status).toBe(403);
    });

    it('GET promos succeeds for any staff role', async () => {
      mockCaller('reception-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: [PROMO], error: null }
      );

      const res = await request(app)
        .get('/maintenance/promos')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.promos).toHaveLength(1);
    });
  });
});
