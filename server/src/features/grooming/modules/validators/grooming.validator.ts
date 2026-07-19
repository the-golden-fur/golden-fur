import { z } from 'zod';

/**
 * Status only moves forward, one direction only: Waiting -> In Progress ->
 * Completed. 'Waiting' is never a valid PATCH target - it's only ever the
 * table default, set when a session is first created (#61 dev notes).
 */
export const transitionGroomingStatusValidator = z
  .object({
    status: z.enum(['In Progress', 'Completed']),
  })
  .strict();

export type TransitionGroomingStatusInput = z.infer<
  typeof transitionGroomingStatusValidator
>;
