import { z } from 'zod';

const COMMUNICATION_CHANNELS = ['Call', 'Text', 'Viber', 'Messenger'] as const;

/**
 * Deliberately narrow and `.strict()`: role/branch_id/username/profile_photo_url
 * are out of scope for this self-service PATCH (see Issue #22 dev notes), so any
 * of those - or any other unrecognized key - must fail validation rather than be
 * silently stripped.
 */
export const updateStaffProfileValidator = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, 'Display name cannot be empty')
      .optional(),
    phone_number: z
      .string()
      .trim()
      .min(1, 'Phone number cannot be empty')
      .optional(),
    emergency_contact_name: z
      .string()
      .trim()
      .min(1, 'Emergency contact name cannot be empty')
      .optional(),
    emergency_contact_number: z
      .string()
      .trim()
      .min(1, 'Emergency contact number cannot be empty')
      .optional(),
    preferred_communication_channel: z.enum(COMMUNICATION_CHANNELS).optional(),
  })
  .strict();

export type UpdateStaffProfileInput = z.infer<
  typeof updateStaffProfileValidator
>;
