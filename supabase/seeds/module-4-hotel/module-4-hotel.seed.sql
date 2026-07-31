-- M05 Pet Hotel - Sprint 4 Epic A branch-dependent seed data (Issue #71
-- AC-4): a handful of cages per size category, per branch. Also seeds the
-- #79-revision food/medication reference lists (not branch-scoped, unlike
-- cages) so CatalogComboBox has real options to show out of the box instead
-- of an empty dropdown - Sprint 5 unification (#82) moved these into the
-- shared public.product_catalog table (migration 20260731067), tagged
-- category='food'|'medication', service_scope='hotel'.
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

insert into public.product_catalog (name, category, service_scope, price)
values
  ('Dry Kibble - Chicken', 'food', 'hotel', 50.00),
  ('Dry Kibble - Beef', 'food', 'hotel', 50.00),
  ('Wet Food - Canned', 'food', 'hotel', 75.00),
  ('Puppy Formula', 'food', 'hotel', 60.00),
  ('Senior Formula', 'food', 'hotel', 65.00),
  ('Grain-Free Kibble', 'food', 'hotel', 90.00),
  ('Prescription Diet', 'food', 'hotel', 120.00)
on conflict (name, category) do nothing;

insert into public.product_catalog (name, category, service_scope, price)
values
  ('Amoxicillin 250mg', 'medication', 'hotel', 120.00),
  ('Rimadyl 75mg', 'medication', 'hotel', 200.00),
  ('Flea & Tick Treatment', 'medication', 'hotel', 150.00),
  ('Ear Drops', 'medication', 'hotel', 80.00),
  ('Probiotic Supplement', 'medication', 'hotel', 100.00),
  ('Antihistamine (Diphenhydramine)', 'medication', 'hotel', 60.00)
on conflict (name, category) do nothing;
