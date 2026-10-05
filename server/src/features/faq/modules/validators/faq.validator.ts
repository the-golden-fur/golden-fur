import { z } from 'zod';

// Long enough for a real answer, short enough to stay readable in the
// mascot's small popup. Mirrored by the settings form's own limits and the
// table's CHECK constraints (20261006246).
const question = z.string().trim().min(1).max(200);
const answer = z.string().trim().min(1).max(2000);

export const createFaqValidator = z.object({ question, answer }).strict();

export const updateFaqValidator = z
  .object({
    question: question.optional(),
    answer: answer.optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Nothing to update',
  });

export type CreateFaqInput = z.infer<typeof createFaqValidator>;
export type UpdateFaqInput = z.infer<typeof updateFaqValidator>;
