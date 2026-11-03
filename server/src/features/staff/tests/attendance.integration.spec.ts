import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  getAttendanceDay,
  setAttendance,
} from '../services/attendance.service.ts';

vi.mock('../services/attendance.service.ts', () => ({
  getAttendanceDay: vi.fn().mockResolvedValue({ rows: [] }),
  setAttendance: vi
    .fn()
    .mockResolvedValue({ reassigned: [], needs_rescheduling: [] }),
}));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const PATH = `/staff/branches/${BRANCH_ID}/attendance`;

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

describe('attendance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['Supervisor', 'Admin', 'Superadmin'])('lets %s in', async (role) => {
    mockCaller(role);

    const response = await request(app)
      .get(PATH)
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
  });

  it.each([
    'Receptionist',
    'Front Desk',
    'Groomer',
    'Veterinarian',
    'Cashier',
    'Pet Assistant',
  ])('blocks %s', async (role) => {
    mockCaller(role);

    const read = await request(app)
      .get(PATH)
      .set('Authorization', 'Bearer test-token');
    const write = await request(app)
      .put(`${PATH}/s-1`)
      .set('Authorization', 'Bearer test-token')
      .send({ date: '2026-11-01', status: 'Absent' });

    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(getAttendanceDay).not.toHaveBeenCalled();
    expect(setAttendance).not.toHaveBeenCalled();
  });

  it.each([
    [{ date: '2026-11-01', status: 'On Break' }],
    [{ date: 'tomorrow', status: 'Absent' }],
    [{ date: '2026-11-01' }],
  ])('rejects a bad payload %#', async (body) => {
    mockCaller('Supervisor');

    const response = await request(app)
      .put(`${PATH}/s-1`)
      .set('Authorization', 'Bearer test-token')
      .send(body);

    expect(response.status).toBe(400);
    expect(setAttendance).not.toHaveBeenCalled();
  });

  it('passes the caller through for the service to scope', async () => {
    mockCaller('Supervisor');

    await request(app)
      .put(`${PATH}/s-1`)
      .set('Authorization', 'Bearer test-token')
      .send({ date: '2026-11-01', status: 'Late' });

    expect(setAttendance).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      requesterRole: 'Supervisor',
      requesterBranchId: BRANCH_ID,
      branchId: BRANCH_ID,
      staffId: 's-1',
      date: '2026-11-01',
      status: 'Late',
    });
  });
});
