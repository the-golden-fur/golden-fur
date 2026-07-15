import { z } from 'zod';

export const customerSignupSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  account_email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const customerLoginSchema = z.object({
  account_email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type CustomerSignupFormValues = z.infer<typeof customerSignupSchema>;
export type CustomerLoginFormValues = z.infer<typeof customerLoginSchema>;
