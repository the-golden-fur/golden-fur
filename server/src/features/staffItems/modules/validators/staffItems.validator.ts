import { z } from 'zod';
import {
  FOOD_QUANTITY_UNITS,
  MEDICATION_DOSE_UNITS,
} from '../../staffItems.types.ts';

export const createStaffFoodItemValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    quantity: z.string().trim().min(1, 'Quantity is required'),
    quantity_unit: z.enum(FOOD_QUANTITY_UNITS).optional(),
    special_instructions: z.string().trim().min(1).optional(),
    photo_url: z.string().trim().min(1).optional(),
    is_public: z.boolean().optional().default(false),
  })
  .strict();

export const updateStaffFoodItemValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    quantity: z.string().trim().min(1).optional(),
    quantity_unit: z.enum(FOOD_QUANTITY_UNITS).nullable().optional(),
    special_instructions: z.string().trim().min(1).nullable().optional(),
    photo_url: z.string().trim().min(1).nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .strict();

export type CreateStaffFoodItemInput = z.infer<
  typeof createStaffFoodItemValidator
>;
export type UpdateStaffFoodItemInput = z.infer<
  typeof updateStaffFoodItemValidator
>;

export const createStaffMedicationItemValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    dose: z.string().trim().min(1, 'Dose is required'),
    dose_unit: z.enum(MEDICATION_DOSE_UNITS).optional(),
    administration_notes: z.string().trim().min(1).optional(),
    photo_url: z.string().trim().min(1).optional(),
    is_public: z.boolean().optional().default(false),
  })
  .strict();

export const updateStaffMedicationItemValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    dose: z.string().trim().min(1).optional(),
    dose_unit: z.enum(MEDICATION_DOSE_UNITS).nullable().optional(),
    administration_notes: z.string().trim().min(1).nullable().optional(),
    photo_url: z.string().trim().min(1).nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .strict();

export type CreateStaffMedicationItemInput = z.infer<
  typeof createStaffMedicationItemValidator
>;
export type UpdateStaffMedicationItemInput = z.infer<
  typeof updateStaffMedicationItemValidator
>;
