import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { customerNotificationPreferencesController } from '../customerAuth.routes.ts';
import type { AuthenticatedRequest } from '../../../../shared/shared.types.ts';

const mockUserClient = {
  from: vi.fn(),
};

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

function mockClient(
  fetchResult: { data: unknown; error: unknown },
  updateResult: { data: unknown; error: unknown }
) {
  const fetchSingle = vi.fn().mockResolvedValue(fetchResult);
  const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
  const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });

  const updateSingle = vi.fn().mockResolvedValue(updateResult);
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  mockUserClient.from.mockReturnValue({ select: fetchSelect, update });
  return { update };
}

function buildReq(body: unknown): AuthenticatedRequest {
  return {
    body,
    headers: { authorization: 'Bearer customer-token' },
    user: { sub: 'customer-id' },
  } as unknown as AuthenticatedRequest;
}

describe('customerNotificationPreferencesController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the caller has no authenticated user', async () => {
    const req = { body: {}, headers: {} } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid event type', async () => {
    const req = buildReq({
      event_type: 'not_a_real_event',
      channel: 'email',
      enabled: true,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when neither {channel,enabled} nor {reminder_offset_minutes} is provided', async () => {
    const req = buildReq({ event_type: 'appointment_reminder' });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUserClient.from).not.toHaveBeenCalled();
  });

  it('returns 400 when both shapes are mixed in one request', async () => {
    const req = buildReq({
      event_type: 'appointment_reminder',
      channel: 'email',
      enabled: true,
      reminder_offset_minutes: 60,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for a reminder_offset_minutes value outside the documented presets', async () => {
    const req = buildReq({
      event_type: 'appointment_reminder',
      reminder_offset_minutes: 42,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid reminder offset' });
  });

  it('rejects a reminder_offset_minutes update for any event type other than appointment_reminder', async () => {
    const req = buildReq({
      event_type: 'booking_confirmed',
      reminder_offset_minutes: 60,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid reminder offset' });
  });

  it('merges a valid reminder_offset_minutes into the existing per-event entry, preserving its channel settings', async () => {
    const { update } = mockClient(
      {
        data: {
          notification_preferences: {
            appointment_reminder: { email: true, in_browser: false },
          },
        },
        error: null,
      },
      {
        data: {
          notification_preferences: {
            appointment_reminder: {
              email: true,
              in_browser: false,
              reminder_offset_minutes: 60,
            },
          },
        },
        error: null,
      }
    );

    const req = buildReq({
      event_type: 'appointment_reminder',
      reminder_offset_minutes: 60,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(update).toHaveBeenCalledWith({
      notification_preferences: {
        appointment_reminder: {
          email: true,
          in_browser: false,
          reminder_offset_minutes: 60,
        },
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('still supports a plain {channel, enabled} update, unaffected by the new offset shape', async () => {
    const { update } = mockClient(
      { data: { notification_preferences: {} }, error: null },
      {
        data: {
          notification_preferences: {
            booking_confirmed: { email: false, in_browser: true },
          },
        },
        error: null,
      }
    );

    const req = buildReq({
      event_type: 'booking_confirmed',
      channel: 'email',
      enabled: false,
    });
    const res = mockResponse();

    await customerNotificationPreferencesController(req, res);

    expect(update).toHaveBeenCalledWith({
      notification_preferences: {
        booking_confirmed: { email: false },
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
