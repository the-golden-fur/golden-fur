import { z } from 'zod';
import { FOOD_QUANTITY_UNITS } from '../../../hotel/hotel.types.ts';
import { medicationInstructionSchema } from '../../../hotel/modules/validators/hotel.validator.ts';

const foodQuantityUnit = z.enum(FOOD_QUANTITY_UNITS);
// Custom change (Daycare-only clock-time scheduling): Daycare doesn't fit
// the Morning/Noon/Afternoon/Evening day-period vocabulary Hotel's
// feeding/walking/playing instructions use - a Daycare visit is a few
// hours long, so staff/customers pick an actual clock time instead. These
// schemas used to just re-import Hotel's own enum-based
// feedingInstructionSchema/walkingInstructionSchema/playingInstructionSchema;
// they're declared separately now that the two categories' shapes diverge.
// Medication is unaffected - it already stores literal clock times for both
// categories, so medicationInstructionSchema is still reused as-is.
const dayClockTime = z.string().regex(/^\d{2}:\d{2}$/, 'Expected "HH:MM"');

const feedingInstructionSchema = z
  .object({
    scheduled_time: dayClockTime,
    food_type: z.string().min(1),
    quantity: z.string().min(1),
    quantity_unit: foodQuantityUnit.optional(),
    photo_url: z.url().optional(),
    special_instructions: z.string().optional(),
    food_catalog_id: z.uuid().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

const walkingInstructionSchema = z
  .object({
    scheduled_time: dayClockTime,
    duration_minutes: z.number().int().positive(),
    notes: z.string().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

const playingInstructionSchema = z
  .object({
    scheduled_time: dayClockTime,
    duration_minutes: z.number().int().positive(),
    notes: z.string().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

/**
 * Custom change (Daycare/Hotel parity): "make daycare the same as hotel...
 * as well as the feeding, medication, walk and playtime (exactly like
 * hotel)". Daycare check-in accepts the same cage_id override + structured
 * care-instruction fields Hotel's checkInValidator does, writing to the
 * same care_* instruction tables (migration 20260807104) - except feeding/
 * walking/playing use scheduled_time instead of Hotel's Morning/Noon/
 * Afternoon/Evening enum (#22 follow-up, Daycare-only clock-time
 * scheduling), on top of Daycare's pre-existing either/or path: an existing
 * confirmed booking (booking_id), or a brand-new walk-in session created
 * directly against a pet profile (pet_id + branch_id, no booking_id at
 * all) - #65 dev notes.
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
    // Optional/omittable, same as medications below: omitted falls back to
    // the customer's own booking-time preference (walk-ins with no booking
    // just get `[]`); provided (including `[]`) is the staff's final list.
    feeding: z.array(feedingInstructionSchema).optional(),
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
