import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgotPasswordController } from '../staffAuth.controller.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { sendPasswordResetEmail } from '../../../../shared/email/passwordResetEmail.ts';
import { createNotification } from '../../../notifications/services/notification.service.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
    auth: { admin: { generateLink: vi.fn() } },
  },
}));

vi.mock('../../../../shared/email/passwordResetEmail.ts', () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

function mockResponse() {
  const res: Partial<Response> & { status: any; json: any } = {} as any;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

/** staff_profiles lookup for the in-app "Password reset requested" row. */
function mockStaffLookup(staffProfile: { id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: staffProfile });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ select } as any);
}

const request = (email?: string) => ({ body: { email } }) as Request;

describe('staff forgotPasswordController', () => {
  const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
    mockStaffLookup(null);
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
  });

  it('sends the recovery link through Brevo, pointing at the staff reset page', async () => {
    vi.mocked(supabase.auth.admin.generateLink).mockResolvedValue({
      data: { properties: { action_link: 'https://link.example/recover' } },
      error: null,
    } as any);
    mockStaffLookup({ id: 'staff-1' });
    const res = mockResponse();

    await forgotPasswordController(request('staff@example.com'), res);

    expect(supabase.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'staff@example.com',
      options: { redirectTo: 'http://localhost:5173/staff/reset-password' },
    });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'staff@example.com',
      resetLink: 'https://link.example/recover',
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientStaffId: 'staff-1',
        eventType: 'password_reset',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('gives the same response and sends nothing for an unknown email', async () => {
    vi.mocked(supabase.auth.admin.generateLink).mockResolvedValue({
      data: { properties: null },
      error: { message: 'User not found' },
    } as any);
    const res = mockResponse();

    await forgotPasswordController(request('nobody@example.com'), res);

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset email sent',
    });
  });

  it('still responds 200 when the Brevo send fails', async () => {
    vi.mocked(supabase.auth.admin.generateLink).mockResolvedValue({
      data: { properties: { action_link: 'https://link.example/recover' } },
      error: null,
    } as any);
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(
      new Error('Failed to send email via Brevo: Key not found')
    );
    const res = mockResponse();

    await forgotPasswordController(request('staff@example.com'), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a request with no email', async () => {
    const res = mockResponse();

    await forgotPasswordController(request(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(supabase.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});
