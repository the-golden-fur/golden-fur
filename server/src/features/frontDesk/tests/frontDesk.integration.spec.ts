import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  completeFrontDeskBooking,
  listFrontDeskQueue,
  startFrontDeskBooking,
} from '../services/frontDeskQueue.service.ts';

vi.mock('../services/frontDeskQueue.service.ts', () => ({
  listFrontDeskQueue: vi.fn().mockResolvedValue([]),
  startFrontDeskBooking: vi.fn().mockResolvedValue(undefined),
  completeFrontDeskBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';

function bearer(): string {
  return 'Bearer test-token';
}

function mockCaller(role: string) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: 'staff-1' } },
    error: null,
  } as never);
  vi.spyOn(jwt, 'decode').mockReturnValue({ sub: 'staff-1' } as never);

  const single = { data: { role, branch_id: BRANCH_ID }, error: null };
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'is', 'in', 'update', 'upsert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(single);
  builder.single = vi.fn().mockResolvedValue(single);
  builder.then = (resolve: (_value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);

  vi.mocked(supabase.from).mockImplementation(() => builder as never);
}

describe('front desk routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['Receptionist', 'Front Desk', 'Admin', 'Supervisor', 'Superadmin'])(
    'lets %s reach the queue',
    async (role) => {
      mockCaller(role);

      const response = await request(app)
        .get('/front-desk/queue')
        .set('Authorization', bearer());

      expect(response.status).toBe(200);
    }
  );

  it.each(['Groomer', 'Veterinarian', 'Cashier', 'Pet Assistant'])(
    'blocks %s from the queue and from advancing bookings',
    async (role) => {
      mockCaller(role);

      const list = await request(app)
        .get('/front-desk/queue')
        .set('Authorization', bearer());
      const complete = await request(app)
        .post('/front-desk/bookings/b-1/complete')
        .set('Authorization', bearer());

      expect(list.status).toBe(403);
      expect(complete.status).toBe(403);
      expect(listFrontDeskQueue).not.toHaveBeenCalled();
      expect(completeFrontDeskBooking).not.toHaveBeenCalled();
    }
  );

  it('ignores a requested branch for everyone but Superadmin', async () => {
    mockCaller('Front Desk');

    await request(app)
      .get('/front-desk/queue?branch_id=all')
      .set('Authorization', bearer());

    expect(listFrontDeskQueue).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      branchId: BRANCH_ID,
    });
  });

  it('lets a Superadmin view every branch', async () => {
    mockCaller('Superadmin');

    await request(app)
      .get('/front-desk/queue?branch_id=all')
      .set('Authorization', bearer());

    expect(listFrontDeskQueue).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      branchId: null,
    });
  });

  it('binds start and complete to the caller branch', async () => {
    mockCaller('Receptionist');

    await request(app)
      .post('/front-desk/bookings/b-1/start')
      .set('Authorization', bearer());
    await request(app)
      .post('/front-desk/bookings/b-1/complete')
      .set('Authorization', bearer())
      .send({ services_done: [{ name: 'Surgery', amount: 100 }] });

    expect(startFrontDeskBooking).toHaveBeenCalledWith({
      bookingId: 'b-1',
      requesterId: 'staff-1',
      branchId: BRANCH_ID,
    });
    expect(completeFrontDeskBooking).toHaveBeenCalledWith({
      bookingId: 'b-1',
      requesterId: 'staff-1',
      branchId: BRANCH_ID,
      servicesDone: [{ name: 'Surgery', amount: 100 }],
    });
  });

  it('rejects a malformed services list', async () => {
    mockCaller('Receptionist');

    const response = await request(app)
      .post('/front-desk/bookings/b-1/complete')
      .set('Authorization', bearer())
      .send({ services_done: [{ name: '', amount: -1 }] });

    expect(response.status).toBe(400);
    expect(completeFrontDeskBooking).not.toHaveBeenCalled();
  });
});
