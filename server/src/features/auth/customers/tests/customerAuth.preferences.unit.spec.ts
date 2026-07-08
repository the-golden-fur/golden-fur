import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { customerPreferencesController } from '../customerAuth.routes.ts';
import type { AuthenticatedRequest } from '../../../../shared/shared.types.ts';

const mockUserClient = {
  from: vi.fn(),
};

// customerAuth.routes.ts pulls in customerAuth.controller.ts, which imports
// the real supabase.config.ts singleton - mock it too so its module-level
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

describe('customerPreferencesController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the caller has no authenticated user', async () => {
    const req = {
      body: { theme_preference: 'light' },
      headers: {},
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid theme_preference value', async () => {
    const req = {
      body: { theme_preference: 'neon' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid theme preference',
    });
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('updates theme_preference and returns it on success', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { theme_preference: 'light' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mockUserClient.from.mockReturnValue({ update });

    const req = {
      body: { theme_preference: 'light' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(mockUserClient.from).toHaveBeenCalledWith('customer_profiles');
    expect(update).toHaveBeenCalledWith({ theme_preference: 'light' });
    expect(eq).toHaveBeenCalledWith('id', 'customer-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ theme_preference: 'light' });
  });

  it('returns 400 when the update is rejected (e.g. by RLS)', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mockUserClient.from.mockReturnValue({ update });

    const req = {
      body: { theme_preference: 'dark' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'permission denied' });
  });

  it('returns 500 when building the Supabase client throws', async () => {
    mockUserClient.from.mockImplementation(() => {
      throw new Error('supabaseKey is required');
    });

    const req = {
      body: { theme_preference: 'dark' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
