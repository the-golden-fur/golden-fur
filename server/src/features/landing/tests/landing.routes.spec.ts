import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import landingRoutes from '../landing.routes.ts';
import {
  getLandingAdminContent,
  getPublicLandingContent,
  updateLandingContent,
} from '../services/landing.service.ts';
import { uploadLandingImage } from '../services/landingImage.service.ts';
import { listPublicBranches } from '../services/publicBranches.service.ts';

// Same setup as faq.routes.spec.ts: auth is reduced to "the role the test
// says"; requireRole itself is the real one - only its role lookup is
// stubbed.
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

vi.mock('../services/landing.service.ts', () => ({
  getPublicLandingContent: vi.fn(),
  getLandingAdminContent: vi.fn(),
  updateLandingContent: vi.fn(),
  updateLandingSection: vi.fn(),
  createLandingReview: vi.fn(),
  updateLandingReview: vi.fn(),
  deleteLandingReview: vi.fn(),
}));

vi.mock('../services/landingImage.service.ts', () => ({
  uploadLandingImage: vi.fn(),
  resetLandingImage: vi.fn(),
}));

vi.mock('../services/publicBranches.service.ts', () => ({
  listPublicBranches: vi.fn(),
}));

function app() {
  const server = express();
  server.use(express.json());
  server.use(landingRoutes);
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

describe('landing.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caller.role = null;
    vi.mocked(getPublicLandingContent).mockResolvedValue({
      content: { 'hero.title_lead': 'Care as warm as' },
      sections: { hero: true },
      reviews: [],
    });
    vi.mocked(listPublicBranches).mockResolvedValue([]);
    vi.mocked(getLandingAdminContent).mockResolvedValue({
      content: [],
      sections: [],
      reviews: [],
    });
    vi.mocked(updateLandingContent).mockResolvedValue([]);
  });

  it('GET /public/landing and /public/branches need no login', async () => {
    const landing = await request(app()).get('/public/landing');
    const branches = await request(app()).get('/public/branches');

    expect(landing.status).toBe(200);
    expect(landing.body.content).toEqual({
      'hero.title_lead': 'Care as warm as',
    });
    expect(branches.status).toBe(200);
    expect(branches.body).toEqual({ branches: [] });
  });

  it('the settings endpoints refuse a visitor who is not logged in', async () => {
    const response = await request(app()).get('/maintenance/landing');

    expect(response.status).toBe(401);
    expect(getLandingAdminContent).not.toHaveBeenCalled();
  });

  it('the settings endpoints refuse every role but Superadmin', async () => {
    for (const role of ['Admin', 'Supervisor', 'Receptionist']) {
      caller.role = role;

      const read = await request(app()).get('/maintenance/landing');
      const write = await request(app())
        .patch('/maintenance/landing/content')
        .send({ updates: [{ key: 'hero.title_lead', value: 'Hi' }] });
      const upload = await request(app())
        .post('/maintenance/landing/images/hero.image')
        .attach('image', Buffer.from('png'), {
          filename: 'hero.png',
          contentType: 'image/png',
        });

      expect(read.status).toBe(403);
      expect(write.status).toBe(403);
      expect(upload.status).toBe(403);
    }

    expect(getLandingAdminContent).not.toHaveBeenCalled();
    expect(updateLandingContent).not.toHaveBeenCalled();
    expect(uploadLandingImage).not.toHaveBeenCalled();
  });

  it('a Superadmin can read and save content', async () => {
    caller.role = 'Superadmin';

    const read = await request(app()).get('/maintenance/landing');
    const write = await request(app())
      .patch('/maintenance/landing/content')
      .send({ updates: [{ key: 'hero.title_lead', value: 'Hi' }] });

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(updateLandingContent).toHaveBeenCalledWith({
      updates: [{ key: 'hero.title_lead', value: 'Hi' }],
    });
  });

  it('rejects blank text before it reaches the service', async () => {
    caller.role = 'Superadmin';

    const response = await request(app())
      .patch('/maintenance/landing/content')
      .send({ updates: [{ key: 'hero.title_lead', value: '   ' }] });

    expect(response.status).toBe(400);
    expect(updateLandingContent).not.toHaveBeenCalled();
  });

  it('turns an over-limit upload into a 400, not a crash', async () => {
    caller.role = 'Superadmin';

    const response = await request(app())
      .post('/maintenance/landing/images/hero.image')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'big.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'File too large' });
    expect(uploadLandingImage).not.toHaveBeenCalled();
  });
});
