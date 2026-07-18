import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { createBooking, getBookingById } from './services/booking.service.ts';
import {
  getStaffPickerOptions,
  listPolicyConfigurations,
  updatePolicyConfiguration,
} from './services/staffPicker.service.ts';
import { rescheduleBooking } from './services/reschedule.service.ts';
import { cancelBooking } from './services/cancellation.service.ts';
import {
  cancelBookingValidator,
  createBookingValidator,
  rescheduleBookingValidator,
  staffPickerQueryValidator,
  updatePolicyValidator,
} from './modules/validators/booking.validator.ts';

/**
 * Booking creation/reschedule/cancel are open to customers AND staff, so
 * those routes carry no requireRole gate - ownership authorization lives in
 * the services (mirroring pets). The policy-configuration surface is
 * staff-gated at the route level (see booking.routes.ts), so its controllers
 * only validate payloads, matching maintenance.controller.ts.
 */

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

export async function createBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createBookingValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const booking = await createBooking({ requesterId, input: parsed.data });
    return res.status(201).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const booking = await getBookingById({
      requesterId,
      bookingId: paramId(req, 'id'),
    });

    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function staffPickerOptionsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = staffPickerQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const result = await getStaffPickerOptions({
      branchId: parsed.data.branch_id,
      serviceCategory: parsed.data.service_category,
      scheduledStart: parsed.data.scheduled_start,
      scheduledEnd: parsed.data.scheduled_end,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPolicyConfigurationsController(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const policies = await listPolicyConfigurations();
    return res.status(200).json({ policies });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updatePolicyConfigurationController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = updatePolicyValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const policy = await updatePolicyConfiguration({ input: parsed.data });
    return res.status(200).json({ policy });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function rescheduleBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = rescheduleBookingValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await rescheduleBooking({
      requesterId,
      bookingId: paramId(req, 'id'),
      input: parsed.data,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function cancelBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = cancelBookingValidator.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await cancelBooking({
      requesterId,
      bookingId: paramId(req, 'id'),
      input: parsed.data,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
}
