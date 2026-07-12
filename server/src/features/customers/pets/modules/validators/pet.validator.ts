import { z } from 'zod';

const SPECIES = ['Dog', 'Cat'] as const;
const GENDERS = ['Male', 'Female'] as const;
const WEIGHT_CLASSES = ['S', 'M', 'L', 'XL'] as const;
const COAT_TYPES = ['SC', 'LC'] as const;

/**
 * Required fields per Modules-Features M02 Process 4's flowchart: name,
 * species, weight_class, coat_type. breed/gender/date_of_birth/
 * health_conditions are optional (Issue #32 AC-1/AC-2).
 */
export const createPetValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    species: z.enum(SPECIES),
    breed: z.string().trim().min(1).optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
    weight_class: z.enum(WEIGHT_CLASSES),
    coat_type: z.enum(COAT_TYPES),
    health_conditions: z.string().trim().optional(),
  })
  .strict();

export const updatePetValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    species: z.enum(SPECIES).optional(),
    breed: z.string().trim().min(1).optional(),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: z.string().min(1).optional(),
    weight_class: z.enum(WEIGHT_CLASSES).optional(),
    coat_type: z.enum(COAT_TYPES).optional(),
    health_conditions: z.string().trim().optional(),
  })
  .strict();

export type CreatePetInput = z.infer<typeof createPetValidator>;
export type UpdatePetInput = z.infer<typeof updatePetValidator>;
