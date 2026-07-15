import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../../app';
import { vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

const mockSignInClient = {
  auth: {
    signInWithPassword: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSignInClient),
}));

describe('staff auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
  });

  it('returns tokens for valid staff credentials', async () => {
    const mockSelect = vi.fn((columns: string) => ({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(
            columns === 'role'
              ? { data: { role: 'Groomer' }, error: null }
              : { data: { registered_email: 'test@example.com' }, error: null }
          ),
      }),
    }));
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'staff-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    const response = await request(app)
      .post('/auth/staff/login')
      .send({ username: 'demo', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 3600,
    });
  });

  it('returns tokens for valid staff email credentials', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { role: 'Admin' }, error: null }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'staff-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    const response = await request(app)
      .post('/auth/staff/login')
      .send({ identifier: 'demo@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(mockSignInClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'demo@example.com',
      password: 'password123',
    });
  });

  it('rejects a valid Supabase credential pair for an account with no staff_profiles row', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'customer-1' },
        session: {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
        },
      },
      error: null,
    } as any);

    const response = await request(app)
      .post('/auth/staff/login')
      .send({ identifier: 'customer@example.com', password: 'password123' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects login with wrong username', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error('Not found') }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const response = await request(app)
      .post('/auth/staff/login')
      .send({ username: 'unknown-user', password: 'password123' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects login with wrong password', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { registered_email: 'test@example.com' },
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    mockSignInClient.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    } as any);

    const response = await request(app)
      .post('/auth/staff/login')
      .send({ username: 'demo', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });
});
