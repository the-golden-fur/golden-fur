import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { getStaffRoleOrNull } from '../../shared/auth/api/supabaseAuth.api.ts';
import {
  getInboxForCustomer,
  getInboxForStaff,
  markAllRead,
  markRead,
  setNotificationDeleted,
  setNotificationStarred,
} from './services/notification.service.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

/**
 * Issues #97/#100/#101: one shared inbox endpoint for both the staff
 * dropdown and the customer portal tab - a customer-or-staff route
 * (jwtMiddleware only), same pattern as booking.routes.ts's create/read/
 * reschedule/cancel - ownership is resolved here rather than gated by
 * requireRole.
 */
export async function listNotificationsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const notifications = staffRole
      ? await getInboxForStaff({ recipientId: requesterId })
      : await getInboxForCustomer({ recipientId: requesterId });

    return res.status(200).json({ notifications });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function markNotificationReadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const body = req.body as { read?: boolean };
    const notification = await markRead({
      notificationId: paramId(req, 'id'),
      recipientId: requesterId,
      isStaff: Boolean(staffRole),
      read: body?.read,
    });

    return res.status(200).json({ notification });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function starNotificationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const starred = (req.body as { starred?: boolean })?.starred;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (typeof starred !== 'boolean') {
    return res.status(400).json({ error: 'starred must be a boolean' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const notification = await setNotificationStarred({
      notificationId: paramId(req, 'id'),
      recipientId: requesterId,
      isStaff: Boolean(staffRole),
      starred,
    });

    return res.status(200).json({ notification });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteNotificationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    await setNotificationDeleted({
      notificationId: paramId(req, 'id'),
      recipientId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function markAllNotificationsReadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    await markAllRead({
      recipientId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
