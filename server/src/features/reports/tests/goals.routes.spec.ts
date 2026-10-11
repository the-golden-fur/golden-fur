import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import reportsRoutes from '../reports.routes.ts';
import {
  getGoals,
  setGoalGrowthRate,
  setGoalMonthlyTarget,
} from '../services/goals.service.ts';

// Who is calling and what they send is what's under test, so auth is
// reduced to "the role the test says" - same approach as faq.routes.spec.ts.
// requireRole itself is the real one; only its role lookup is stubbed.
const caller = vi.hoisted(() => ({ role: null as string | null }));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

vi.mock('../../../shared/auth/middleware/jwt/jwt.middleware.ts', () => ({
  jwtMiddleware: (
    req: { user?: unknown },
    res: { status: (_code: number) => { json: (_body: unknown) => unknown } },
    next: () => void
  ) => {
    if (!caller.role) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { sub: 'staff-1' };
    next();
  },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRole: () =>
    Promise.resolve({ data: { role: caller.role }, error: null }),
}));

vi.mock(
  '../../../shared/middleware/sessionTimeout/sessionTimeout.middleware.ts',
  () => ({
    sessionTimeoutMiddleware: (
      _req: unknown,
      _res: unknown,
      next: () => void
    ) => next(),
  })
);

vi.mock('../services/goals.service.ts', () => ({
  getGoals: vi.fn(),
  setGoalGrowthRate: vi.fn(),
  setGoalMonthlyTarget: vi.fn(),
}));

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';

function app() {
  const server = express();
  server.use(express.json());
  server.use(reportsRoutes);
  server.use(
    (
      error: Error & { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  );
  return server;
}

describe('goals routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caller.role = null;
    vi.mocked(getGoals).mockResolvedValue({ month: '2026-10' } as never);
  });

  it('refuses a visitor who is not logged in', async () => {
    const response = await request(app()).get('/reports/goals?month=2026-10');

    expect(response.status).toBe(401);
    expect(getGoals).not.toHaveBeenCalled();
  });

  it('refuses every role but Superadmin, reading and writing', async () => {
    for (const role of ['Admin', 'Supervisor', 'Cashier']) {
      caller.role = role;

      const read = await request(app()).get('/reports/goals?month=2026-10');
      const write = await request(app())
        .put('/reports/goals/growth-rate')
        .send({ metric_key: 'revenue', branch_id: null, growth_rate: 20 });

      expect(read.status).toBe(403);
      expect(write.status).toBe(403);
    }

    expect(getGoals).not.toHaveBeenCalled();
    expect(setGoalGrowthRate).not.toHaveBeenCalled();
  });

  it('reads all-branches goals for a month', async () => {
    caller.role = 'Superadmin';

    const response = await request(app()).get('/reports/goals?month=2026-10');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ goals: { month: '2026-10' } });
    expect(getGoals).toHaveBeenCalledWith({
      requesterRole: 'Superadmin',
      month: '2026-10',
      branchId: null,
    });
  });

  it('passes a chosen branch through', async () => {
    caller.role = 'Superadmin';

    await request(app()).get(
      `/reports/goals?month=2026-10&branch_id=${BRANCH_ID}`
    );

    expect(getGoals).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: BRANCH_ID })
    );
  });

  it.each(['', '2026', '2026-13', '2026-10-01'])(
    'rejects month "%s" with 400',
    async (month) => {
      caller.role = 'Superadmin';

      const response = await request(app()).get(
        `/reports/goals?month=${month}`
      );

      expect(response.status).toBe(400);
      expect(getGoals).not.toHaveBeenCalled();
    }
  );

  it('saves a growth rate', async () => {
    caller.role = 'Superadmin';

    const response = await request(app())
      .put('/reports/goals/growth-rate')
      .send({
        metric_key: 'service:Grooming',
        branch_id: null,
        growth_rate: 15,
      });

    expect(response.status).toBe(204);
    expect(setGoalGrowthRate).toHaveBeenCalledWith('Superadmin', 'staff-1', {
      metric_key: 'service:Grooming',
      branch_id: null,
      growth_rate: 15,
    });
  });

  it('rejects an unknown metric or a negative rate', async () => {
    caller.role = 'Superadmin';

    const unknownMetric = await request(app())
      .put('/reports/goals/growth-rate')
      .send({ metric_key: 'profit', branch_id: null, growth_rate: 15 });
    const negative = await request(app())
      .put('/reports/goals/growth-rate')
      .send({ metric_key: 'revenue', branch_id: null, growth_rate: -1 });

    expect(unknownMetric.status).toBe(400);
    expect(negative.status).toBe(400);
    expect(setGoalGrowthRate).not.toHaveBeenCalled();
  });

  it('saves and clears an exact monthly target', async () => {
    caller.role = 'Superadmin';

    const save = await request(app()).put('/reports/goals/target').send({
      metric_key: 'revenue',
      branch_id: BRANCH_ID,
      month: '2026-12',
      target_value: 500000,
    });
    const clear = await request(app()).put('/reports/goals/target').send({
      metric_key: 'revenue',
      branch_id: BRANCH_ID,
      month: '2026-12',
      target_value: null,
    });

    expect(save.status).toBe(204);
    expect(clear.status).toBe(204);
    expect(setGoalMonthlyTarget).toHaveBeenCalledTimes(2);
    expect(setGoalMonthlyTarget).toHaveBeenLastCalledWith(
      'Superadmin',
      'staff-1',
      expect.objectContaining({ target_value: null })
    );
  });
});
