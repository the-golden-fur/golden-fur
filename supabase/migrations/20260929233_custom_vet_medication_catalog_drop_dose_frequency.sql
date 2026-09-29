-- Custom change: "making a new medication will just need the name, type,
-- price... nothing related to frequency since that belongs to
-- prescriptions" - dose and frequency move to vet_prescription_templates
-- (20260929232), which are what actually get applied to a patient's visit.
-- A bare medication definition never had a real "one true dose" anyway
-- (dose varies by patient weight/condition) - default_dose here was always
-- just a suggestion typed into a single free-text row on the consultation
-- form, which the new prescription-template flow replaces with something
-- more useful (a whole reusable dose+frequency+duration combination, not
-- just a dose).
--
-- default_medicine_type/default_price are kept - a medicine's type and
-- typical price are real, mostly-fixed properties of the product itself,
-- unlike dose/frequency.

alter table public.vet_medication_catalog
  drop column default_dose,
  drop column default_frequency;
