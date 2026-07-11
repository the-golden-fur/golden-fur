import { z } from 'zod';

const COMMUNICATION_CHANNELS = ['Call', 'Text', 'Viber', 'Messenger'] as const;

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Mirrors the server's updateStaffProfileValidator (staff.validator.ts) so
 * invalid submissions are caught before the round trip - role/branch_id/
 * username/profile_photo_url are intentionally excluded here too.
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

export const avatarFileSchema = z
  .instanceof(File)
  .refine((file) => ALLOWED_AVATAR_MIME_TYPES.has(file.type), {
    message: 'Unsupported file type. Use PNG, JPEG, or WEBP.',
  })
  .refine((file) => file.size <= MAX_AVATAR_SIZE_BYTES, {
    message: 'File too large. Maximum size is 5MB.',
  });

/**
 * Mirrors the server's create-block payload shape (staff.controller.ts). A
 * quick-action request only needs the flag; a custom range needs both times,
 * with end strictly after start.
 */
export const createUnavailabilityBlockValidator = z
  .object({
    quick_action: z.boolean().optional(),
    start_time: z.string().min(1, 'Start time is required').optional(),
    end_time: z.string().min(1, 'End time is required').optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) => data.quick_action === true || (data.start_time && data.end_time),
    {
      message: 'Choose the quick action or provide a start and end time',
      path: ['start_time'],
    }
  )
  .refine(
    (data) =>
      !data.start_time ||
      !data.end_time ||
      new Date(data.end_time).getTime() > new Date(data.start_time).getTime(),
    {
      message: 'End time must be after start time',
      path: ['end_time'],
    }
  );

export type CreateUnavailabilityBlockInput = z.infer<
  typeof createUnavailabilityBlockValidator
>;
