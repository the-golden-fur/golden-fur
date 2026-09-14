-- Custom change: Pet Type admin CRUD. `public.pet_type` has been a fixed
-- two-value enum ('Dog', 'Cat') since 20260712023 (created as pet_species,
-- renamed in 20260725041) - the two only columns it types are pets.pet_type
-- and breeds.pet_type. This converts it to an admin-manageable lookup table
-- (same shape/rationale as service_types, 20260809113) so staff can add a
-- custom pet type without a schema change, then repoints both columns at it
-- via a text FK and drops the now-unreferenced enum.
--
-- Unlike service_types (deactivate-only, no DELETE policy - a service type's
-- `key` drives hardcoded ServiceCategory switch logic elsewhere in the
-- booking engine, so an unused row still can't safely disappear), pet_types
-- gets a DELETE policy: a custom pet type has no such code coupling, and the
-- FK from pets/breeds already RESTRICTs the delete if it's actually in use -
-- the same "can't delete, still assigned" guard breeds' own DELETE policy
-- (20260725045) relies on, translated by the app layer's 23503 handling
-- (see breeds.service.ts's deleteBreed).

create table public.pet_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles(id),
  updated_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pet_types enable row level security;

-- Every authenticated user (staff and customers) needs this for the pet
-- profile / booking flow's pet-type field, same open-read shape as breeds
-- and service_types.
create policy "Any authenticated user can read pet types"
  on public.pet_types
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can insert pet types"
  on public.pet_types
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update pet types"
  on public.pet_types
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete pet types"
  on public.pet_types
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));

-- Seed: matches the two existing enum values exactly.
insert into public.pet_types (key, name) values
  ('Dog', 'Dog'),
  ('Cat', 'Cat');

-- ---------------------------------------------------------------------------
-- pets.pet_type: enum column -> text FK
-- ---------------------------------------------------------------------------
alter table public.pets add column pet_type_new text;

update public.pets set pet_type_new = pet_type::text;

alter table public.pets alter column pet_type_new set not null;

alter table public.pets drop column pet_type;

alter table public.pets rename column pet_type_new to pet_type;

alter table public.pets
  add constraint pets_pet_type_fkey
  foreign key (pet_type) references public.pet_types(key);

-- ---------------------------------------------------------------------------
-- breeds.pet_type: enum column -> text FK. Dropping the old enum column also
-- drops the existing unique(pet_type, name) constraint and the
-- breeds_pet_type_idx index (20260725041) - both are re-added below.
-- ---------------------------------------------------------------------------
alter table public.breeds add column pet_type_new text;

update public.breeds set pet_type_new = pet_type::text;

alter table public.breeds alter column pet_type_new set not null;

alter table public.breeds drop column pet_type;

alter table public.breeds rename column pet_type_new to pet_type;

alter table public.breeds
  add constraint breeds_pet_type_fkey
  foreign key (pet_type) references public.pet_types(key);

alter table public.breeds add constraint breeds_pet_type_name_key unique (pet_type, name);

create index breeds_pet_type_idx on public.breeds(pet_type);

-- Now unreferenced (verified via a repo-wide grep of supabase/migrations
-- immediately before writing this statement - only pets.pet_type and
-- breeds.pet_type, both converted above, ever used it).
drop type public.pet_type;
