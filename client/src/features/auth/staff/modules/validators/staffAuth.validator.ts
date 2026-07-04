import { z } from 'zod';

export const staffLoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
});

export type StaffLoginFormValues = z.infer<typeof staffLoginSchema>;
export type TotpCodeFormValues = z.infer<typeof totpCodeSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
