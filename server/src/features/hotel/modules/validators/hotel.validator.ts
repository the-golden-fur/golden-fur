import { z } from 'zod';

const partOfDay = z.enum(['Morning', 'Afternoon', 'Evening']);
// Feeding's meal_time gets a "Noon" option that walk/play's time_block does
// not (only asked for on the food-type dropdown) - kept as its own enum
// rather than widening partOfDay so walking/playing stay unaffected.
const mealTime = z.enum(['Morning', 'Noon', 'Afternoon', 'Evening']);

/**
 * stay_date (#22): omitted/undefined means the row applies to every night of
 * the stay (the "same instructions every night" default); a specific date
 * scopes the row to that single calendar night only. Booking flow &
 * pricing revamp (#22) also drops brought_by_customer/charged_price - staff
 * no longer buy food/medication on a customer's behalf, so every row is
 * implicitly customer-supplied now.
 */
// Exported so daycare.validator.ts's checkInValidator can build on the
// identical shape (Custom change: Daycare/Hotel parity) rather than
// re-declaring it - both categories now write to the same care_*
// instruction tables (migration 20260807104).
export const feedingInstructionSchema = z
  .object({
    meal_time: mealTime,
    food_type: z.string().min(1),
    quantity: z.string().min(1),
    special_instructions: z.string().optional(),
    food_catalog_id: z.uuid().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

export const walkingInstructionSchema = z
  .object({
    time_block: partOfDay,
    duration_minutes: z.number().int().positive(),
    notes: z.string().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

export const playingInstructionSchema = z
  .object({
    time_block: partOfDay,
    duration_minutes: z.number().int().positive(),
    notes: z.string().optional(),
    stay_date: z.iso.date().optional(),
  })
  .strict();

export const medicationInstructionSchema = z
  .object({
    medication_name: z.string().min(1),
    dose: z.string().min(1),
    scheduled_times: z.array(z.string().min(1)).default([]),
    administration_notes: z.string().optional(),
    medication_catalog_id: z.uuid().optional(),
    stay_date: z.iso.date().optional(),
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
    playing: z.array(playingInstructionSchema).default([]),
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

/** Custom change (Cage CRUD, Settings > Config). */
export const createCageValidator = z
  .object({
    cage_label: z.string().trim().min(1),
    size: z.enum(['S', 'M', 'L', 'XL']),
  })
  .strict();

export type CreateCageInput = z.infer<typeof createCageValidator>;

export const updateCageValidator = z
  .object({
    cage_label: z.string().trim().min(1).optional(),
    size: z.enum(['S', 'M', 'L', 'XL']).optional(),
  })
  .strict()
  .refine(
    (input) => input.cage_label !== undefined || input.size !== undefined,
    { message: 'At least one field must be provided' }
  );

export type UpdateCageInput = z.infer<typeof updateCageValidator>;

// createCatalogItemValidator/updateCatalogItemValidator moved to
// features/catalog/modules/validators/catalog.validator.ts (Sprint 5
// unification, #82) as createProductValidator/updateProductValidator.
