import { z } from 'zod';

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export type TotpCodeFormValues = z.infer<typeof totpCodeSchema>;
