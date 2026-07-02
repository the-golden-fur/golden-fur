import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  customerSignupController,
  customerLoginController,
  customerOauthCallbackController,
} from '../customerAuth.controller.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';
import * as accountMergeService from '../services/accountMerge.service.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
      admin: {
        deleteUser: vi.fn(),
      },
    },
    from: vi.fn(),
  },
}));

vi.mock('../services/accountMerge.service.ts', () => ({
  mergeOrCreate: vi.fn(),
}));

describe('customerAuth.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRequest = (body: any = {}, headers: any = {}) =>
    ({
      body,
      headers,
    }) as any;

  const mockResponse = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('customerSignupController', () => {
    it('returns 400 for invalid payload', async () => {
      const req = mockRequest({
        account_email: 'not-an-email',
        password: '123',
      });
      const res = mockResponse();

      await customerSignupController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid payload' })
      );
    });

    it('returns 201 on successful signup', async () => {
      const req = mockRequest({
        full_name: 'John Doe',
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      (supabase.auth.signUp as any).mockResolvedValue({
        data: { user: { id: 'user-id' }, session: { access_token: 'token' } },
        error: null,
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: insertMock });

      await customerSignupController(req, res);

      expect(supabase.auth.signUp).toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-id',
          account_email: 'john@example.com',
          primary_auth_provider: 'email',
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rolls back the auth user when the profile insert fails', async () => {
      const req = mockRequest({
        full_name: 'John Doe',
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      (supabase.auth.signUp as any).mockResolvedValue({
        data: { user: { id: 'user-id' }, session: { access_token: 'token' } },
        error: null,
      });

      const insertMock = vi
        .fn()
        .mockResolvedValue({ error: { message: 'duplicate key' } });
      (supabase.from as any).mockReturnValue({ insert: insertMock });
      (supabase.auth.admin.deleteUser as any).mockResolvedValue({
        error: null,
      });

      await customerSignupController(req, res);

      expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('user-id');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('customerLoginController', () => {
    it('returns 200 on successful login', async () => {
      const req = mockRequest({
        account_email: 'john@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });

      await customerLoginController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'valid-token' })
      );
    });
  });

  describe('customerOauthCallbackController', () => {
    it('returns 401 if token is missing', async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();

      await customerOauthCallbackController(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls mergeOrCreate and returns 200 on success', async () => {
      const req = mockRequest({}, { authorization: 'Bearer valid-token' });
      const res = mockResponse();

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'user-id', email: 'john@example.com' } },
        error: null,
      });

      (accountMergeService.mergeOrCreate as any).mockResolvedValue({
        action: 'merged',
        profile: { id: 'user-id' },
      });

      await customerOauthCallbackController(req, res);

      expect(accountMergeService.mergeOrCreate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, action: 'merged' })
      );
    });
  });
});
