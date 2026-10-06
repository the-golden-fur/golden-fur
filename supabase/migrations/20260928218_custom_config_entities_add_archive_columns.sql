-- Cages, pet types, breeds, services, and service types gain the same
-- "archived_at" soft-archive column already used by products, staff,
-- customers, pets, discounts, promos, packages, and branches
-- (20260731071/072, 20260922207). Until now these five could only be
-- hard-deleted (cages/pet types/breeds) or not removed at all (services,
-- service types), so the admin Config "..." menu could not offer a
-- consistent Archive action on every row.
--
-- Only archived_at is added, not is_active:
--   - pet_types, services, service_types already have is_active;
--   - cages carry their own lifecycle in `status`, and breeds have never had a
--     deactivate concept - archive is the only on/off switch for those two.
--
-- No RLS changes, same rationale as 20260731071/20260922207: every write path
-- that sets or filters on archived_at goes through the server's service-role
-- Supabase client, which bypasses RLS. The customer-facing direct reads of
-- pet_types / breeds / service_types (open `using (true)` select policies)
-- filter archived rows out client-side instead.
--
-- No new table, so the universal deleted-records-archive trigger
-- (20260913202) needs no new attachment - it already fires on the real
-- DELETE these tables' "Delete permanently" action performs.

alter table public.cages
  add column archived_at timestamptz;

alter table public.pet_types
  add column archived_at timestamptz;

alter table public.breeds
  add column archived_at timestamptz;

alter table public.services
  add column archived_at timestamptz;

alter table public.service_types
  add column archived_at timestamptz;

create index cages_archived_at_idx
  on public.cages (archived_at)
  where archived_at is not null;

create index pet_types_archived_at_idx
  on public.pet_types (archived_at)
  where archived_at is not null;

create index breeds_archived_at_idx
  on public.breeds (archived_at)
  where archived_at is not null;

create index services_archived_at_idx
  on public.services (archived_at)
  where archived_at is not null;

create index service_types_archived_at_idx
  on public.service_types (archived_at)
  where archived_at is not null;
