import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../../app.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
    },
  },
}));

describe('customer auth integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/customers/signup', () => {
    it('creates auth user and customer_profiles record', async () => {
      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: {
          user: { id: 'test-user-id' } as any,
          session: { access_token: 'token' } as any,
        },
        error: null,
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as any);

      const response = await request(app).post('/auth/customers/signup').send({
        full_name: 'Test Customer',
        account_email: 'test@example.com',
        password: 'password123',
      });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Signup successful');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account_email: 'test@example.com',
          primary_auth_provider: 'email',
        })
      );
    });
  });

  describe('POST /auth/customers/login', () => {
    it('returns session for valid credentials', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          session: {
            access_token: 'acc-token',
            refresh_token: 'ref-token',
            expires_in: 3600,
          } as any,
          user: {} as any,
        },
        error: null,
      });

      const response = await request(app).post('/auth/customers/login').send({
        account_email: 'test@example.com',
        password: 'password123',
      });

      expect(response.status).toBe(200);
      expect(response.body.access_token).toBe('acc-token');
    });
  });

  describe('POST /auth/customers/mfa/enroll', () => {
    it('exists as an optional authenticated customer endpoint', async () => {
      const response = await request(app).post('/auth/customers/mfa/enroll');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/customers/mfa/verify', () => {
    it('exists as an optional authenticated customer endpoint', async () => {
      const response = await request(app)
        .post('/auth/customers/mfa/verify')
        .send({ code: '123456' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/customers/oauth/callback', () => {
    it('merges google account when email matches', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'google-user-id',
            email: 'test@example.com',
            app_metadata: { provider: 'google' },
            user_metadata: { full_name: 'Google User' },
          } as any,
        },
        error: null,
      });

      const selectMock = vi.fn().mockReturnThis();
      const eqSelectMock = vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'existing-id',
            account_email: 'test@example.com',
            primary_auth_provider: 'email',
          },
          error: null,
        }),
      });
      const updateMock = vi.fn().mockReturnThis();
      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'customer_profiles') {
          return {
            select: selectMock,
            update: updateMock,
            eq: (field: string, value: any) => {
              if (field === 'account_email') return eqSelectMock(field, value);
              if (field === 'id') return eqUpdateMock(field, value);
            },
          } as any;
        }
        return {} as any;
      });

      const response = await request(app)
        .post('/auth/customers/oauth/callback')
        .set('Authorization', 'Bearer valid-oauth-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.action).toBe('merged');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          primary_auth_provider: 'google',
        })
      );
    });

    it('merges facebook account and stores facebook_id', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'fb-user-id',
            email: 'test@example.com',
            app_metadata: { provider: 'facebook' },
            user_metadata: { full_name: 'FB User', provider_id: 'fb-12345' },
          } as any,
        },
        error: null,
      });

      const selectMock = vi.fn().mockReturnThis();
      const eqSelectMock = vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'existing-id',
            account_email: 'test@example.com',
            primary_auth_provider: 'google',
          },
          error: null,
        }),
      });
      const updateMock = vi.fn().mockReturnThis();
      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'customer_profiles') {
          return {
            select: selectMock,
            update: updateMock,
            eq: (field: string, value: any) => {
              if (field === 'account_email') return eqSelectMock(field, value);
              if (field === 'id') return eqUpdateMock(field, value);
            },
          } as any;
        }
        return {} as any;
      });

      const response = await request(app)
        .post('/auth/customers/oauth/callback')
        .set('Authorization', 'Bearer valid-oauth-token');

      expect(response.status).toBe(200);
      expect(response.body.action).toBe('merged');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          primary_auth_provider: 'facebook',
          facebook_id: 'fb-12345',
        })
      );
    });
  });
});
