import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

/**
 * Custom change (Groomer/Pet Assistant check-in restriction): proves
 * /daycare/check-in, /daycare/sessions/:id/checkout and
 * /daycare/sessions/:id/checkout-preview are now gated to
 * DAYCARE_FRONT_DESK_ROLES (403 for Groomer/Pet Assistant) while still
 * reachable by a front-desk role. Mirrors
 * hotel.checkInOutRoles.integration.spec.ts.
 */
vi.mock('../services/daycareCheckIn.service.ts', () => ({
  checkInDaycareSession: vi.fn().mockResolvedValue({ session: { id: 's-1' } }),
}));

vi.mock('../services/daycareBilling.service.ts', () => ({
  checkOutDaycareSession: vi.fn().mockResolvedValue({ session: { id: 's-1' } }),
  previewDaycareCheckout: vi.fn().mockResolvedValue({ total: 0 }),
}));

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

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'order']) {
      builder[method] = vi.fn(() => builder);
    }

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

const BOOKING_ID = '11111111-1111-4111-a111-111111111111';
const SESSION_ID = '22222222-2222-4222-a222-222222222222';
const BRANCH_ID = '33333333-3333-4333-a333-333333333333';

async function expectBlockedForRole(
  role: string,
  method: 'post' | 'get',
  path: string,
  body?: object
) {
  mockCaller('staff-1');
  queueFromResults({ data: { role }, error: null });

  const req = request(app)[method](path).set('Authorization', 'Bearer t');
  const res = body ? await req.send(body) : await req;

  expect(res.status).toBe(403);
}

async function expectAllowedForRole(
  role: string,
  method: 'post' | 'get',
  path: string,
  body?: object
) {
  mockCaller('staff-1');
  queueFromResults(
    { data: { role }, error: null },
    { data: { role, branch_id: BRANCH_ID }, error: null }
  );

  const req = request(app)[method](path).set('Authorization', 'Bearer t');
  const res = body ? await req.send(body) : await req;

  expect(res.status).not.toBe(403);
}

describe('Daycare check-in/checkout routes (Groomer/Pet Assistant restriction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /daycare/check-in', () => {
    it('403s for Groomer', () =>
      expectBlockedForRole('Groomer', 'post', '/daycare/check-in', {
        booking_id: BOOKING_ID,
      }));

    it('403s for Pet Assistant', () =>
      expectBlockedForRole('Pet Assistant', 'post', '/daycare/check-in', {
        booking_id: BOOKING_ID,
      }));

    it('is reachable by Receptionist', () =>
      expectAllowedForRole('Receptionist', 'post', '/daycare/check-in', {
        booking_id: BOOKING_ID,
      }));
  });

  describe('POST /daycare/sessions/:id/checkout', () => {
    const path = `/daycare/sessions/${SESSION_ID}/checkout`;

    it('403s for Groomer', () => expectBlockedForRole('Groomer', 'post', path));

    it('403s for Pet Assistant', () =>
      expectBlockedForRole('Pet Assistant', 'post', path));

    it('is reachable by Receptionist', () =>
      expectAllowedForRole('Receptionist', 'post', path));
  });

  describe('GET /daycare/sessions/:id/checkout-preview', () => {
    const path = `/daycare/sessions/${SESSION_ID}/checkout-preview`;

    it('403s for Groomer', () => expectBlockedForRole('Groomer', 'get', path));

    it('403s for Pet Assistant', () =>
      expectBlockedForRole('Pet Assistant', 'get', path));

    it('is reachable by Receptionist', () =>
      expectAllowedForRole('Receptionist', 'get', path));
  });
});
