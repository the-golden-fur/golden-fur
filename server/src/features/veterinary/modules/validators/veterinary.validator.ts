import { z } from 'zod';

const PROCEDURE_TYPES = [
  'Lab test',
  'Dental',
  'Vaccination',
  'Surgery',
  'Emergency',
  'Wellness Exam',
] as const;

const medicationInputValidator = z
  .object({
    name: z.string().min(1),
    dose: z.string().min(1),
    notes: z.string().optional(),
    // Only required to complete a consultation (see superRefine below) -
    // medications can be recorded while 'Ongoing' before a price is known.
    amount: z.number().nonnegative().optional(),
  })
  .strict();

const procedureInputValidator = z
  .object({
    procedure_type: z.enum(PROCEDURE_TYPES),
    description: z.string().min(1),
    amount: z.number().nonnegative(),
  })
  .strict();

const vaccinationInputValidator = z
  .object({
    vaccine_name: z.string().min(1),
    date_administered: z.string().min(1),
    next_due_date: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

/**
 * Issue #66: vitals/diagnosis/medications/procedures can be entered while
 * 'Ongoing'; status only ever moves Pending -> Ongoing -> Completed, one
 * direction, mirroring #64's grooming status validator. Completing a
 * consultation additionally requires professional_fee and an amount on every
 * medication (each becomes a consultation_line_items row - AC-2).
 */
export const updateConsultationValidator = z
  .object({
    status: z.enum(['Ongoing', 'Completed']).optional(),
    temperature: z.number().optional(),
    weight: z.number().optional(),
    heart_rate: z.number().optional(),
    respiratory_rate: z.number().optional(),
    diagnosis: z.string().optional(),
    reason_for_visit: z.string().min(1).optional(),
    medications: z.array(medicationInputValidator).optional(),
    procedures: z.array(procedureInputValidator).optional(),
    professional_fee: z.number().nonnegative().optional(),
    vaccination: vaccinationInputValidator.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.status !== 'Completed') return;

    if (input.professional_fee === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'professional_fee is required to complete a consultation',
        path: ['professional_fee'],
      });
    }

    input.medications?.forEach((medication, index) => {
      if (medication.amount === undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'amount is required on every medication to complete a consultation',
          path: ['medications', index, 'amount'],
        });
      }
    });
  });

export type UpdateConsultationInput = z.infer<
  typeof updateConsultationValidator
>;

/** Issue #67: date only - no time slot (the receptionist's confirmation
 * step is what actually picks one, via the normal M03 flow). */
export const scheduleFollowUpValidator = z
  .object({
    follow_up_date: z.iso.date(),
  })
  .strict();

export type ScheduleFollowUpInput = z.infer<typeof scheduleFollowUpValidator>;

/**
 * Issue #78: recorded/updated only from the consultation form, by a
 * Veterinarian. Null/empty clears the pet's current health-condition flag
 * (e.g. a previously-noted condition that no longer applies).
 */
export const upsertHealthConditionsValidator = z
  .object({
    conditions_text: z.string().trim().nullable(),
  })
  .strict();

export type UpsertHealthConditionsInput = z.infer<
  typeof upsertHealthConditionsValidator
>;

/** A vet's personal medication catalog entry - picked from later on the
 * consultation form's Medications rows instead of retyped every visit. */
export const createMedicationCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1),
    default_dose: z.string().trim().min(1).optional(),
    default_price: z.number().nonnegative().optional(),
  })
  .strict();

export type CreateMedicationCatalogItemInput = z.infer<
  typeof createMedicationCatalogItemValidator
>;

export const updateMedicationCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    default_dose: z.string().trim().min(1).nullable().optional(),
    default_price: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type UpdateMedicationCatalogItemInput = z.infer<
  typeof updateMedicationCatalogItemValidator
>;

export const createProcedureCatalogItemValidator = z
  .object({
    procedure_type: z.enum(PROCEDURE_TYPES),
    description: z.string().trim().min(1),
    default_price: z.number().nonnegative().optional(),
  })
  .strict();

export type CreateProcedureCatalogItemInput = z.infer<
  typeof createProcedureCatalogItemValidator
>;

export const updateProcedureCatalogItemValidator = z
  .object({
    procedure_type: z.enum(PROCEDURE_TYPES).optional(),
    description: z.string().trim().min(1).optional(),
    default_price: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type UpdateProcedureCatalogItemInput = z.infer<
  typeof updateProcedureCatalogItemValidator
>;
