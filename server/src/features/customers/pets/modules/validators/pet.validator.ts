import { z } from 'zod';

const PET_TYPES = ['Dog', 'Cat'] as const;
const GENDERS = ['Male', 'Female'] as const;
const WEIGHT_CLASSES = ['S', 'M', 'L', 'XL'] as const;
const COAT_TYPES = ['SC', 'LC'] as const;

/**
 * Required fields per Modules-Features M02 Process 4's flowchart: name,
 * pet_type, weight_class, coat_type (Issue #32 AC-1/AC-2). breed_id is
 * nullable at the schema level (Issue #71 backfill), but the client form
 * (Issue #77) enforces it as required going forward - not re-enforced here
 * so staff-side edits/back-fills can still clear it deliberately.
 * health_conditions is no longer accepted here at all (Issue #78 - now
 * recorded only via the Veterinary console into pet_health_conditions).
 */
export const createPetValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    pet_type: z.enum(PET_TYPES),
    breed_id: z.uuid().optional(),
    photo_url: z.string().trim().min(1).optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
    weight_class: z.enum(WEIGHT_CLASSES),
    coat_type: z.enum(COAT_TYPES),
  })
  .strict();

export const updatePetValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    pet_type: z.enum(PET_TYPES).optional(),
    breed_id: z.uuid().nullable().optional(),
    photo_url: z.string().trim().min(1).nullable().optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
    weight_class: z.enum(WEIGHT_CLASSES).optional(),
    coat_type: z.enum(COAT_TYPES).optional(),
  })
  .strict();

export type CreatePetInput = z.infer<typeof createPetValidator>;
export type UpdatePetInput = z.infer<typeof updatePetValidator>;
