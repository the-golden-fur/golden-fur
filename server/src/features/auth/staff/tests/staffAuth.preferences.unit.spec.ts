import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { staffPreferencesController } from '../staffAuth.routes.ts';
import type { AuthenticatedRequest } from '../../../../shared/shared.types.ts';

const mockUserClient = {
  from: vi.fn(),
};

// staffAuth.routes.ts pulls in staffAuth.controller.ts, which imports the
// real supabase.config.ts singleton - mock it too so its module-level
// createClient() call doesn't run before mockUserClient is initialized.
vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), auth: { signInWithPassword: vi.fn() } },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockUserClient),
}));

function mockResponse() {
  const res: Partial<Response> & { status: any; json: any } = {} as any;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockUpdateChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  mockUserClient.from.mockReturnValue({ update });
  return { update, eq, select };
}

describe('staffPreferencesController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the caller has no authenticated user', async () => {
    const req = {
      body: { theme_preference: 'dark' },
      headers: {},
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 when neither preference is provided', async () => {
    const req = {
      body: {},
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid theme_preference value', async () => {
    const req = {
      body: { theme_preference: 'neon' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid theme preference',
    });
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid font_size_preference value', async () => {
    const req = {
      body: { font_size_preference: 'huge' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid font size preference',
    });
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('updates theme_preference only and returns both current values', async () => {
    const { update, eq } = mockUpdateChain({
      data: { theme_preference: 'dark', font_size_preference: 'medium' },
      error: null,
    });

    const req = {
      body: { theme_preference: 'dark' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(mockUserClient.from).toHaveBeenCalledWith('staff_profiles');
    expect(update).toHaveBeenCalledWith({ theme_preference: 'dark' });
    expect(eq).toHaveBeenCalledWith('id', 'staff-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      theme_preference: 'dark',
      font_size_preference: 'medium',
    });
  });

  it('updates font_size_preference only', async () => {
    const { update } = mockUpdateChain({
      data: { theme_preference: 'system', font_size_preference: 'large' },
      error: null,
    });

    const req = {
      body: { font_size_preference: 'large' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(update).toHaveBeenCalledWith({ font_size_preference: 'large' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updates both preferences together', async () => {
    const { update } = mockUpdateChain({
      data: { theme_preference: 'light', font_size_preference: 'small' },
      error: null,
    });

    const req = {
      body: { theme_preference: 'light', font_size_preference: 'small' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(update).toHaveBeenCalledWith({
      theme_preference: 'light',
      font_size_preference: 'small',
    });
  });

  it('returns 400 when the update is rejected (e.g. by RLS)', async () => {
    mockUpdateChain({ data: null, error: { message: 'permission denied' } });

    const req = {
      body: { theme_preference: 'light' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'permission denied' });
  });

  it('returns 500 when building the Supabase client throws', async () => {
    mockUserClient.from.mockImplementation(() => {
      throw new Error('supabaseKey is required');
    });

    const req = {
      body: { theme_preference: 'light' },
      headers: { authorization: 'Bearer staff-token' },
      user: { sub: 'staff-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await staffPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
