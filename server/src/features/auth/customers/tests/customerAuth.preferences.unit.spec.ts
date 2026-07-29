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

function mockUpdateChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  mockUserClient.from.mockReturnValue({ update });
  return { update, eq, select };
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

  it('returns 400 when neither preference is provided', async () => {
    const req = {
      body: {},
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
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

  it('returns 400 for an invalid font_size_preference value', async () => {
    const req = {
      body: { font_size_preference: 'huge' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid font size preference',
    });
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('updates theme_preference only and returns both current values', async () => {
    const { update, eq } = mockUpdateChain({
      data: { theme_preference: 'light', font_size_preference: 'medium' },
      error: null,
    });

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
    expect(res.json).toHaveBeenCalledWith({
      theme_preference: 'light',
      font_size_preference: 'medium',
    });
  });

  it('updates font_size_preference only', async () => {
    const { update } = mockUpdateChain({
      data: { theme_preference: 'system', font_size_preference: 'x-large' },
      error: null,
    });

    const req = {
      body: { font_size_preference: 'x-large' },
      headers: { authorization: 'Bearer customer-token' },
      user: { sub: 'customer-id' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerPreferencesController(req, res);

    expect(update).toHaveBeenCalledWith({ font_size_preference: 'x-large' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 400 when the update is rejected (e.g. by RLS)', async () => {
    mockUpdateChain({ data: null, error: { message: 'permission denied' } });

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
