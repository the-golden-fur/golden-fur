-- M05 Pet Hotel - Sprint 4 Epic A branch-dependent seed data (Issue #71
-- AC-4): a handful of cages per size category, per branch. Also seeds the
-- #79-revision food_catalog/medication_catalog reference lists (not
-- branch-scoped, unlike cages) so CatalogComboBox has real options to show
-- out of the box instead of an empty dropdown.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered after module-1's seed so branches.id values
-- exist). Idempotent - guarded by NOT EXISTS / ON CONFLICT, safe to re-run.

insert into public.cages (branch_id, cage_label, size, status)
select
  b.id,
  b.name || '-' || cage.size::text || '-' || lpad(cage.seq::text, 2, '0'),
  cage.size,
  'Available'
from public.branches as b
cross join (
  values
    ('S'::public.cage_size, 1), ('S'::public.cage_size, 2),
    ('M'::public.cage_size, 1), ('M'::public.cage_size, 2),
    ('L'::public.cage_size, 1), ('L'::public.cage_size, 2),
    ('XL'::public.cage_size, 1)
) as cage(size, seq)
where not exists (
  select 1 from public.cages as existing
  where existing.branch_id = b.id
    and existing.cage_label = b.name || '-' || cage.size::text || '-' || lpad(cage.seq::text, 2, '0')
);

insert into public.food_catalog (name, price)
values
  ('Dry Kibble - Chicken', 50.00),
  ('Dry Kibble - Beef', 50.00),
  ('Wet Food - Canned', 75.00),
  ('Puppy Formula', 60.00),
  ('Senior Formula', 65.00),
  ('Grain-Free Kibble', 90.00),
  ('Prescription Diet', 120.00)
on conflict (name) do nothing;

insert into public.medication_catalog (name, price)
values
  ('Amoxicillin 250mg', 120.00),
  ('Rimadyl 75mg', 200.00),
  ('Flea & Tick Treatment', 150.00),
  ('Ear Drops', 80.00),
  ('Probiotic Supplement', 100.00),
  ('Antihistamine (Diphenhydramine)', 60.00)
on conflict (name) do nothing;
