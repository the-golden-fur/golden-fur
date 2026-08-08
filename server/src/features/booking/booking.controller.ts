import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  advancePaymentStage,
  completeBooking,
  createBooking,
  getBookingById,
  listBookings,
  overrideBookingStatus,
  overridePaymentStage,
  startBooking,
} from './services/booking.service.ts';
import {
  getStaffPickerOptions,
  listPolicyConfigurations,
  updatePolicyConfiguration,
} from './services/staffPicker.service.ts';
import { rescheduleBooking } from './services/reschedule.service.ts';
import { cancelBooking } from './services/cancellation.service.ts';
import {
  findNextAvailableSlot,
  getDaySlots,
  partsOfDayWithinOperatingHours,
  resolveOperatingWindow,
} from './services/availability.service.ts';
import { getBookingCatalog } from './services/catalog.service.ts';
import {
  advancePaymentStageValidator,
  availabilityQueryValidator,
  cancelBookingValidator,
  catalogQueryValidator,
  createBookingValidator,
  listBookingsQueryValidator,
  nextAvailableSlotQueryValidator,
  overrideBookingStatusValidator,
  overridePaymentStageValidator,
  partsOfDayQueryValidator,
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

export async function listBookingsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = listBookingsQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const bookings = await listBookings({
      requesterId,
      filters: {
        branchId: parsed.data.branch_id,
        date: parsed.data.date,
        dateFrom: parsed.data.date_from,
        dateTo: parsed.data.date_to,
        serviceCategory: parsed.data.service_category,
        status: parsed.data.status,
        assignedStaffId: parsed.data.assigned_staff_id,
        excludeUnpaidDownpayment: parsed.data.exclude_unpaid_downpayment,
      },
    });

    return res.status(200).json({ bookings });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function availabilityController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = availabilityQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const [slots, window] = await Promise.all([
      getDaySlots({
        branchId: parsed.data.branch_id,
        serviceCategory: parsed.data.service_category,
        date: parsed.data.date,
        slotDurationMinutes: parsed.data.slot_duration_minutes,
        petWeightClass: parsed.data.pet_weight_class,
      }),
      resolveOperatingWindow({
        branchId: parsed.data.branch_id,
        date: parsed.data.date,
      }),
    ]);

    return res.status(200).json({ slots, window });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function nextAvailableSlotController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = nextAvailableSlotQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const next = await findNextAvailableSlot({
      branchId: parsed.data.branch_id,
      serviceCategory: parsed.data.service_category,
      fromDate: parsed.data.from_date,
      slotDurationMinutes: parsed.data.slot_duration_minutes,
      petWeightClass: parsed.data.pet_weight_class,
      lookaheadDays: parsed.data.lookahead_days,
    });

    return res.status(200).json({ next });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function partsOfDayController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = partsOfDayQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const partsOfDay = await partsOfDayWithinOperatingHours({
      branchId: parsed.data.branch_id,
      date: parsed.data.date,
    });

    return res.status(200).json({ parts_of_day: partsOfDay });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function catalogController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = catalogQueryValidator.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.issues });
  }

  try {
    const catalog = await getBookingCatalog({
      branchId: parsed.data.branch_id,
      category: parsed.data.category,
    });

    return res.status(200).json(catalog);
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

/**
 * Manual status-advance actions: Start/Complete are staff-only, gated
 * broadly at the route level (any staff role except Cashier, not customer)
 * since whoever is physically doing the work should be able to advance it
 * regardless of category.
 */
export async function startBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const booking = await startBooking({ bookingId: paramId(req, 'id') });
    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function completeBookingController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const booking = await completeBooking({ bookingId: paramId(req, 'id') });
    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function overrideBookingStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = overrideBookingStatusValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const booking = await overrideBookingStatus({
      bookingId: paramId(req, 'id'),
      status: parsed.data.status,
    });
    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/**
 * Payment-stage "Advance" action - independent of the status-advance
 * controllers above (see PaymentStage's dev note in booking.types.ts).
 */
export async function advancePaymentStageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = advancePaymentStageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const booking = await advancePaymentStage({
      bookingId: paramId(req, 'id'),
      choice: parsed.data.choice,
    });
    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function overridePaymentStageController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = overridePaymentStageValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const booking = await overridePaymentStage({
      bookingId: paramId(req, 'id'),
      paymentStage: parsed.data.payment_stage,
    });
    return res.status(200).json({ booking });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
