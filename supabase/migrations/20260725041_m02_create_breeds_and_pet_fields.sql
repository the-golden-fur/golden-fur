-- Revision Batch 1 - Epic A (#71): "Species" reads too taxonomic to
-- front-desk/customer-facing users - relabeled "Pet Type" system-wide.
-- pet_species is renamed to pet_type (same two values, same constraint,
-- label change only per Modules-Features). breeds is a new lookup table
-- backing a searchable/dropdown breed field, replacing the old free-text
-- pets.breed column. photo_url is new and optional.

alter type public.pet_species rename to pet_type;

-- ---------------------------------------------------------------------------
-- breeds
-- ---------------------------------------------------------------------------
create table public.breeds (
  id uuid primary key default gen_random_uuid(),
  pet_type public.pet_type not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (pet_type, name)
);

create index breeds_pet_type_idx on public.breeds(pet_type);

alter table public.breeds enable row level security;

-- Read-only lookup table for every authenticated user (staff and customers
-- both need it for the booking/pet-profile breed dropdown). Row-adding is
-- out of scope for #71 (seed data only) - no INSERT/UPDATE/DELETE policy is
-- created, so only the service-role client (this migration's seed, or a
-- future Admin-tooling issue) can write to it.
create policy "Any authenticated user can read breeds"
  on public.breeds
  for select
  to authenticated
  using (true);

-- Seed - a common-breeds list, not exhaustive. Admin/Superadmin ability to
-- add rows is out of scope for #71 (tracked as a follow-up if this list
-- proves incomplete in practice).
insert into public.breeds (pet_type, name) values
  ('Dog', 'Aspin (Mixed Breed)'),
  ('Dog', 'Beagle'),
  ('Dog', 'Chihuahua'),
  ('Dog', 'Dachshund'),
  ('Dog', 'French Bulldog'),
  ('Dog', 'German Shepherd'),
  ('Dog', 'Golden Retriever'),
  ('Dog', 'Labrador Retriever'),
  ('Dog', 'Poodle'),
  ('Dog', 'Pomeranian'),
  ('Dog', 'Shih Tzu'),
  ('Dog', 'Siberian Husky'),
  ('Cat', 'Domestic Shorthair (Puspin)'),
  ('Cat', 'American Shorthair'),
  ('Cat', 'British Shorthair'),
  ('Cat', 'Maine Coon'),
  ('Cat', 'Persian'),
  ('Cat', 'Ragdoll'),
  ('Cat', 'Scottish Fold'),
  ('Cat', 'Siamese');

-- ---------------------------------------------------------------------------
-- pets: species -> pet_type (rename, follows the type rename above),
-- breed_id (new, replaces breed), photo_url (new)
-- ---------------------------------------------------------------------------
alter table public.pets rename column species to pet_type;

alter table public.pets
  add column breed_id uuid references public.breeds(id),
  add column photo_url text;

-- Backfill: case-insensitive match of the outgoing free-text breed column
-- against the new breeds table, scoped by pet_type so "Poodle" on a Dog
-- doesn't accidentally match a differently-typed row (it can't, given the
-- unique(pet_type, name) constraint, but the join stays scoped for clarity).
-- Unmatched values are left NULL and reported via RAISE NOTICE, not silently
-- dropped - the pet profile form (#77) enforces breed_id as required going
-- forward, but this migration itself never blocks on an unmatched legacy
-- value.
do $$
declare
  v_pet record;
  v_breed_id uuid;
  v_unmatched_count int := 0;
begin
  for v_pet in
    select id, pet_type, breed
    from public.pets
    where breed is not null and btrim(breed) <> ''
  loop
    select id into v_breed_id
    from public.breeds
    where pet_type = v_pet.pet_type
      and lower(name) = lower(btrim(v_pet.breed))
    limit 1;

    if v_breed_id is not null then
      update public.pets set breed_id = v_breed_id where id = v_pet.id;
    else
      v_unmatched_count := v_unmatched_count + 1;
      raise notice 'pets.breed backfill: no breeds match for pet % (pet_type=%, breed=%) - left breed_id NULL for manual cleanup',
        v_pet.id, v_pet.pet_type, v_pet.breed;
    end if;
  end loop;

  raise notice 'pets.breed backfill complete: % unmatched row(s) logged above', v_unmatched_count;
end $$;

alter table public.pets drop column breed;
