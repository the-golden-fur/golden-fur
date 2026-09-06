-- M07 Health & Veterinary Management - reference seed data so the
-- consultation form's Medication / Procedure comboboxes have real rows out
-- of the box instead of an empty list.
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
-- vet_medication_catalog / vet_procedure_catalog - a short personal catalog
-- for the first seeded Veterinarian (owner-scoped tables: each vet only ever
-- sees their own rows).

insert into public.vet_medication_catalog (veterinarian_id, name, default_dose, default_price)
select vet.id, v.name, v.default_dose, v.default_price
from (
  select id from public.staff_profiles
  where role = 'Veterinarian'
  order by registered_email
  limit 1
) as vet
cross join (
  values
    ('Amoxicillin 250mg', '1 tablet BID x 7 days', 120.00),
    ('Meloxicam 1.5mg/ml', '0.1 mg/kg SID', 180.00),
    ('Apoquel 5.4mg', '1 tablet BID x 14 days', 220.00)
) as v(name, default_dose, default_price)
where not exists (
  select 1 from public.vet_medication_catalog as existing
  where existing.veterinarian_id = vet.id and existing.name = v.name
);

insert into public.vet_procedure_catalog (veterinarian_id, procedure_type, description, default_price)
select vet.id, v.procedure_type::public.procedure_type, v.description, v.default_price
from (
  select id from public.staff_profiles
  where role = 'Veterinarian'
  order by registered_email
  limit 1
) as vet
cross join (
  values
    ('Wellness Exam', 'Annual wellness check', 500.00),
    ('Vaccination', '5-in-1 (DHPPiL) booster', 850.00),
    ('Lab test', 'Complete blood count (CBC)', 950.00)
) as v(procedure_type, description, default_price)
where not exists (
  select 1 from public.vet_procedure_catalog as existing
  where existing.veterinarian_id = vet.id
    and existing.procedure_type = v.procedure_type::public.procedure_type
    and existing.description = v.description
);
