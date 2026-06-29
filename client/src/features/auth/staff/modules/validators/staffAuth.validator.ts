import { z } from 'zod';

export const staffAuthValidator = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().trim().min(1, 'Password is required'),
});

export const totpValidator = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export type StaffAuthCredentials = z.infer<typeof staffAuthValidator>;
export type TotpCodePayload = z.infer<typeof totpValidator>;
