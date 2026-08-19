import { z } from 'zod';
import {
  feedingInstructionSchema,
  medicationInstructionSchema,
  playingInstructionSchema,
  walkingInstructionSchema,
} from '../../../hotel/modules/validators/hotel.validator.ts';

/**
 * Custom change (Daycare/Hotel parity): "make daycare the same as hotel...
 * as well as the feeding, medication, walk and playtime (exactly like
 * hotel)". Daycare check-in now accepts the exact same cage_id override +
 * structured care-instruction fields Hotel's checkInValidator does (shared
 * schemas imported above - both categories write to the same care_*
 * instruction tables, migration 20260807104), on top of Daycare's
 * pre-existing either/or path: an existing confirmed booking (booking_id),
 * or a brand-new walk-in session created directly against a pet profile
 * (pet_id + branch_id, no booking_id at all) - #65 dev notes.
 */
export const checkInValidator = z
  .object({
    booking_id: z.uuid().optional(),
    pet_id: z.uuid().optional(),
    branch_id: z.uuid().optional(),
    cage_id: z.uuid().optional(),
    // Custom change (Daycare fee configuration): which Daycare service this
    // session bills against (walk-in only - a booking-linked check-in
    // always derives it server-side from the booking's own selected
    // service instead, ignoring this field if sent). Omitted entirely
    // falls back to the branch's first active Daycare service.
    service_id: z.uuid().optional(),
    feeding: z.array(feedingInstructionSchema).default([]),
    walking: z.array(walkingInstructionSchema).default([]),
    playing: z.array(playingInstructionSchema).default([]),
    medications: z.array(medicationInstructionSchema).optional(),
    notify_opt_in: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.booking_id) {
      if (input.pet_id || input.branch_id) {
        ctx.addIssue({
          code: 'custom',
          message:
            'pet_id/branch_id must be omitted when booking_id is provided',
        });
      }
      return;
    }

    if (!input.pet_id || !input.branch_id) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Either booking_id, or pet_id + branch_id for a walk-in, is required',
      });
    }
  });

export type CheckInInput = z.infer<typeof checkInValidator>;

/** Custom change (Daycare checkout UI parity with Hotel): gives
 * GET /daycare/sessions the same status + inclusive date-range query shape
 * listHotelStaysQueryValidator already gives GET /hotel/stays, so
 * DaycareSessionPicker can reuse the same QueueFilterBar HotelStayPicker's
 * checkout list uses. */
export const listDaycareSessionsQueryValidator = z.object({
  status: z.enum(['Active', 'Completed']).optional(),
  date_from: z.iso.date().optional(),
  date_to: z.iso.date().optional(),
});

export type ListDaycareSessionsQueryInput = z.infer<
  typeof listDaycareSessionsQueryValidator
>;
