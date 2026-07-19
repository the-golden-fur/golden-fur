import { z } from 'zod';

/**
 * Check-in accepts either path: an existing confirmed booking (booking_id),
 * or a brand-new walk-in session created directly against a pet profile
 * (pet_id + branch_id, no booking_id at all) - #65 dev notes.
 */
export const checkInValidator = z
  .object({
    booking_id: z.uuid().optional(),
    pet_id: z.uuid().optional(),
    branch_id: z.uuid().optional(),
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
