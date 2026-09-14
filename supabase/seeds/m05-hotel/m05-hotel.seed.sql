-- M05 Pet Hotel - Sprint 4 Epic A branch-dependent seed data (Issue #71
-- AC-4): a handful of cages per size category, per branch, plus (custom
-- change, 20260912193) which pet type(s) each cage supports. Also seeds the
-- #79-revision food/medication reference lists (not branch-scoped, unlike
-- cages) so CatalogComboBox has real options to show out of the box instead
-- of an empty dropdown - Sprint 5 unification (#82) moved these into the
-- shared public.product_catalog table (migration 20260731067), tagged
-- category='food'|'medication', service_scope='hotel'.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered after m01's AND m02's seeds, so
-- both branches.id values and customer1@goldenfur.com exist). Idempotent -
-- guarded by NOT EXISTS / ON CONFLICT, safe to re-run.
--
-- These rows are now owned by customer1@goldenfur.com rather than global
-- (owner_customer_id NULL, "provided by the hotel") reference rows -
-- customers manage their own food/medication types, there's no more
-- hotel-provided concept. Migration 20260803085 (customer-owned catalog
-- rows) added two PARTIAL unique indexes (one scoped to owner_customer_id
-- IS NULL, one to IS NOT NULL) so two different customers - or a customer
-- and the global catalog - can reuse the same food/medication name.
-- Postgres can only infer a partial index for ON CONFLICT if the same WHERE
-- predicate is repeated in the ON CONFLICT clause itself; the clauses below
-- target product_catalog_owner_name_category_uniq (owner_customer_id IS NOT
-- NULL) to match these owned rows.

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

-- Custom change (cage pet-type support, 20260912193): most cages serve both
-- Dog and Cat; one S and one M cage each carve out a single-type exception
-- in opposite directions, and the one XL cage is Dog-only - matches
-- m05-hotel.seed.ts's CAGE_PLAN exactly. Reconciled every run (not just on
-- first cage creation), both ways: this DELETE first removes any pet type
-- not in a planned cage's list - necessary because 20260912193's own
-- backfill gives every pre-existing cage both Dog and Cat, which would
-- otherwise permanently stick to a cage meant to be narrower (e.g. S-02) -
-- then the INSERT below adds anything still missing, via NOT EXISTS, same
-- idempotency style as the cages insert above.
delete from public.cage_pet_types as cpt
using public.cages as c
join public.branches as b on b.id = c.branch_id
join (
  values
    ('S'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('S'::public.cage_size, 2, array['Cat']::text[]),
    ('M'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('M'::public.cage_size, 2, array['Dog']::text[]),
    ('L'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('L'::public.cage_size, 2, array['Dog', 'Cat']::text[]),
    ('XL'::public.cage_size, 1, array['Dog']::text[])
) as cage(size, seq, pet_types) on true
where cpt.cage_id = c.id
  and c.cage_label = b.name || '-' || cage.size::text || '-' || lpad(cage.seq::text, 2, '0')
  and not (cpt.pet_type = any (cage.pet_types));

insert into public.cage_pet_types (cage_id, pet_type)
select c.id, x.pet_type
from public.branches as b
join (
  values
    ('S'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('S'::public.cage_size, 2, array['Cat']::text[]),
    ('M'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('M'::public.cage_size, 2, array['Dog']::text[]),
    ('L'::public.cage_size, 1, array['Dog', 'Cat']::text[]),
    ('L'::public.cage_size, 2, array['Dog', 'Cat']::text[]),
    ('XL'::public.cage_size, 1, array['Dog']::text[])
) as cage(size, seq, pet_types) on true
join public.cages as c
  on c.branch_id = b.id
  and c.cage_label = b.name || '-' || cage.size::text || '-' || lpad(cage.seq::text, 2, '0')
cross join lateral unnest(cage.pet_types) as x(pet_type)
where not exists (
  select 1 from public.cage_pet_types as existing
  where existing.cage_id = c.id and existing.pet_type = x.pet_type
);

insert into public.product_catalog (name, category, service_scope, price, owner_customer_id)
select v.name, v.category, v.service_scope, v.price, c.id
from (
  values
    ('Dry Kibble - Chicken', 'food', 'hotel', 50.00),
    ('Dry Kibble - Beef', 'food', 'hotel', 50.00),
    ('Wet Food - Canned', 'food', 'hotel', 75.00),
    ('Puppy Formula', 'food', 'hotel', 60.00),
    ('Senior Formula', 'food', 'hotel', 65.00),
    ('Grain-Free Kibble', 'food', 'hotel', 90.00),
    ('Prescription Diet', 'food', 'hotel', 120.00)
) as v(name, category, service_scope, price)
cross join (
  select id from public.customer_profiles where account_email = 'customer1@goldenfur.com'
) as c
on conflict (owner_customer_id, name, category) where owner_customer_id is not null do nothing;

insert into public.product_catalog (name, category, service_scope, price, owner_customer_id)
select v.name, v.category, v.service_scope, v.price, c.id
from (
  values
    ('Amoxicillin 250mg', 'medication', 'hotel', 120.00),
    ('Rimadyl 75mg', 'medication', 'hotel', 200.00),
    ('Flea & Tick Treatment', 'medication', 'hotel', 150.00),
    ('Ear Drops', 'medication', 'hotel', 80.00),
    ('Probiotic Supplement', 'medication', 'hotel', 100.00),
    ('Antihistamine (Diphenhydramine)', 'medication', 'hotel', 60.00)
) as v(name, category, service_scope, price)
cross join (
  select id from public.customer_profiles where account_email = 'customer1@goldenfur.com'
) as c
on conflict (owner_customer_id, name, category) where owner_customer_id is not null do nothing;
