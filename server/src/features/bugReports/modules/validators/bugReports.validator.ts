import { z } from 'zod';

const CATEGORIES = ['bug', 'feature_request'] as const;
const STATUSES = ['pending', 'in_progress', 'resolved', 'dismissed'] as const;

export const createBugReportValidator = z
  .object({
    category: z.enum(CATEGORIES),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
  })
  .strict();

export const updateBugReportStatusValidator = z
  .object({
    status: z.enum(STATUSES),
  })
  .strict();

export type CreateBugReportInput = z.infer<typeof createBugReportValidator>;
export type UpdateBugReportStatusInput = z.infer<
  typeof updateBugReportStatusValidator
>;
