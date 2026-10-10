import { z } from 'zod';

/** Custom change: curated icon allowlist shared by a medication's and a
 * consultation-form-template's optional icon - same list as
 * maintenance.validator.ts's own SERVICE_ICON_NAMES copy, kept in lockstep
 * with client/src/shared/components/IconPicker/serviceIcons.ts (that shared
 * component/icon set is reused as-is here, not a feature-specific
 * duplicate). Validated here (not just a free-text string) so a request
 * can't stash an arbitrary icon name the client-side lookup wouldn't
 * recognize. */
const VETERINARY_ICON_NAMES = [
  'Scissors',
  'Bath',
  'PawPrint',
  'Dog',
  'Cat',
  'Bone',
  'Stethoscope',
  'Syringe',
  'HeartPulse',
  'Bed',
  'Home',
  'Droplet',
  'Sparkles',
  'Package',
  'Gift',
  'Utensils',
  'Footprints',
  'ShieldCheck',
  'Calendar',
  'Clock',
  'Star',
  'Scale',
  'Brush',
  'Wind',
  'ClipboardList',
  'Users',
  'MapPin',
  'Building2',
  'Warehouse',
  'Thermometer',
] as const;
const veterinaryIconField = z.enum(VETERINARY_ICON_NAMES).nullable().optional();

const medicationInputValidator = z
  .object({
    name: z.string().min(1),
    dose: z.string().min(1),
    notes: z.string().optional(),
    // #117 prescription builder: free text, not an enum - a vet should
    // never be blocked from entering something outside the client's
    // suggested-value lists.
    medicine_type: z.string().trim().optional(),
    // How strong the product is ("250 mg") - free text.
    strength: z.string().trim().optional(),
    frequency: z.string().trim().optional(),
    duration: z.string().trim().optional(),
    // Pharmacy prescriptions: how many units are prescribed, and which
    // shared medicine-list entry this row came from - the selling price is
    // always read from that entry server-side (pharmacyCharge.service.ts),
    // never taken from the request.
    quantity: z.number().int().positive().optional(),
    // What the quantity counts ("capsules"), and how many refills.
    quantity_unit: z.string().trim().optional(),
    refills: z.number().int().min(0).optional(),
    medication_catalog_id: z.uuid().nullable().optional(),
    // No longer read - kept only so an older client that still sends a
    // per-medicine price isn't rejected by .strict().
    amount: z.number().nonnegative().optional(),
  })
  .strict();

// #117: procedureInputValidator removed alongside the Procedures section of
// the consultation form and the personal procedure catalog - see
// 20260929230_custom_drop_vet_procedure_catalog.sql's header note on what's
// kept (procedure_type enum, consultation_line_items.procedure_type) vs.
// dropped (vet_procedure_catalog) and why.

const CONSULTATION_FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'checkbox',
  'date',
  'prescription',
] as const;

/** #117: one field of a vet's reusable consultation-form template. A
 * 'select' field must carry at least one option - nothing else needs one. */
const consultationFormFieldValidator = z
  .object({
    id: z.string().min(1),
    label: z.string().trim().min(1),
    type: z.enum(CONSULTATION_FORM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .refine(
    (field) => field.type !== 'select' || (field.options?.length ?? 0) > 0,
    {
      message: 'A select field needs at least one option',
      path: ['options'],
    }
  );

export const createConsultationFormTemplateValidator = z
  .object({
    name: z.string().trim().min(1),
    fields: z.array(consultationFormFieldValidator).min(1),
    is_default: z.boolean().optional(),
    icon: veterinaryIconField,
  })
  .strict();

export type CreateConsultationFormTemplateInput = z.infer<
  typeof createConsultationFormTemplateValidator
>;

export const updateConsultationFormTemplateValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    fields: z.array(consultationFormFieldValidator).min(1).optional(),
    is_default: z.boolean().optional(),
    icon: veterinaryIconField,
  })
  .strict();

export type UpdateConsultationFormTemplateInput = z.infer<
  typeof updateConsultationFormTemplateValidator
>;

/** #117: one filled-in field of a submitted consultation form result -
 * label/type are a snapshot copied from the template at fill time, not
 * re-validated against it (the template may have changed since). Custom
 * change: `value` also accepts a medication array - a 'prescription'-type
 * field's filled-in value, same per-item shape as the top-level
 * `medications` array (medicationInputValidator). */
const consultationFormResponseFieldValidator = z
  .object({
    field_id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(CONSULTATION_FORM_FIELD_TYPES),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(medicationInputValidator),
    ]),
  })
  .strict();

const consultationFormResponseValidator = z
  .object({
    template_id: z.string().nullable(),
    template_name: z.string().min(1),
    filled_at: z.string().min(1),
    fields: z.array(consultationFormResponseFieldValidator),
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
 * Issue #66: vitals/diagnosis/medications can be entered while 'Ongoing';
 * status only ever moves Pending -> Ongoing -> Completed, one direction,
 * mirroring #64's grooming status validator. #117: `procedures` removed
 * (see consultationFormFieldValidator's header note above);
 * `form_responses` added - filling in a Result is always optional.
 * Pharmacy prescriptions: a medicine no longer needs an amount to complete
 * (its price comes from the medicine list), and `sold_at_pharmacy` says
 * where the customer is buying - true = this branch's pharmacy (billed),
 * false = somewhere else (not). `professional_fee` is optional now too -
 * the Consultation Details form no longer asks for one (the Consultation
 * service's own booking price is the visit's charge); when one is sent (the
 * queue's quick Complete still does) it becomes the visit's
 * consultation_line_items row - AC-2. So nothing gates Completion here any
 * more.
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
    form_responses: z.array(consultationFormResponseValidator).optional(),
    professional_fee: z.number().nonnegative().optional(),
    vaccination: vaccinationInputValidator.optional(),
    sold_at_pharmacy: z.boolean().optional(),
    // Vet-priced visits: what was done at the visit and what each item
    // costs, listed in the completion pop-up - billed as its own
    // transaction (serviceCharge.service.ts). Only read on Completed.
    services_done: z
      .array(
        z
          .object({
            name: z.string().trim().min(1),
            amount: z.number().nonnegative(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

export type UpdateConsultationInput = z.infer<
  typeof updateConsultationValidator
>;

/** Issue #67 (revised): the follow-up booking is created client-side through
 * the normal booking pipeline (ScheduleFollowUpModal, same POST /bookings a
 * receptionist walk-in uses) - this endpoint only links that already-created
 * booking onto the consultation. */
export const linkFollowUpValidator = z
  .object({
    booking_id: z.uuid(),
    // Why the vet wants the pet back - required, and kept on the
    // originating consultation (follow_up_reason).
    reason: z.string().trim().min(1),
  })
  .strict();

export type LinkFollowUpInput = z.infer<typeof linkFollowUpValidator>;

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

/** An uploaded image's public Storage URL (see server/src/shared/services/
 * storage/storage.service.ts and the 'vet-medication-images' bucket) - the
 * upload itself happens via its own endpoint first; this field just records
 * the resulting URL against the create/update payload. */
const medicationImageUrlField = z.string().trim().nullable().optional();

/** A vet's personal medication catalog entry - picked from later on the
 * consultation form's Medications rows instead of retyped every visit.
 * Custom change: `default_dose`/`default_frequency` removed - a medication
 * is now just a product definition (name/type/price); dose and frequency
 * are assigned per-prescription (see createPrescriptionTemplateValidator
 * below), not stored on the medicine itself. */
export const createMedicationCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1),
    default_price: z.number().nonnegative().optional(),
    default_medicine_type: z.string().trim().min(1).optional(),
    icon: veterinaryIconField,
    image_url: medicationImageUrlField,
  })
  .strict();

export type CreateMedicationCatalogItemInput = z.infer<
  typeof createMedicationCatalogItemValidator
>;

export const updateMedicationCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    default_price: z.number().nonnegative().nullable().optional(),
    default_medicine_type: z.string().trim().min(1).nullable().optional(),
    icon: veterinaryIconField,
    image_url: medicationImageUrlField,
  })
  .strict();

export type UpdateMedicationCatalogItemInput = z.infer<
  typeof updateMedicationCatalogItemValidator
>;

// #117: createProcedureCatalogItemValidator/updateProcedureCatalogItemValidator
// removed alongside the rest of the personal procedure catalog.

/** Custom change: one line of a reusable prescription template - a
 * medication (referenced by id, name/medicine_type snapshotted at save
 * time - see VetPrescriptionTemplateItem's own header note) paired with a
 * dose/frequency/duration. */
const prescriptionTemplateItemValidator = z
  .object({
    medication_catalog_id: z.string().nullable(),
    name: z.string().trim().min(1),
    medicine_type: z.string().trim().nullable().optional(),
    dose: z.string().trim().min(1),
    frequency: z.string().trim().min(1),
    duration: z.string().trim().optional(),
  })
  .strict();

export const createPrescriptionTemplateValidator = z
  .object({
    name: z.string().trim().min(1),
    items: z.array(prescriptionTemplateItemValidator).min(1),
  })
  .strict();

export type CreatePrescriptionTemplateInput = z.infer<
  typeof createPrescriptionTemplateValidator
>;

export const updatePrescriptionTemplateValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    items: z.array(prescriptionTemplateItemValidator).min(1).optional(),
  })
  .strict();

export type UpdatePrescriptionTemplateInput = z.infer<
  typeof updatePrescriptionTemplateValidator
>;

/** One entry of the clinic's shared veterinary service list - a name and its
 * usual price, suggested from in the completion pop-up. */
export const createServiceCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1),
    default_price: z.number().nonnegative(),
  })
  .strict();

export type CreateServiceCatalogItemInput = z.infer<
  typeof createServiceCatalogItemValidator
>;

export const updateServiceCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    default_price: z.number().nonnegative().optional(),
  })
  .strict();

export type UpdateServiceCatalogItemInput = z.infer<
  typeof updateServiceCatalogItemValidator
>;
