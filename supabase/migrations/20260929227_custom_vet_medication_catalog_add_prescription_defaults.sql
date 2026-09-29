-- Custom change (#117 prescription builder): a vet's personal medication
-- catalog entry can now also suggest a medicine type and dosage frequency,
-- the same way it already suggests a dose/price - picked up by the
-- Prescription Builder's "add from my catalog" dropdown
-- (addMedicationFromCatalog in ConsultationDetailPanel.tsx). Both nullable/
-- optional, matching default_dose/default_price - a vet is never required
-- to fill them in on a catalog entry.

alter table public.vet_medication_catalog
  add column default_medicine_type text,
  add column default_frequency text;
