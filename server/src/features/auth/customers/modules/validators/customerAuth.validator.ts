import { z } from 'zod';

export const customerSignupValidator = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  account_email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const customerLoginValidator = z.object({
  account_email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const customerTotpValidator = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
});

export type CustomerSignupInput = z.infer<typeof customerSignupValidator>;
export type CustomerLoginInput = z.infer<typeof customerLoginValidator>;
export type CustomerTotpInput = z.infer<typeof customerTotpValidator>;
