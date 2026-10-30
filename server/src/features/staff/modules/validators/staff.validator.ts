import { z } from 'zod';
import { ALL_STAFF_ROLES } from '../../staff.types.ts';

const COMMUNICATION_CHANNELS = ['Call', 'Text', 'Viber', 'Messenger'] as const;

/** Staff names (20261030290): a legal name part - required wherever it's
 * accepted - and the optional ones, where an empty string or null clears it. */
const requiredNamePart = (label: string) =>
  z.string().trim().min(1, `${label} cannot be empty`);
const optionalNamePart = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

/**
 * Deliberately narrow and `.strict()`: role/branch_id/username/profile_photo_url
 * are out of scope for this self-service PATCH (see Issue #22 dev notes), so any
 * of those - or any other unrecognized key - must fail validation rather than be
 * silently stripped.
 */
export const updateStaffProfileValidator = z
  .object({
    // Staff names (20261030290): staff choose what they're called; their
    // legal name is managed by Admins (manageStaffAccountValidator) and
    // display_name is derived by the database, so neither is accepted here.
    nickname: optionalNamePart.optional(),
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
    // Staff names (20261030290) - same Admin-or-Superadmin permission as
    // is_active. First/last can be changed but not cleared; middle name and
    // nickname can be cleared (null or '').
    first_name: requiredNamePart('First name').optional(),
    middle_name: optionalNamePart.optional(),
    last_name: requiredNamePart('Last name').optional(),
    nickname: optionalNamePart.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to change is required',
  });

export type ManageStaffAccountInput = z.infer<
  typeof manageStaffAccountValidator
>;

/**
 * Admin Creates a Staff Account (M01 Process 1). First and last name are
 * required (staff names, 20261030290); display_name is derived from them (or
 * the nickname) by the database, so it is no longer accepted.
 */
export const createStaffAccountValidator = z
  .object({
    username: z.string().trim().min(1, 'Username is required'),
    registered_email: z.string().trim().email('Invalid email address'),
    first_name: z.string().trim().min(1, 'First name is required'),
    middle_name: optionalNamePart.optional(),
    last_name: z.string().trim().min(1, 'Last name is required'),
    nickname: optionalNamePart.optional(),
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
