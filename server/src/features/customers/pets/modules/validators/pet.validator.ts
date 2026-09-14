import { z } from 'zod';

const GENDERS = ['Male', 'Female'] as const;
const WEIGHT_CLASSES = ['S', 'M', 'L', 'XL'] as const;
const COAT_TYPES = ['SC', 'LC'] as const;

/**
 * Required fields per Modules-Features M02 Process 4's flowchart: name,
 * pet_type (Issue #32 AC-1/AC-2). breed_id is nullable at the schema level
 * (Issue #71 backfill), but the client form (Issue #77) enforces it as
 * required going forward - not re-enforced here so staff-side edits/
 * back-fills can still clear it deliberately. health_conditions is no
 * longer accepted here at all (Issue #78 - now recorded only via the
 * Veterinary console into pet_health_conditions).
 *
 * weight_class/coat_type/weight_kg are intentionally absent from the
 * customer-facing variants below (client interview finding: a customer could
 * otherwise under-report any of them to manipulate Grooming price / Hotel
 * cage size - see ...073_m02_pets_assessment_lock.sql, extended to weight_kg
 * in ...187). A customer payload that includes any of those keys is rejected
 * by .strict() with a clean 400, same as any other unknown field. Only the
 * staff variants accept them, gated in pet.controller.ts by the same
 * isAuthorizedStaff check already used for cross-customer access - the DB
 * trigger from that migration is the defense-in-depth backstop if this
 * validator split is ever bypassed.
 *
 * When weight_kg is supplied, pet.controller.ts derives weight_class from it
 * via the Admin-configured cut-offs; an explicit weight_class in the same
 * payload is treated as a deliberate staff override and wins.
 *
 * pet_type is no longer a fixed 2-value enum (Pet Types admin CRUD,
 * 20260912191) - it's a foreign key against the admin-managed pet_types
 * table, so the real validation is the DB constraint, not this schema (same
 * pattern already used for breed_id). A bad/deactivated key surfaces as a
 * friendly 400 from pet.controller.ts's foreign_key_violation handling.
 */
export const createPetValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    pet_type: z.string().trim().min(1, 'Pet type is required'),
    breed_id: z.uuid().optional(),
    photo_url: z.string().trim().min(1).optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
  })
  .strict();

export const createPetValidatorStaff = createPetValidator.extend({
  weight_class: z.enum(WEIGHT_CLASSES).optional(),
  weight_kg: z.number().positive().max(499).optional(),
  coat_type: z.enum(COAT_TYPES).optional(),
});

export const updatePetValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    pet_type: z.string().trim().min(1).optional(),
    breed_id: z.uuid().nullable().optional(),
    photo_url: z.string().trim().min(1).nullable().optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
  })
  .strict();

export const updatePetValidatorStaff = updatePetValidator.extend({
  weight_class: z.enum(WEIGHT_CLASSES).optional(),
  weight_kg: z.number().positive().max(499).nullable().optional(),
  coat_type: z.enum(COAT_TYPES).optional(),
});

export type CreatePetInput = z.infer<typeof createPetValidator>;
export type CreatePetInputStaff = z.infer<typeof createPetValidatorStaff>;
export type UpdatePetInput = z.infer<typeof updatePetValidator>;
export type UpdatePetInputStaff = z.infer<typeof updatePetValidatorStaff>;
