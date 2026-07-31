import { z } from 'zod';

/**
 * #79 revision: food_catalog_id/medication_catalog_id are set only when the
 * receptionist picked a catalog entry from CatalogComboBox (#79) rather than
 * typing a freetext value - a freetext entry is never billable (no known
 * catalog price), so brought_by_customer is forced true and no price is
 * ever charged for it (careInstructions.service.ts enforces this
 * server-side too, not just client-side).
 */
const feedingInstructionSchema = z
  .object({
    meal_time: z.enum(['Morning', 'Afternoon', 'Evening']),
    food_type: z.string().min(1),
    quantity: z.string().min(1),
    special_instructions: z.string().optional(),
    food_catalog_id: z.uuid().optional(),
    brought_by_customer: z.boolean().default(true),
  })
  .strict();

const walkingInstructionSchema = z
  .object({
    time_block: z.string().min(1),
    duration_minutes: z.number().int().positive(),
    notes: z.string().optional(),
  })
  .strict();

const medicationInstructionSchema = z
  .object({
    medication_name: z.string().min(1),
    dose: z.string().min(1),
    scheduled_times: z.array(z.string().min(1)).default([]),
    administration_notes: z.string().optional(),
    medication_catalog_id: z.uuid().optional(),
    brought_by_customer: z.boolean().default(true),
  })
  .strict();

/**
 * #75 AC-2/AC-3: cage_id is an optional manual override of the server-
 * computed size suggestion - omitted means "accept the suggestion".
 * medications is optional/omittable - when omitted entirely, the service
 * auto-fills from M07's current-prescription derivation (#75 dev notes);
 * when provided (including `[]`), it is used verbatim as the receptionist's
 * final, possibly-edited list.
 */
export const checkInValidator = z
  .object({
    booking_id: z.uuid(),
    cage_id: z.uuid().optional(),
    feeding: z.array(feedingInstructionSchema).default([]),
    walking: z.array(walkingInstructionSchema).default([]),
    medications: z.array(medicationInstructionSchema).optional(),
    notify_opt_in: z.boolean().default(false),
  })
  .strict();

export type CheckInInput = z.infer<typeof checkInValidator>;

export const cageStatusUpdateValidator = z
  .object({
    status: z.enum(['Available', 'Under Maintenance']),
  })
  .strict();

export type CageStatusUpdateInput = z.infer<typeof cageStatusUpdateValidator>;

// createCatalogItemValidator/updateCatalogItemValidator moved to
// features/catalog/modules/validators/catalog.validator.ts (Sprint 5
// unification, #82) as createProductValidator/updateProductValidator.
