-- M13 Promos + M07 Veterinary catalog reference seed data so the Promos
-- admin page and the consultation form's Medication/Procedure comboboxes
-- have real rows out of the box instead of an empty list.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered after module-1's seed so branches +
-- staff_profiles exist). Idempotent - guarded by NOT EXISTS, safe to re-run.
--
-- A Node/TS alternative with the same shape of data lives alongside this
-- file at module-5-promos-vet-catalog.seed.ts (run via `npm run seed:all`).

-- ---------------------------------------------------------------------------
-- promos (+ promo_branch_availability) - two always-on, all-services promos,
-- condition-based (no start/end date, so promoExpiry never deactivates them),
-- available at every branch.
-- ---------------------------------------------------------------------------

insert into public.promos (name, discount_type, value, scope_type, condition_note, is_active)
select v.name, v.discount_type::public.discount_type, v.value, 'all_services', v.condition_note, true
from (
  values
    ('Loyalty Reward', 'Percentage', 10.00, 'Returning customer - 3rd visit onward'),
    ('Weekday Walk-in', 'Flat', 100.00, 'Walk-in booking, Monday to Thursday')
) as v(name, discount_type, value, condition_note)
where not exists (
  select 1 from public.promos as existing where existing.name = v.name
);

insert into public.promo_branch_availability (promo_id, branch_id, is_available)
select p.id, b.id, true
from public.promos as p
cross join public.branches as b
where p.name in ('Loyalty Reward', 'Weekday Walk-in')
  and not exists (
    select 1 from public.promo_branch_availability as existing
    where existing.promo_id = p.id and existing.branch_id = b.id
  );

-- ---------------------------------------------------------------------------
-- vet_medication_catalog / vet_procedure_catalog - a short personal catalog
-- for the first seeded Veterinarian (owner-scoped tables: each vet only ever
-- sees their own rows).
-- ---------------------------------------------------------------------------

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
