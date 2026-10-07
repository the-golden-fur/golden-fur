-- M07 Health & Veterinary Management - reference seed data so the
-- consultation form's Prescription/Results pickers have real rows out of
-- the box instead of an empty list.
--
-- Pure-SQL alternative to m07-veterinary.seed.ts (run via `npm run
-- seed:all`). Runs automatically on `supabase db reset` (see
-- supabase/config.toml [db.seed] sql_paths, ordered after m01's seed so
-- staff_profiles exist). Idempotent - guarded by NOT EXISTS, safe to re-run.
--
-- The two M13 promos that used to live in this file moved to
-- ../m13-maintenance/m13-maintenance.seed.sql when the seed folders were
-- renamed to match the Modules-Features module numbers.
--
-- Custom change ("My Catalog" broken into Medications/Prescriptions/Forms):
-- vet_medication_catalog no longer carries dose/frequency (moved to
-- vet_prescription_templates, seeded below); "General Consultation" is
-- seeded as the is_default = true form template - the vitals/diagnosis
-- fields that used to be fixed columns on consultations are now just this
-- ordinary template.
--
-- #117: the personal procedure catalog (vet_procedure_catalog) this file
-- used to also seed is dropped (20260929230_custom_drop_vet_procedure_catalog.sql).

insert into public.vet_medication_catalog
  (veterinarian_id, name, default_price, default_medicine_type)
select vet.id, v.name, v.default_price, v.default_medicine_type
from (
  select id from public.staff_profiles
  where role = 'Veterinarian'
  order by registered_email
  limit 1
) as vet
cross join (
  values
    ('Amoxicillin 250mg', 120.00, 'Oral'),
    ('Meloxicam 1.5mg/ml', 180.00, 'Oral'),
    ('Apoquel 5.4mg', 220.00, 'Oral')
) as v(name, default_price, default_medicine_type)
where not exists (
  select 1 from public.vet_medication_catalog as existing
  where existing.veterinarian_id = vet.id and existing.name = v.name
);

insert into public.vet_prescription_templates (veterinarian_id, name, items)
select vet.id, 'Standard Post-Surgery Recovery',
  jsonb_build_array(
    jsonb_build_object(
      'medication_catalog_id', amox.id,
      'name', 'Amoxicillin 250mg',
      'medicine_type', 'Oral',
      'dose', '1 tablet',
      'frequency', 'Twice daily',
      'duration', '7 days'
    ),
    jsonb_build_object(
      'medication_catalog_id', melox.id,
      'name', 'Meloxicam 1.5mg/ml',
      'medicine_type', 'Oral',
      'dose', '0.1 mg/kg',
      'frequency', 'Once daily',
      'duration', '3 days'
    )
  )
from (
  select id from public.staff_profiles
  where role = 'Veterinarian'
  order by registered_email
  limit 1
) as vet
join public.vet_medication_catalog as amox
  on amox.veterinarian_id = vet.id and amox.name = 'Amoxicillin 250mg'
join public.vet_medication_catalog as melox
  on melox.veterinarian_id = vet.id and melox.name = 'Meloxicam 1.5mg/ml'
where not exists (
  select 1 from public.vet_prescription_templates as existing
  where existing.veterinarian_id = vet.id
    and existing.name = 'Standard Post-Surgery Recovery'
);

insert into public.vet_consultation_form_templates (veterinarian_id, name, fields, is_default)
select vet.id, v.name, v.fields::jsonb, v.is_default
from (
  select id from public.staff_profiles
  where role = 'Veterinarian'
  order by registered_email
  limit 1
) as vet
cross join (
  values
    (
      'General Consultation',
      '[
        {"id": "temperature", "label": "Temperature", "type": "number"},
        {"id": "weight", "label": "Weight (kg)", "type": "number"},
        {"id": "heart-rate", "label": "Heart Rate", "type": "number"},
        {"id": "respiratory-rate", "label": "Respiratory Rate", "type": "number"},
        {"id": "diagnosis", "label": "Diagnosis", "type": "textarea"}
      ]',
      true
    ),
    (
      'Dental Check',
      '[
        {"id": "tartar-level", "label": "Tartar level", "type": "select", "options": ["None", "Mild", "Moderate", "Severe"]},
        {"id": "gum-condition", "label": "Gum condition", "type": "text"}
      ]',
      false
    ),
    (
      'Wellness Exam Notes',
      '[
        {"id": "general-condition", "label": "General condition", "type": "textarea"},
        {"id": "activity-level", "label": "Activity level", "type": "select", "options": ["Low", "Normal", "High"]}
      ]',
      false
    )
) as v(name, fields, is_default)
where not exists (
  select 1 from public.vet_consultation_form_templates as existing
  where existing.veterinarian_id = vet.id and existing.name = v.name
);

-- public.vet_service_catalog (20261006250): the clinic-wide list of
-- veterinary services and their usual prices the "Services done" completion
-- pop-up suggests from. One shared list, so it is guarded by name alone;
-- created_by ("added by") is the first seeded Veterinarian when there is one.
insert into public.vet_service_catalog (name, default_price, created_by)
select
  v.name,
  v.default_price,
  (
    select id from public.staff_profiles
    where role = 'Veterinarian'
    order by registered_email
    limit 1
  )
from (
  values
    ('Deworming', 350.00),
    ('Wound Cleaning & Dressing', 500.00),
    ('Dental Scaling', 2500.00),
    ('Minor Surgery', 5000.00),
    ('Major Surgery', 10000.00)
) as v(name, default_price)
where not exists (
  select 1 from public.vet_service_catalog as existing
  where existing.name = v.name
);
