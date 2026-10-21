import { z } from 'zod';

// Mirrored by the settings form's own limits and the tables' CHECK
// constraints (20261017272).
const contentKey = z.string().regex(/^[a-z0-9_.]{1,80}$/);
const contentValue = z.string().trim().min(1).max(2000);

/** A batch of text edits. Which keys exist (and are text, not image, slots)
 * is checked against landing_content by the service. */
export const updateLandingContentValidator = z
  .object({
    updates: z
      .array(z.object({ key: contentKey, value: contentValue }).strict())
      .min(1)
      .max(100),
  })
  .strict();

export const updateLandingSectionValidator = z
  .object({ is_visible: z.boolean() })
  .strict();

const quote = z.string().trim().min(1).max(600);
const name = z.string().trim().min(1).max(80);
const detail = z.string().trim().max(80);
const rating = z.number().int().min(1).max(5);

export const createLandingReviewValidator = z
  .object({ quote, name, detail: detail.optional(), rating })
  .strict();

export const updateLandingReviewValidator = z
  .object({
    quote: quote.optional(),
    name: name.optional(),
    detail: detail.optional(),
    rating: rating.optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Nothing to update',
  });

export type UpdateLandingContentInput = z.infer<
  typeof updateLandingContentValidator
>;
export type CreateLandingReviewInput = z.infer<
  typeof createLandingReviewValidator
>;
export type UpdateLandingReviewInput = z.infer<
  typeof updateLandingReviewValidator
>;
