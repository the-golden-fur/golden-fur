import { z } from 'zod';

/**
 * Shared by Settings > Account's password-change form for both staff and
 * customers. Same rule as the staff reset-password flow's own
 * resetPasswordSchema (staffAuth.validator.ts) - kept as a separate copy
 * rather than importing that staff-scoped module from customer-facing code.
 */
export const passwordChangeSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;
