import { z } from 'zod';

const COMMUNICATION_CHANNELS = ['Call', 'Text', 'Viber', 'Messenger'] as const;

/**
 * Deliberately narrow and `.strict()`: account_email is intentionally
 * excluded (see Issue #31 dev notes) - email changes are routed through
 * Supabase Auth's own email-change/verification flow, never a raw UPDATE
 * here, so any unrecognized key - including account_email - must fail
 * validation rather than be silently stripped (AC-5). Mirrors the Epic B
 * #22 staff.validator.ts precedent of keeping sensitive fields out of the
 * self-service PATCH surface.
 */
export const updateCustomerProfileValidator = z
  .object({
    full_name: z.string().trim().min(1, 'Full name cannot be empty').optional(),
    contact_number: z
      .string()
      .trim()
      .min(1, 'Contact number cannot be empty')
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

export type UpdateCustomerProfileInput = z.infer<
  typeof updateCustomerProfileValidator
>;
