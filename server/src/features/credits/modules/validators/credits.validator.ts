import { z } from 'zod';

export const listCreditBalancesQueryValidator = z.object({
  // Optional: a customer caller omits it (resolves to themself); a staff
  // caller must provide it (creditBalance.service.ts enforces the latter).
  customer_id: z.uuid().optional(),
});

export const listCreditHistoryQueryValidator = z.object({
  customer_id: z.uuid().optional(),
  branch_id: z.uuid(),
});

export type ListCreditBalancesQueryInput = z.infer<
  typeof listCreditBalancesQueryValidator
>;
export type ListCreditHistoryQueryInput = z.infer<
  typeof listCreditHistoryQueryValidator
>;
