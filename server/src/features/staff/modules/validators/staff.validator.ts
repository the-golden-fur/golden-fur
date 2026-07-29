import { z } from 'zod';
import { ALL_STAFF_ROLES } from '../../staff.types.ts';

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

/**
 * Admin Manages a Staff Account (M01 Process 5): promote/demote, deactivate,
 * transfer branch. Deliberately separate from updateStaffProfileValidator
 * above, which must never accept these fields even for an admin caller.
 * Per-field authorization (role/branch_id require Superadmin; is_active
 * requires Admin or Superadmin) is enforced in staffManagement.service.ts,
 * not here - this validator only shapes the payload.
 */
export const manageStaffAccountValidator = z
  .object({
    role: z.enum(ALL_STAFF_ROLES).optional(),
    branch_id: z.string().uuid().optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one of role, branch_id, is_active is required',
  });

export type ManageStaffAccountInput = z.infer<
  typeof manageStaffAccountValidator
>;

/**
 * Admin Creates a Staff Account (M01 Process 1). display_name is required
 * here (not optional as in self-edit) since the profile row's own column is
 * NOT NULL and there's no self-service step before the account is usable.
 */
export const createStaffAccountValidator = z
  .object({
    username: z.string().trim().min(1, 'Username is required'),
    registered_email: z.string().trim().email('Invalid email address'),
    display_name: z.string().trim().min(1, 'Display name is required'),
    role: z.enum(ALL_STAFF_ROLES),
    branch_id: z.string().uuid('Invalid branch_id'),
  })
  .strict();

export type CreateStaffAccountInput = z.infer<
  typeof createStaffAccountValidator
>;

/**
 * Self-service username change (Account settings). Deliberately its own
 * endpoint/validator rather than folded into updateStaffProfileValidator,
 * which is intentionally scoped away from username per that validator's own
 * Issue #22 comment - this one is scoped the opposite way: username only,
 * self-only (enforced in the controller, not here).
 */
export const updateStaffUsernameValidator = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters'),
  })
  .strict();

export type UpdateStaffUsernameInput = z.infer<
  typeof updateStaffUsernameValidator
>;
