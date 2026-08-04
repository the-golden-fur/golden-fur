import { z } from 'zod';
import { WEEKDAYS } from '../../branches.types.ts';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const operatingHoursEntryValidator = z
  .object({
    open: z.string().regex(TIME_PATTERN, 'Use HH:MM (24h)'),
    close: z.string().regex(TIME_PATTERN, 'Use HH:MM (24h)'),
  })
  .strict()
  .refine((entry) => entry.open < entry.close, {
    message: 'close must be after open',
    path: ['close'],
  });

const operatingHoursValidator = z
  .object(
    Object.fromEntries(
      WEEKDAYS.map((day) => [day, operatingHoursEntryValidator.optional()])
    )
  )
  .strict();

export const updateBranchValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    contact_number: z.string().trim().min(1).nullable().optional(),
    is_vet_branch: z.boolean().optional(),
    timezone: z.string().trim().min(1).optional(),
    operating_hours: operatingHoursValidator.optional(),
  })
  .strict();

export type UpdateBranchInput = z.infer<typeof updateBranchValidator>;

export const createBranchValidator = z
  .object({
    name: z.string().trim().min(1),
    address: z.string().trim().min(1),
    contact_number: z.string().trim().min(1).nullable().optional(),
    is_vet_branch: z.boolean().optional().default(false),
    timezone: z.string().trim().min(1),
    operating_hours: operatingHoursValidator.optional().default({}),
  })
  .strict();

export type CreateBranchInput = z.infer<typeof createBranchValidator>;
