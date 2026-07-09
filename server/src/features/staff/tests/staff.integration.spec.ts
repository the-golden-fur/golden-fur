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
 * `staff_profiles` is queried multiple times per request (role lookup by
 * requireRole, branch lookup by requireBranch, then the controller's own
 * query/queries) via the same service-role `supabase` singleton, each with a
 * different chain shape (`.single()`, `.maybeSingle()`, or awaited directly
 * after `.select()`/`.eq()`). This queues one resolved result per call to
 * `supabase.from(...)`, in call order, behind a builder that is chainable on
 * every method the controllers use and thenable so a bare `await query` (no
 * terminal `.single()`) also resolves.
 */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);
    return builder as never;
  });

  return builders;
}

function mockCaller(sub: string) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: sub } },
    error: null,
  } as never);
  vi.spyOn(jwt, 'decode').mockReturnValue({ sub } as never);
}

describe('staff profile CRUD (Issue #22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /staff/:id', () => {
    it("AC-1: returns the caller's own profile for any authenticated staff role", async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null },
        {
          data: {
            id: 'staff-1',
            branch_id: 'branch-a',
            role: 'Receptionist',
            display_name: 'Staff One',
          },
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff/staff-1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.staff).toMatchObject({ id: 'staff-1' });
    });

    it('AC-2: returns 403 for a different staff_id when the caller is not Admin/Superadmin', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null }
      );

      const res = await request(app)
        .get('/staff/staff-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('AC-2: allows an Admin to view a different staff_id within their own branch', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { role: 'Admin', branch_id: 'branch-a' }, error: null },
        {
          data: { id: 'staff-2', branch_id: 'branch-a', role: 'Receptionist' },
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff/staff-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.staff).toMatchObject({ id: 'staff-2' });
    });

    it('AC-2: denies an Admin viewing a staff_id outside their own branch', async () => {
      mockCaller('admin-1');
      queueFromResults(
        { data: { role: 'Admin' }, error: null },
        { data: { role: 'Admin', branch_id: 'branch-a' }, error: null },
        {
          data: { id: 'staff-2', branch_id: 'branch-b', role: 'Receptionist' },
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff/staff-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(403);
    });

    it('AC-2: allows a Superadmin to view a staff_id in any branch', async () => {
      mockCaller('superadmin-1');
      queueFromResults(
        { data: { role: 'Superadmin' }, error: null },
        { data: { role: 'Superadmin', branch_id: 'branch-a' }, error: null },
        {
          data: { id: 'staff-2', branch_id: 'branch-b', role: 'Receptionist' },
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff/staff-2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.staff).toMatchObject({ id: 'staff-2' });
    });
  });

  describe('GET /staff', () => {
    it("AC-3: returns only the caller's branch for non-Superadmin roles", async () => {
      mockCaller('staff-1');
      const builders = queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null },
        {
          data: [{ id: 'staff-1', branch_id: 'branch-a' }],
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.staff).toHaveLength(1);
      expect(builders[2].eq).toHaveBeenCalledWith('branch_id', 'branch-a');
    });

    it('AC-3: returns all branches for Superadmin', async () => {
      mockCaller('superadmin-1');
      const builders = queueFromResults(
        { data: { role: 'Superadmin' }, error: null },
        { data: { role: 'Superadmin', branch_id: 'branch-a' }, error: null },
        {
          data: [
            { id: 'staff-1', branch_id: 'branch-a' },
            { id: 'staff-2', branch_id: 'branch-b' },
          ],
          error: null,
        }
      );

      const res = await request(app)
        .get('/staff')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.staff).toHaveLength(2);
      expect(builders[2].eq).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /staff/:id', () => {
    it("AC-4: updates and persists a valid payload on one's own profile", async () => {
      mockCaller('staff-1');
      const builders = queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null },
        {
          data: {
            id: 'staff-1',
            branch_id: 'branch-a',
            role: 'Receptionist',
            display_name: 'New Name',
          },
          error: null,
        }
      );

      const res = await request(app)
        .patch('/staff/staff-1')
        .set('Authorization', 'Bearer token')
        .send({ display_name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.staff.display_name).toBe('New Name');
      expect(builders[2].update).toHaveBeenCalledWith({
        display_name: 'New Name',
      });
    });

    it('AC-5: rejects an attempt to set role with 400', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null }
      );

      const res = await request(app)
        .patch('/staff/staff-1')
        .set('Authorization', 'Bearer token')
        .send({ role: 'Superadmin' });

      expect(res.status).toBe(400);
    });

    it('AC-5: rejects an attempt to set branch_id with 400', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null }
      );

      const res = await request(app)
        .patch('/staff/staff-1')
        .set('Authorization', 'Bearer token')
        .send({ branch_id: 'branch-b' });

      expect(res.status).toBe(400);
    });

    it('rejects a PATCH on a different staff_id when the caller is not Admin/Superadmin', async () => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role: 'Receptionist' }, error: null },
        { data: { role: 'Receptionist', branch_id: 'branch-a' }, error: null }
      );

      const res = await request(app)
        .patch('/staff/staff-2')
        .set('Authorization', 'Bearer token')
        .send({ display_name: 'New Name' });

      expect(res.status).toBe(403);
    });
  });
});
