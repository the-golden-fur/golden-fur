import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import faqRoutes from '../faq.routes.ts';
import { listAllFaqs, listPublicFaqs } from '../services/faq.service.ts';

// Who is calling is the only thing under test here, so auth is reduced to
// "the role the test says": the real JWT/session middleware need a live
// Supabase session. requireRole itself is the real one - only its role
// lookup is stubbed.
const caller = vi.hoisted(() => ({ role: null as string | null }));

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

vi.mock('../services/faq.service.ts', () => ({
  listPublicFaqs: vi.fn(),
  listAllFaqs: vi.fn(),
  createFaq: vi.fn(),
  updateFaq: vi.fn(),
  deleteFaq: vi.fn(),
}));

function app() {
  const server = express();
  server.use(express.json());
  server.use(faqRoutes);
  // requireRole reports a refusal through next(error), like the app's own
  // errorHandler expects.
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

describe('faq.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caller.role = null;
    vi.mocked(listPublicFaqs).mockResolvedValue([
      { id: 'faq-1', question: 'Q1', answer: 'A1' },
    ]);
    vi.mocked(listAllFaqs).mockResolvedValue([]);
  });

  it('GET /public/faqs needs no login - the mascot is on public pages', async () => {
    const response = await request(app()).get('/public/faqs');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      faqs: [{ id: 'faq-1', question: 'Q1', answer: 'A1' }],
    });
  });

  it('the settings endpoints refuse a visitor who is not logged in', async () => {
    const response = await request(app()).get('/maintenance/faqs');

    expect(response.status).toBe(401);
    expect(listAllFaqs).not.toHaveBeenCalled();
  });

  it('the settings endpoints refuse every role but Superadmin', async () => {
    for (const role of ['Admin', 'Supervisor', 'Receptionist']) {
      caller.role = role;

      const read = await request(app()).get('/maintenance/faqs');
      const write = await request(app())
        .post('/maintenance/faqs')
        .send({ question: 'Q?', answer: 'A.' });

      expect(read.status).toBe(403);
      expect(write.status).toBe(403);
    }

    expect(listAllFaqs).not.toHaveBeenCalled();
  });

  it('a Superadmin can read the full list', async () => {
    caller.role = 'Superadmin';

    const response = await request(app()).get('/maintenance/faqs');

    expect(response.status).toBe(200);
    expect(listAllFaqs).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid FAQ before it reaches the service', async () => {
    caller.role = 'Superadmin';

    const response = await request(app())
      .post('/maintenance/faqs')
      .send({ question: '', answer: 'A.' });

    expect(response.status).toBe(400);
  });
});
