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

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
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

const MANDATED_DISCOUNT = {
  id: 'discount-sc',
  name: 'Senior Citizen Discount',
  is_mandated: true,
  discount_type: 'Percentage',
  value: 20,
  scope_type: 'category',
  scope_service_id: null,
  scope_package_id: null,
  scope_category: 'Veterinary',
  is_active: false,
  discount_branch_availability: [
    { discount_id: 'discount-sc', branch_id: BRANCH_ID, is_available: true },
  ],
};

describe('discounts HTTP surface (Issue #43)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/discounts');

    expect(res.status).toBe(401);
  });

  it('AC-5: GET succeeds for any authenticated staff role', async () => {
    mockCaller('cashier-1');
    queueFromResults(
      { data: { role: 'Cashier' }, error: null },
      { data: [MANDATED_DISCOUNT], error: null }
    );

    const res = await request(app)
      .get('/discounts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.discounts).toHaveLength(1);
  });

  it('AC-5: a non-Admin/Superadmin role receives 403 on any write endpoint', async () => {
    mockCaller('cashier-1');
    queueFromResults({ data: { role: 'Cashier' }, error: null });

    const res = await request(app)
      .patch('/discounts/discount-sc')
      .set('Authorization', 'Bearer token')
      .send({ value: 25 });

    expect(res.status).toBe(403);
  });

  it('AC-1: an Admin creates a category-scoped custom discount', async () => {
    mockCaller('admin-1');
    const created = {
      ...MANDATED_DISCOUNT,
      id: 'discount-custom',
      name: 'Loyalty Discount',
      is_mandated: false,
      value: 10,
    };
    queueFromResults(
      { data: { role: 'Admin' }, error: null },
      { data: created, error: null }, // discount insert
      { data: null, error: null }, // availability insert
      { data: created, error: null } // final getDiscountById
    );

    const res = await request(app)
      .post('/discounts')
      .set('Authorization', 'Bearer token')
      .send({
        branch_ids: [BRANCH_ID],
        name: 'Loyalty Discount',
        discount_type: 'Percentage',
        value: 10,
        scope_type: 'category',
        scope_category: 'Veterinary',
      });

    expect(res.status).toBe(201);
    expect(res.body.discount.is_mandated).toBe(false);
  });

  it('unify active/available: an Admin activates a mandated (category-scoped) discount via branch availability, not PATCH /discounts/:id', async () => {
    mockCaller('admin-1');
    queueFromResults(
      { data: { role: 'Admin' }, error: null },
      { data: { id: 'discount-sc' }, error: null }, // existence lookup
      {
        data: {
          discount_id: 'discount-sc',
          branch_id: BRANCH_ID,
          is_available: true,
        },
        error: null,
      }, // upsert
      { data: [{ is_available: true }], error: null }, // all-rows read for sync
      { data: null, error: null } // is_active sync update
    );

    const res = await request(app)
      .patch('/discounts/discount-sc/branch-availability')
      .set('Authorization', 'Bearer token')
      .send({ branch_id: BRANCH_ID, is_available: true });

    expect(res.status).toBe(200);
    expect(res.body.availability.is_available).toBe(true);
  });

  it('unify active/available: PATCH /discounts/:id rejects is_active - it is no longer independently settable', async () => {
    mockCaller('admin-1');
    queueFromResults({ data: { role: 'Admin' }, error: null });

    const res = await request(app)
      .patch('/discounts/discount-sc')
      .set('Authorization', 'Bearer token')
      .send({ is_active: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it("AC-3: a PATCH changing a mandated discount's name is rejected", async () => {
    mockCaller('admin-1');
    queueFromResults(
      { data: { role: 'Admin' }, error: null },
      { data: MANDATED_DISCOUNT, error: null }
    );

    const res = await request(app)
      .patch('/discounts/discount-sc')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Renamed' });

    expect(res.status).toBe(400);
  });

  it('AC-3: a PATCH touching is_mandated is rejected by the strict validator', async () => {
    mockCaller('admin-1');
    queueFromResults({ data: { role: 'Admin' }, error: null });

    const res = await request(app)
      .patch('/discounts/discount-sc')
      .set('Authorization', 'Bearer token')
      .send({ is_mandated: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });
});
