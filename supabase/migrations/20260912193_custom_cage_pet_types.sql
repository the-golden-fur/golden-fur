-- Custom change: cage pet-type support (many-to-many). Cages have never
-- declared which pet type(s) they serve - only a size (cage_size, 20260727050).
-- This is deliberately a junction table, not a single pet_type column on
-- cages: a physical cage's dimensions are fixed (size stays a plain column),
-- but the same cage can house either a dog or a cat, so admins may tick more
-- than one pet type per cage.
--
-- FK's against public.pet_types(key) (20260912191), matching that migration's
-- own convention for pets.pet_type/breeds.pet_type.
--
-- "Every cage must support at least one pet type" is enforced in application
-- code (createCage/updateCage reject an empty list) - not practical to
-- enforce at the DB level across two tables with a plain FK/junction table.

create table public.cage_pet_types (
  cage_id uuid not null references public.cages(id) on delete cascade,
  pet_type text not null references public.pet_types(key),
  primary key (cage_id, pet_type)
);

create index cage_pet_types_pet_type_idx on public.cage_pet_types(pet_type);

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Every pre-existing cage keeps serving every pet type until an admin
-- deliberately narrows it - the only non-breaking default, since nothing
-- before this migration ever distinguished cages by pet type.

insert into public.cage_pet_types (cage_id, pet_type)
select id, 'Dog' from public.cages
union all
select id, 'Cat' from public.cages;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Open read for any authenticated user (customers need this for the booking
-- flow's cage-matching views, same shape as pet_types/service_types' own open
-- read policy) - writes only ever go through the server's service-role
-- client (createCage/updateCage), same as cages.status transitions already
-- do, so no insert/update/delete policy is needed here.

alter table public.cage_pet_types enable row level security;

create policy "Any authenticated user can read cage pet types"
  on public.cage_pet_types
  for select
  to authenticated
  using (true);
