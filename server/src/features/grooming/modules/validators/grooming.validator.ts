import { z } from 'zod';

/**
 * Target status for a grooming session's Start/Complete action. Booking-
 * status revision: this now maps directly onto the shared
 * startBooking('In Progress')/completeBooking('Completed') transitions in
 * booking.service.ts, so the request shape is unchanged even though the
 * underlying state machine moved to bookings.status.
 */
export const transitionGroomingStatusValidator = z
  .object({
    status: z.enum(['In Progress', 'Completed']),
  })
  .strict();

export type TransitionGroomingStatusInput = z.infer<
  typeof transitionGroomingStatusValidator
>;
